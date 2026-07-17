// Proof for P3 settings/onboarding checked writes from the #508 Supabase-write debt map.
// Run: node --experimental-strip-types scripts/proof-p3-settings-checked-writes.test.ts

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DatabaseOperationError, mustWrite } from "../lib/db/checked.ts";

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

async function catchMessage(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const groupA = [
  { file: "app/api/settings/alerts/route.ts", context: "settings.alerts.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/capacity/route.ts", context: "settings.capacity.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/capacity/sync/route.ts", context: "settings.capacity_sync.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/flags/route.ts", context: "settings.flags.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/hours/route.ts", context: "settings.hours.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/identity/route.ts", context: "settings.identity.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/ops/route.ts", context: "settings.ops.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/payment/route.ts", context: "settings.payment.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/print/route.ts", context: "settings.print.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/psp/route.ts", context: "settings.psp.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/tax/route.ts", context: "settings.tax.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/settings/whatsapp/route.ts", context: "settings.whatsapp.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/onboarding/config/hours/route.ts", context: "onboarding.hours.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/onboarding/config/persona/route.ts", context: "onboarding.persona.update", pin: '.eq("id", tenant.restaurantId)' },
  { file: "app/api/onboarding/embedded-signup/route.ts", context: "onboarding.embedded_signup.update", pin: '.eq("id", restaurantId)' },
  { file: "app/api/onboarding/go-live/route.ts", context: "onboarding.go_live.update", pin: '.eq("id", restaurantId)' },
  { file: "app/api/alerts/dismiss/route.ts", context: "alerts.dismiss.update", pin: '.eq("restaurant_id", tenant.restaurantId)' },
  { file: "app/api/conversations/[id]/assignee/route.ts", context: "conversations.assignee.release", pin: '.eq("restaurant_id", tenant.restaurantId)' },
  { file: "app/api/members/[id]/route.ts", context: "members.update_role", pin: '.eq("restaurant_id", tenant.restaurantId)' },
  { file: "app/api/settings/tonight-notes/route.ts", context: "settings.tonight_notes.delete", pin: '.eq("restaurant_id", rid)' },
];

function sourceFor(file: string): string {
  return readFileSync(file, "utf8");
}

function hasCheckedWrite(source: string, context: string): boolean {
  const contextIdx = source.indexOf(`"${context}"`);
  if (contextIdx < 0) return false;
  const writeIdx = source.lastIndexOf("mustWrite<{ id: string }>", contextIdx);
  const selectIdx = source.lastIndexOf('.select("id")', contextIdx);
  const exactIdx = source.indexOf("{ exactRows: 1 }", contextIdx);
  return writeIdx >= 0 && selectIdx > writeIdx && selectIdx < contextIdx && exactIdx > contextIdx;
}

for (const site of groupA) {
  const source = sourceFor(site.file);
  ok(`${site.file} imports mustWrite`, source.includes("mustWrite"));
  ok(`${site.file} ${site.context} uses mustWrite exactRows:1`, hasCheckedWrite(source, site.context));
  ok(`${site.file} preserves tenant/record pin`, source.includes(site.pin));
}

const zeroRowMessage = await catchMessage(() =>
  mustWrite<{ id: string }>(
    { data: [], error: null },
    "proof.zero_row",
    { exactRows: 1 },
  ));
ok("mustWrite exactRows turns zero-row into KIVO_ROW_COUNT_MISMATCH", zeroRowMessage?.includes("KIVO_ROW_COUNT_MISMATCH") === true);

const pg23514 = new DatabaseOperationError("members.update_role", {
  code: "23514",
  message: "last_manager: cannot demote the last manager",
  details: "",
  hint: "",
});
ok("DatabaseOperationError exposes underlying 23514 trigger code", pg23514.code === "23514");
ok("DatabaseOperationError retains last_manager trigger message", pg23514.pgError.message.includes("last_manager"));

const membersSource = sourceFor("app/api/members/[id]/route.ts");
const memberCatchIdx = membersSource.indexOf('} catch (error) {', membersSource.indexOf('"members.update_role"'));
const lastManagerIdx = membersSource.indexOf("isLastManagerError(error)", memberCatchIdx);
const rowMismatchIdx = membersSource.indexOf('error.code === "KIVO_ROW_COUNT_MISMATCH"', memberCatchIdx);
const updateFailedIdx = membersSource.indexOf('error: "update_failed"', memberCatchIdx);
ok("members PATCH checks last_manager before row-count mismatch", memberCatchIdx >= 0 && lastManagerIdx > memberCatchIdx && lastManagerIdx < rowMismatchIdx);
ok("members PATCH maps row-count mismatch before generic 502", rowMismatchIdx > lastManagerIdx && rowMismatchIdx < updateFailedIdx);
ok("members last_manager branch returns 409", membersSource.slice(lastManagerIdx, rowMismatchIdx).includes("status: 409"));
ok("members last_manager helper inspects DatabaseOperationError.pgError", membersSource.includes('error.pgError.code === "23514"') && membersSource.includes("error.pgError.message?.includes(\"last_manager\")"));

const ticketPrintSource = sourceFor("app/api/orders/[id]/ticket-print/route.ts");
ok("ticket-print insert remains insert-based", ticketPrintSource.includes('from("order_events").insert({'));
ok("ticket-print insert has reasoned eslint disable", ticketPrintSource.includes("audit insert with explicit error response; no zero-row update hazard"));

const storefrontSource = sourceFor("app/api/storefront/orders/route.ts");
ok("storefront safety-review message remains insert-based", storefrontSource.includes('from("messages").insert({'));
ok("storefront safety-review insert has reasoned eslint disable", storefrontSource.includes("best-effort safety-review message insert; failure is logged, not a zero-row update hazard"));

const deferredKnowledge = sourceFor("app/api/knowledge/change-requests/[id]/route.ts");
const deferredProvision = sourceFor("app/api/onboarding/provision-tenant/route.ts");
ok("knowledge change-request state machine remains deferred", deferredKnowledge.includes("await admin.from(\"knowledge_change_requests\").update"));
ok("provision tenant rollback remains deferred", deferredProvision.includes('await admin.from("restaurants").delete().eq("id", restaurant.id);'));

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

const lintPaths = [
  "app/api/settings",
  "app/api/onboarding",
  "app/api/alerts/dismiss/route.ts",
  "app/api/conversations/[id]/assignee/route.ts",
  "app/api/knowledge/change-requests/[id]/route.ts",
  "app/api/members/[id]/route.ts",
  "app/api/orders/[id]/ticket-print/route.ts",
  "app/api/storefront/orders/route.ts",
];
const lintWarnings = await lintUncheckedWarnings(lintPaths);
console.log("\nP3 SCOPED UNCHECKED-WRITE WARNINGS:");
for (const warning of lintWarnings) {
  console.log(`${warning.file}:${warning.line}:${warning.column} ${warning.message}`);
}

const remainingAllowed = new Set([
  "app/api/knowledge/change-requests/[id]/route.ts",
  "app/api/onboarding/provision-tenant/route.ts",
]);
ok("scoped unchecked-write lint drops from 27 to 5", lintWarnings.length === 5);
ok("remaining unchecked-write warnings are only deferred sites", lintWarnings.every((warning) => remainingAllowed.has(warning.file)));
console.log("P3_UNCHECKED_WRITE_DROP=27->5");

console.log(`\nP3-SETTINGS-CHECKED-WRITES PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
