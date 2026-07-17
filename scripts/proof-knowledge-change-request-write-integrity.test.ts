// Knowledge change-request write-integrity proof.
// Run: node --experimental-strip-types scripts/proof-knowledge-change-request-write-integrity.test.ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DatabaseOperationError, mustWrite } from "../lib/db/checked.ts";
import { nextStatus } from "../lib/knowledge/change-request.ts";

const require = createRequire(import.meta.url);
const { ESLint } = require("eslint") as typeof import("eslint");

let pass = 0;
let fail = 0;
function ok(name: string, condition: boolean) {
  if (condition) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
}

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

const routePath = "app/api/knowledge/change-requests/[id]/route.ts";
const source = readFileSync(routePath, "utf8");

function hasMustWriteTransition(context: string): boolean {
  const contextIdx = source.indexOf(`"${context}"`);
  if (contextIdx < 0) return false;
  const mustWriteIdx = source.lastIndexOf("mustWrite<{ id: string }>", contextIdx);
  const updateIdx = source.lastIndexOf('.from("knowledge_change_requests")', contextIdx);
  const selectIdx = source.lastIndexOf('.select("id")', contextIdx);
  const exactIdx = source.indexOf("{ exactRows: 1 }", contextIdx);
  return mustWriteIdx >= 0 &&
    updateIdx > mustWriteIdx &&
    selectIdx > updateIdx &&
    selectIdx < contextIdx &&
    exactIdx > contextIdx;
}

function catchBlockAfter(context: string): string {
  const contextIdx = source.indexOf(`"${context}"`);
  const catchIdx = source.indexOf("} catch (error) {", contextIdx);
  const nextAuditIdx = source.indexOf("await recordAuditEvent", catchIdx);
  return catchIdx >= 0 && nextAuditIdx > catchIdx ? source.slice(catchIdx, nextAuditIdx) : "";
}

ok("imports mustWrite and DatabaseOperationError", source.includes("DatabaseOperationError, mustWrite"));
ok("apply transition uses mustWrite exactRows:1", hasMustWriteTransition("knowledge_change.apply_status"));
ok("approve/reject transition uses mustWrite exactRows:1", hasMustWriteTransition("knowledge_change.review_status"));

const applyCatch = catchBlockAfter("knowledge_change.apply_status");
const reviewCatch = catchBlockAfter("knowledge_change.review_status");
for (const [label, block] of [["apply", applyCatch], ["approve/reject", reviewCatch]] as const) {
  const rowMismatchIdx = block.indexOf("isRowCountMismatch(error)");
  const notFoundIdx = block.indexOf('error: "not_found"');
  const updateFailedIdx = block.indexOf('error: "update_failed"');
  ok(`${label}: row-count mismatch maps to 404`, rowMismatchIdx >= 0 && notFoundIdx > rowMismatchIdx && block.includes("status: 404"));
  ok(`${label}: other update errors still map to 502`, updateFailedIdx > notFoundIdx && block.includes("status: 502"));
}

const zeroRow = await captureError(() =>
  mustWrite<{ id: string }>(
    { data: [], error: null },
    "knowledge_change.proof_zero",
    { exactRows: 1 },
  ));
ok("simulated zero-row write throws DatabaseOperationError", zeroRow instanceof DatabaseOperationError);
ok("simulated zero-row write has KIVO_ROW_COUNT_MISMATCH code",
  zeroRow instanceof DatabaseOperationError && zeroRow.code === "KIVO_ROW_COUNT_MISMATCH");

const pgError = await captureError(() =>
  mustWrite<{ id: string }>(
    { data: null, error: { code: "42501", message: "permission denied", details: "", hint: "" } },
    "knowledge_change.proof_db_error",
    { exactRows: 1 },
  ));
ok("simulated DB error keeps original Postgres code",
  pgError instanceof DatabaseOperationError && pgError.code === "42501");

const badPatchIdx = source.indexOf("if (!built.ok)");
const badPatchApplyErrorIdx = source.indexOf("apply_error: built.reason.slice", badPatchIdx);
const tryIdx = source.indexOf("try {", badPatchIdx);
const catchIdx = source.indexOf("} catch (e) {", tryIdx);
const catchApplyErrorIdx = source.indexOf("apply_error: msg.slice", catchIdx);
const statusAppliedIdx = source.indexOf('"knowledge_change.apply_status"', catchIdx);
ok("unappliable apply_error annotation returns before knowledge mutation/status transition",
  badPatchIdx >= 0 && badPatchApplyErrorIdx > badPatchIdx && badPatchApplyErrorIdx < tryIdx && source.indexOf('error: "unappliable"', badPatchApplyErrorIdx) < tryIdx);
ok("apply_failed apply_error annotation stays before applied status write",
  catchIdx >= 0 && catchApplyErrorIdx > catchIdx && catchApplyErrorIdx < statusAppliedIdx && source.indexOf('error: "apply_failed"', catchApplyErrorIdx) < statusAppliedIdx);
ok("both apply_error annotations have reasoned eslint disables",
  (source.match(/best-effort apply_error annotation on an already-failing path; zero-row must not throw over the original error/g) ?? []).length === 2);

const noopIdx = source.indexOf("if (trans.noop)");
ok("idempotent apply no-op returns before buildPatch and status write",
  noopIdx >= 0 && noopIdx < source.indexOf("const built = buildPatch") && noopIdx < statusAppliedIdx);

ok("state machine: approve proposed -> approved", (() => {
  const trans = nextStatus("proposed", "approve");
  return trans.ok && trans.to === "approved" && !trans.noop;
})());
ok("state machine: reject proposed -> rejected", (() => {
  const trans = nextStatus("proposed", "reject");
  return trans.ok && trans.to === "rejected" && !trans.noop;
})());
ok("state machine: apply approved -> applied", (() => {
  const trans = nextStatus("approved", "apply");
  return trans.ok && trans.to === "applied" && !trans.noop;
})());
ok("state machine: applied -> applied is idempotent no-op", (() => {
  const trans = nextStatus("applied", "apply");
  return trans.ok && trans.to === "applied" && trans.noop === true;
})());
ok("state machine: illegal transition still rejected", !nextStatus("proposed", "apply").ok);

const eslint = new ESLint({ cwd: process.cwd(), extensions: [".ts"] });
const lintResults = await eslint.lintFiles([routePath]);
const lintWarnings = lintResults.flatMap((result) =>
  result.messages
    .filter((message) => message.ruleId === "local-rules/no-unchecked-supabase-write")
    .map((message) => `${result.filePath.replace(`${process.cwd()}/`, "")}:${message.line}:${message.column} ${message.message}`)
);

console.log("\nKNOWLEDGE CHANGE-REQUEST UNCHECKED-WRITE WARNINGS:");
for (const warning of lintWarnings) console.log(warning);
ok("lint warning count for knowledge change-request route drops 4 -> 0", lintWarnings.length === 0);

console.log(`\nKNOWLEDGE-CHANGE-WRITE-INTEGRITY: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
