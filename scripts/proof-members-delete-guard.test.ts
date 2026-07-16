// FR-026 proof: members DELETE is manager-gated, tenant-scoped, checked, and
// protected by a prepare-only DB trigger against deleting the last manager.
//
// Run:
//   node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-members-delete-guard.test.ts

import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { DatabaseOperationError, maybeSucceed, mustWrite } from "../lib/db/checked.ts";

type MemberRow = { id: string; restaurant_id: string; role: string; user_id: string };
type Filter = { op: "eq" | "neq"; key: string; value: unknown };
type Call = { table: string; op: string; filters: Filter[]; count?: boolean };

let pass = 0;
let fail = 0;

function ok(name: string, condition: boolean): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }

  fail += 1;
  console.error(`FAIL ${name}`);
}

class NextResponse {
  body: string | null;
  status: number;
  _json: unknown;

  constructor(body: string | null = null, init: { status?: number } = {}) {
    this.body = body;
    this.status = init.status ?? 200;
  }

  static json(obj: unknown, init: { status?: number } = {}) {
    const response = new NextResponse(JSON.stringify(obj), init);
    response._json = obj;
    return response;
  }

  async json() {
    return this._json;
  }
}

function matches(row: MemberRow, filters: Filter[]): boolean {
  return filters.every((filter) => {
    if (filter.op === "eq") return (row as Record<string, unknown>)[filter.key] === filter.value;
    if (filter.op === "neq") return (row as Record<string, unknown>)[filter.key] !== filter.value;
    return true;
  });
}

function makeDb(opts: { members: MemberRow[]; deleteError?: { code: string; message: string } }) {
  const state = {
    members: [...opts.members],
    calls: [] as Call[],
    auditEvents: [] as Array<Record<string, unknown>>,
  };

  function from(table: string) {
    const q = {
      table,
      op: "select",
      filters: [] as Filter[],
      count: false,
      head: false,
      columns: "",
    };
    const api: Record<string, unknown> = {};

    function rows(): MemberRow[] {
      if (table !== "members") return [];
      return state.members.filter((row) => matches(row, q.filters));
    }

    function recordCall() {
      state.calls.push({ table: q.table, op: q.op, filters: [...q.filters], count: q.count });
    }

    function resultRows(found: MemberRow[]) {
      if (q.columns.trim() === "id") return found.map((row) => ({ id: row.id }));
      return found;
    }

    function execute(single = false) {
      recordCall();
      const found = rows();

      if (q.op === "delete") {
        if (opts.deleteError) {
          return {
            data: null,
            error: { code: opts.deleteError.code, message: opts.deleteError.message, details: "", hint: "" },
          };
        }
        state.members = state.members.filter((row) => !matches(row, q.filters));
        return { data: resultRows(found), error: null };
      }

      if (q.count && q.head) {
        return { data: null, error: null, count: found.length };
      }

      return { data: single ? (found[0] ?? null) : resultRows(found), error: null };
    }

    api.select = (columns = "*", options?: { count?: string; head?: boolean }) => {
      q.columns = String(columns);
      q.count = options?.count === "exact";
      q.head = options?.head === true;
      return api;
    };
    api.delete = () => {
      q.op = "delete";
      return api;
    };
    api.eq = (key: string, value: unknown) => {
      q.filters.push({ op: "eq", key, value });
      return api;
    };
    api.neq = (key: string, value: unknown) => {
      q.filters.push({ op: "neq", key, value });
      return api;
    };
    api.maybeSingle = async () => execute(true);
    api.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(execute(false)).then(resolve, reject);

    return api;
  }

  return { client: { from }, state };
}

function loadDeleteRoute(args: {
  members: MemberRow[];
  tenantRole: "manager" | "operation";
  tenantRestaurantId?: string;
  deleteError?: { code: string; message: string };
}) {
  const source = readFileSync("app/api/members/[id]/route.ts", "utf8");
  const runnable = source
    .replace(/^import .*$/gm, "")
    .replace("export const runtime = \"nodejs\";", "const runtime = \"nodejs\";")
    .replace("export async function PATCH", "async function PATCH")
    .replace("export async function DELETE", "async function DELETE")
    + "\nglobalThis.__DELETE = DELETE;\n";
  const js = ts.transpileModule(runnable, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const fake = makeDb({ members: args.members, deleteError: args.deleteError });
  const context = {
    console,
    NextResponse,
    DatabaseOperationError,
    maybeSucceed,
    mustWrite,
    createClient: () => fake.client,
    requireTenant: async () => ({
      ok: true,
      tenant: {
        restaurantId: args.tenantRestaurantId ?? "tenant-a",
        userId: "actor-user",
        role: args.tenantRole,
      },
    }),
    createAdminClient: () => ({}),
    recordAuditEvent: async (_admin: unknown, event: Record<string, unknown>) => {
      fake.state.auditEvents.push(event);
    },
    Date,
    globalThis: {} as Record<string, unknown>,
  };

  vm.runInNewContext(js, context);
  const del = context.globalThis.__DELETE as (
    req: Request,
    ctx: { params: { id: string } },
  ) => Promise<NextResponse>;

  return {
    state: fake.state,
    call: (id: string) => del(new Request("http://local.test/api/members/" + id, { method: "DELETE" }), { params: { id } }),
  };
}

const managerA: MemberRow = { id: "mgr-a", restaurant_id: "tenant-a", role: "manager", user_id: "user-mgr-a" };
const managerB: MemberRow = { id: "mgr-b", restaurant_id: "tenant-a", role: "manager", user_id: "user-mgr-b" };
const operationA: MemberRow = { id: "op-a", restaurant_id: "tenant-a", role: "operation", user_id: "user-op-a" };
const operationB: MemberRow = { id: "op-b", restaurant_id: "tenant-b", role: "operation", user_id: "user-op-b" };

const success = loadDeleteRoute({ members: [managerA, operationA], tenantRole: "manager" });
const successRes = await success.call("op-a");
const successBody = await successRes.json() as Record<string, unknown>;
const successDelete = success.state.calls.find((call) => call.op === "delete");
ok("manager can delete an operation member", successRes.status === 200 && successBody.ok === true);
ok("delete removes the target member", !success.state.members.some((member) => member.id === "op-a"));
ok("delete is tenant-pinned by id and restaurant_id",
  successDelete?.filters.some((filter) => filter.op === "eq" && filter.key === "id" && filter.value === "op-a") === true &&
  successDelete?.filters.some((filter) => filter.op === "eq" && filter.key === "restaurant_id" && filter.value === "tenant-a") === true);

const forbidden = loadDeleteRoute({ members: [managerA, operationA], tenantRole: "operation" });
const forbiddenRes = await forbidden.call("op-a");
const forbiddenBody = await forbiddenRes.json() as Record<string, unknown>;
ok("operation member cannot delete team members", forbiddenRes.status === 403 && forbiddenBody.error === "forbidden");
ok("forbidden delete performs no member query or write", forbidden.state.calls.length === 0);

const crossTenant = loadDeleteRoute({ members: [managerA, operationB], tenantRole: "manager" });
const crossRes = await crossTenant.call("op-b");
const crossBody = await crossRes.json() as Record<string, unknown>;
ok("cross-tenant target returns 404", crossRes.status === 404 && crossBody.error === "not_found");
ok("cross-tenant target is not deleted", crossTenant.state.members.some((member) => member.id === "op-b"));
ok("cross-tenant delete never reaches write", crossTenant.state.calls.every((call) => call.op !== "delete"));

const lastManager = loadDeleteRoute({ members: [managerA, operationA], tenantRole: "manager" });
const lastRes = await lastManager.call("mgr-a");
const lastBody = await lastRes.json() as Record<string, unknown>;
ok("deleting the last manager returns friendly 409", lastRes.status === 409 && lastBody.error === "last_manager");
ok("last-manager pre-check does not reach delete write", lastManager.state.calls.every((call) => call.op !== "delete"));

const triggerBackstop = loadDeleteRoute({
  members: [managerA, managerB],
  tenantRole: "manager",
  deleteError: { code: "23514", message: "last_manager: a restaurant must keep at least one manager" },
});
const triggerRes = await triggerBackstop.call("mgr-a");
const triggerBody = await triggerRes.json() as Record<string, unknown>;
ok("trigger last_manager error maps to 409", triggerRes.status === 409 && triggerBody.error === "last_manager");
ok("trigger failure does not remove the manager in the mocked DB", triggerBackstop.state.members.some((member) => member.id === "mgr-a"));

const route = readFileSync("app/api/members/[id]/route.ts", "utf8");
ok("route uses maybeSucceed for target ownership", /maybeSucceed<[\s\S]*?from\("members"\)[\s\S]*?eq\("id", params\.id\)[\s\S]*?eq\("restaurant_id", tenant\.restaurantId\)[\s\S]*?maybeSingle\(\)/.test(route));
ok("route uses mustWrite with exactRows 1 on delete", /mustWrite<[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id", params\.id\)[\s\S]*?\.eq\("restaurant_id", tenant\.restaurantId\)[\s\S]*?\{\s*exactRows: 1\s*\}/.test(route));
ok("route pre-check counts other managers, excluding the deleted row", /\.eq\("role", "manager"\)[\s\S]*?\.neq\("id", params\.id\)/.test(route));

const migration = readFileSync("supabase/migrations/0094_members_last_manager_delete_guard.sql", "utf8");
ok("migration is prepare-only", /PREPARE-ONLY/.test(migration));
ok("migration uses separate DELETE trigger function", /create or replace function public\.enforce_min_one_manager_on_delete\(\)/.test(migration));
ok("DELETE trigger is BEFORE DELETE on public.members", /create trigger trg_enforce_min_one_manager_on_delete\s*before delete on public\.members\s*for each row\s*execute function public\.enforce_min_one_manager_on_delete\(\)/.test(migration));
ok("DELETE trigger locks tenant manager rows FOR UPDATE",
  /from public\.members[\s\S]*?where restaurant_id = old\.restaurant_id and role = 'manager'[\s\S]*?for update/.test(migration));
ok("DELETE trigger uses OLD only, no NEW reference", /old\.role = 'manager'/.test(migration) && !/new\.role/i.test(migration));
ok("DELETE trigger re-count excludes the row being deleted", /and id <> old\.id/.test(migration));
ok("DELETE trigger raises when deleting the only manager leaves zero", /if v_remaining_mgr_count <= 0 then[\s\S]*?raise exception 'last_manager/.test(migration));
ok("DELETE trigger permits a two-manager delete to leave one manager", !/v_remaining_mgr_count <= 1/.test(migration));

console.log(`\nMEMBERS-DELETE-GUARD PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
