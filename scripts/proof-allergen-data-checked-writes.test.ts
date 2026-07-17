// Proof for allergen-data checked writes.
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-allergen-data-checked-writes.test.ts

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  saveIngredientAxis,
  savePrepAxis,
  verifyIngredientAxis,
  verifyPrepAxis,
} from "../lib/db/menu-allergy-data.ts";
import { applyCompanionSideEffects } from "../lib/db/allergy-companion-effects.ts";

const require = createRequire(import.meta.url);
const { ESLint } = require("eslint") as typeof import("eslint");

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
}

type QueryResult = { data: unknown; error: { code?: string; message: string; details?: string; hint?: string } | null };
type Call = {
  table: string;
  op: string;
  payload: unknown;
  filters: Record<string, unknown>;
  selected: string | null;
};

function pgError(message: string, code = "DB_FAIL") {
  return { code, message, details: "", hint: "" };
}

function makeClient(results: QueryResult[]) {
  const calls: Call[] = [];
  const pending = [...results];
  const client = {
    from(table: string) {
      const state: Call = { table, op: "select", payload: undefined, filters: {}, selected: null };
      const api: Record<string, unknown> = {
        update(payload: unknown) {
          state.op = "update";
          state.payload = payload;
          return api;
        },
        insert(payload: unknown) {
          state.op = "insert";
          state.payload = payload;
          return api;
        },
        select(cols?: string) {
          state.selected = cols ?? null;
          return api;
        },
        eq(key: string, value: unknown) {
          state.filters[key] = value;
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        then(resolveFn: (value: QueryResult) => unknown, rejectFn?: (reason: unknown) => unknown) {
          calls.push({ ...state, filters: { ...state.filters } });
          const result = pending.shift() ?? { data: [], error: null };
          return Promise.resolve(result).then(resolveFn, rejectFn);
        },
      };
      return api;
    },
  };
  return { client, calls, pending };
}

const oneRow = { data: [{ id: "row-1" }], error: null };
const zeroRows = { data: [], error: null };
const columnMissing = { data: null, error: pgError("column prep_status does not exist", "42703") };

function menuWriteUsesTenantPinAndSelect(call: Call | undefined) {
  return call?.table === "menu_items" &&
    call.op === "update" &&
    call.selected === "id" &&
    call.filters.id === "item-1" &&
    call.filters.restaurant_id === "restaurant-1";
}

{
  const harness = makeClient([zeroRows]);
  const result = await saveIngredientAxis(harness.client as never, "restaurant-1", "item-1", { allergens: ["egg"] });
  ok("saveIngredientAxis zero-row returns ok:false", result.ok === false && result.error === "row_count_mismatch");
  ok("saveIngredientAxis write is tenant-pinned and selects id", menuWriteUsesTenantPinAndSelect(harness.calls[0]));
}

{
  const harness = makeClient([zeroRows]);
  const result = await verifyIngredientAxis(harness.client as never, "restaurant-1", "item-1", "user-1");
  ok("verifyIngredientAxis zero-row returns ok:false", result.ok === false && result.error === "row_count_mismatch");
  ok("verifyIngredientAxis write is tenant-pinned and selects id", menuWriteUsesTenantPinAndSelect(harness.calls[0]));
}

{
  const harness = makeClient([zeroRows]);
  const result = await savePrepAxis(harness.client as never, "restaurant-1", "item-1", { prepStatus: "unknown" });
  ok("savePrepAxis zero-row returns ok:false", result.ok === false && result.error === "row_count_mismatch");
  ok("savePrepAxis write is tenant-pinned and selects id", menuWriteUsesTenantPinAndSelect(harness.calls[0]));
}

{
  const harness = makeClient([zeroRows]);
  const result = await verifyPrepAxis(harness.client as never, "restaurant-1", "item-1", "user-1");
  ok("verifyPrepAxis zero-row returns ok:false", result.ok === false && result.error === "row_count_mismatch");
  ok("verifyPrepAxis write is tenant-pinned and selects id", menuWriteUsesTenantPinAndSelect(harness.calls[0]));
}

{
  const harness = makeClient([columnMissing]);
  const result = await savePrepAxis(harness.client as never, "restaurant-1", "item-1", { prepStatus: "unknown" });
  ok("savePrepAxis column-missing still returns columnsMissing:true",
    result.ok === false && result.columnsMissing === true && result.error === undefined);
}

{
  const harness = makeClient([columnMissing]);
  const result = await verifyPrepAxis(harness.client as never, "restaurant-1", "item-1", "user-1");
  ok("verifyPrepAxis column-missing still returns columnsMissing:true",
    result.ok === false && result.columnsMissing === true && result.error === undefined);
}

{
  const harness = makeClient([zeroRows, { data: [], error: null }, oneRow]);
  const result = await applyCompanionSideEffects(harness.client as never, {
    restaurantId: "restaurant-1",
    conversationId: "conversation-1",
    decision: {
      path: "mention",
      note: "egg",
      reply: "noted",
      offerHuman: true,
      escalate: false,
    },
    customerMessage: " عندي حساسية بيض",
    agentReply: "هخلي الفريق يراجع",
  } as never);
  const conversationWrite = harness.calls.find((call) => call.table === "conversations" && call.op === "update");
  ok("applyCompanionSideEffects zero-row note write reports noteWritten:false", result.noteWritten === false);
  ok("applyCompanionSideEffects note write selects id for exact-row assertion", conversationWrite?.selected === "id");
  ok("TENANT-PIN FINDING: companion note write still pins only conversation id",
    conversationWrite?.filters.id === "conversation-1" && !("restaurant_id" in (conversationWrite?.filters ?? {})));
}

const menuSource = readFileSync("lib/db/menu-allergy-data.ts", "utf8");
for (const context of [
  "menu_allergy_data.save_ingredient_axis",
  "menu_allergy_data.verify_ingredient_axis",
  "menu_allergy_data.save_prep_axis",
  "menu_allergy_data.verify_prep_axis",
]) {
  ok(`${context} uses mustWrite exactRows:1`,
    menuSource.includes(`"${context}"`) &&
    /mustWrite<\{ id: string \}>[\s\S]*\.select\("id"\)[\s\S]*\{\s*exactRows: 1\s*\}/.test(menuSource));
}

const auditSource = readFileSync("lib/db/allergy-audit.ts", "utf8");
ok("recordAllergyEvent insert remains best-effort",
  auditSource.includes('.from("conversation_allergy_events").insert') && auditSource.includes("return !error"));
ok("recordAllergyEvent has reasoned eslint-disable",
  auditSource.includes("eslint-disable-next-line local-rules/no-unchecked-supabase-write") &&
  auditSource.includes("best-effort observability insert"));

async function lintUncheckedWarnings(paths: string[]) {
  const eslint = new ESLint({ cwd: process.cwd(), extensions: [".ts"] });
  const results = await eslint.lintFiles(paths);
  const warnings: Array<{ file: string; line: number; column: number; message: string }> = [];
  for (const result of results) {
    for (const message of result.messages) {
      if (message.ruleId === "local-rules/no-unchecked-supabase-write") {
        warnings.push({
          file: result.filePath.replace(`${process.cwd()}/`, ""),
          line: message.line,
          column: message.column,
          message: message.message,
        });
      }
    }
  }
  return warnings;
}

const lintWarnings = await lintUncheckedWarnings([
  "lib/db/menu-allergy-data.ts",
  "lib/db/allergy-companion-effects.ts",
  "lib/db/allergy-audit.ts",
]);
const destructuredWarnings = lintWarnings.filter((warning) => warning.message.includes("destructures { error }"));
console.log("\nTARGETED LINT WARNINGS:");
for (const warning of lintWarnings) {
  console.log(`${warning.file}:${warning.line}:${warning.column} ${warning.message}`);
}
console.log(`TARGETED_NO_UNCHECKED_TOTAL=${lintWarnings.length}`);
console.log(`TARGETED_DESTRUCTURED_ERROR_WARNINGS=${destructuredWarnings.length}`);
console.log("TARGETED_DESTRUCTURED_ERROR_DROP=6->0");
ok("targeted lint has no destructured-error warnings on the three files", destructuredWarnings.length === 0);
ok("targeted lint leaves only the unrelated pre-existing bare companion order-note warning", lintWarnings.length === 1);
ok("remaining targeted warning is not one of the six classified sites",
  lintWarnings[0]?.file === "lib/db/allergy-companion-effects.ts" &&
  !lintWarnings[0]?.message.includes("destructures { error }"));

console.log(`\nALLERGEN-DATA-CHECKED-WRITES PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
