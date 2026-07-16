// Proof: lib/db/payments.ts no longer has false-success Supabase writes, and
// the local ESLint guard surfaces bare unchecked writes as warnings.
//
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-payments-checked-writes.test.ts

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseOperationError } from "../lib/db/checked.ts";
import { insertSessionDb, updateSessionStatusDb } from "../lib/db/payments.ts";
import type { PaymentSession } from "../lib/types.ts";

type PgError = { code: string; message: string; details: string; hint: string };
type DbResult = { data: unknown; error: PgError | null };
type Step = { op: "insert" | "update"; result: DbResult };
type Call = {
  table: string;
  op: "insert" | "update";
  row?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  filters: Array<{ key: string; value: unknown }>;
  selected?: string;
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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

function pgError(message: string, code = "XX000"): PgError {
  return { code, message, details: "", hint: "" };
}

function sampleSession(overrides: Partial<PaymentSession> = {}): PaymentSession {
  return {
    id: "sess_1",
    orderId: "order_1",
    orderNumber: "1001",
    conversationId: "conv_1",
    customerName: "Customer",
    customerPhone: "+966500000000",
    amount: 42,
    currency: "SAR",
    status: "created",
    provider: "mock",
    method: "mada",
    checkoutUrl: "https://pay.local/sess_1",
    expiresAt: Date.now() + 60_000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
    ...overrides,
  };
}

function makeClient(steps: Step[]) {
  const pending = [...steps];
  const calls: Call[] = [];

  function next(op: Step["op"]): DbResult {
    const step = pending.shift();
    if (!step) throw new Error(`unexpected ${op}: no scripted DB result`);
    if (step.op !== op) throw new Error(`unexpected ${op}: next scripted op is ${step.op}`);
    return step.result;
  }

  const client = {
    from(table: string) {
      const state: Call = { table, op: "insert", filters: [] };
      const builder: Record<string, unknown> = {};

      builder.insert = (row: Record<string, unknown>) => {
        state.op = "insert";
        state.row = row;
        calls.push({ ...state, filters: [...state.filters] });
        return Promise.resolve(next("insert"));
      };

      builder.update = (payload: Record<string, unknown>) => {
        state.op = "update";
        state.payload = payload;
        return builder;
      };

      builder.eq = (key: string, value: unknown) => {
        state.filters.push({ key, value });
        return builder;
      };

      builder.select = (selected: string) => {
        state.selected = selected;
        calls.push({ ...state, filters: [...state.filters] });
        return Promise.resolve(next("update"));
      };

      return builder;
    },
  };

  return { client, calls, pending };
}

async function catches(fn: () => Promise<void>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

const primaryInsert = makeClient([{ op: "insert", result: { data: null, error: null } }]);
await insertSessionDb(primaryInsert.client as never, "restaurant_1", sampleSession());
ok("insertSessionDb primary success returns normally", primaryInsert.calls.length === 1 && primaryInsert.pending.length === 0);

const retrySuccess = makeClient([
  { op: "insert", result: { data: null, error: pgError("violates foreign key constraint") } },
  { op: "insert", result: { data: null, error: null } },
]);
await insertSessionDb(retrySuccess.client as never, "restaurant_1", sampleSession());
ok("insertSessionDb FK retry path still retries once then succeeds", retrySuccess.calls.length === 2 && retrySuccess.pending.length === 0);

const retryFailure = makeClient([
  { op: "insert", result: { data: null, error: pgError("violates foreign key constraint") } },
  { op: "insert", result: { data: null, error: pgError("retry insert rejected") } },
]);
const retryError = await catches(() => insertSessionDb(retryFailure.client as never, "restaurant_1", sampleSession()));
ok("insertSessionDb retry failure throws instead of false success",
  retryError !== null && String((retryError as { message?: unknown }).message ?? retryError).includes("retry insert rejected"));

const updateSuccess = makeClient([{ op: "update", result: { data: [{ id: "sess_1" }], error: null } }]);
await updateSessionStatusDb(updateSuccess.client as never, "sess_1", "paid", "mada");
const updateCall = updateSuccess.calls[0];
ok("updateSessionStatusDb success returns normally", updateSuccess.pending.length === 0);
ok("updateSessionStatusDb uses update scoped by id", updateCall?.op === "update" && updateCall.filters.some((filter) => filter.key === "id" && filter.value === "sess_1"));
ok("updateSessionStatusDb requests returned id for row-count assertion", updateCall?.selected === "id");

const updateDbError = makeClient([{ op: "update", result: { data: null, error: pgError("status update rejected", "42501") } }]);
const statusError = await catches(() => updateSessionStatusDb(updateDbError.client as never, "sess_1", "failed"));
ok("updateSessionStatusDb DB error throws DatabaseOperationError", statusError instanceof DatabaseOperationError);

const updateZeroRows = makeClient([{ op: "update", result: { data: [], error: null } }]);
const zeroRowError = await catches(() => updateSessionStatusDb(updateZeroRows.client as never, "missing_sess", "paid"));
ok("updateSessionStatusDb zero-row update throws DatabaseOperationError", zeroRowError instanceof DatabaseOperationError);
ok("zero-row error uses row-count mismatch code", (zeroRowError as DatabaseOperationError | null)?.code === "KIVO_ROW_COUNT_MISMATCH");

function runEslintFixture(): { output: string; status: number | null } {
  const tmp = mkdtempSync(join(tmpdir(), "kivo-eslint-proof-"));
  const fixtureDir = join(tmp, "lib", "db");
  mkdirSync(fixtureDir, { recursive: true });
  const barePath = join(fixtureDir, "bare-unchecked-write.js");
  const wrappedPath = join(fixtureDir, "wrapped-write.js");

  writeFileSync(barePath, `
async function bad(db) {
  await db.from("payment_sessions").update({ status: "paid" }).eq("id", "sess_1");
}
`, "utf8");

  writeFileSync(wrappedPath, `
async function good(db, mustWrite) {
  await mustWrite(
    db.from("payment_sessions").update({ status: "paid" }).eq("id", "sess_1").select("id"),
    "payment_sessions.test",
    { exactRows: 1 },
  );
}
`, "utf8");

  try {
    const eslintBin = join(ROOT, "node_modules", "eslint", "bin", "eslint.js");
    const args = [
      eslintBin,
      "--config",
      join(ROOT, ".eslintrc.json"),
      "--resolve-plugins-relative-to",
      ROOT,
      barePath,
      wrappedPath,
    ];
    const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    console.log("\nESLINT FIXTURE COMMAND:");
    console.log(`${process.execPath} ${args.join(" ")}`);
    console.log("\nESLINT FIXTURE OUTPUT:");
    console.log(output.trim() || "(no output)");
    return { output, status: result.status };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const lint = runEslintFixture();
ok("eslint fixture exits successfully with warn-level rule", lint.status === 0);
ok("unchecked Supabase write fixture emits local rule warning",
  lint.output.includes("bare-unchecked-write.js") &&
  lint.output.includes("local-rules/no-unchecked-supabase-write"));
ok("mustWrite-wrapped fixture does not emit a warning", !lint.output.includes("wrapped-write.js"));

console.log(`\nPAYMENTS-CHECKED-WRITES PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
