// ============================================================================
// WO-ALLERGY-NOTE-DURABILITY proof — the kitchen note the agent PROMISES is the
// kitchen note the database KEEPS, and every write of it can fail visibly and is
// pinned to its tenant.
//
// Two defects are pinned closed here:
//
//   A. PROMISE WITHOUT A WRITE. forcedAllergenSafetyResult (the flag-OFF
//      deterministic allergen gate) replies «سجّلت الملاحظة للمطبخ» — "I recorded
//      the note for the kitchen". On that branch companionDecision stays null, so
//      applyCompanionSideEffects never runs, and the allergy_simple ticket write is
//      flag-gated OFF: NOTHING wrote conversations.allergy_note. order-create then
//      copied an empty note and the kitchen ticket carried no allergen at all.
//
//   B. WRITES THAT CANNOT FAIL VISIBLY, AND ARE NOT TENANT-SCOPED. supabase-js
//      RETURNS { error }; it does not throw. So `try { await admin.from(...)
//      .update(...) } catch {}` is unreachable-catch: a rejected write, a zero-row
//      write, and a write against another tenant's row all looked like success.
//
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/proof-allergy-note-durability.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { applyCompanionSideEffects } from "../lib/db/allergy-companion-effects.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) pass++;
  else {
    fail++;
    console.error("  ✗ FAIL:", name);
  }
};

const ct = read("lib/ai/customer-turn.ts");
const eff = read("lib/db/allergy-companion-effects.ts");
const oc = read("lib/db/orders-create.ts");

// ══ A — the flag-OFF allergen gate PERSISTS the note it promises ══════════════
{
  const BRANCH = "} else if (combinedAllergenHit.fired && !companionOn && !allergySimpleOn) {";
  const branchStart = ct.indexOf(BRANCH);
  const branchEnd = ct.indexOf("} else if (enterCompanion) {", branchStart + 1);
  const branch = branchStart >= 0 && branchEnd > branchStart ? ct.slice(branchStart, branchEnd) : "";

  ok("A1: the flag-OFF deterministic allergen branch still exists", branchStart >= 0 && branch.length > 0);
  ok("A1: it still dispatches forcedAllergenSafetyResult with the gate's term",
    /forcedAllergenSafetyResult\(\s*combinedAllergenHit\.term/.test(branch));

  // The promise and the write are coupled: if the frozen reply keeps saying "recorded
  // for the kitchen", the branch must keep writing it.
  const forced = ct.slice(ct.indexOf("function forcedAllergenSafetyResult"), ct.indexOf("/** WO-SIMPLIFY (PART A) — the deterministic SIMPLE-allergy"));
  ok("A2: the frozen reply still promises the customer a kitchen note",
    forced.length > 0 && forced.includes("سجّلت الملاحظة للمطبخ"));

  ok("A3: the branch WRITES the session kitchen-ticket note (defect A closed)",
    /writeConversationAllergyNote\(/.test(branch));
  ok("A3: it reuses the canonical pure helpers — no invented note format",
    /buildTicketAllergyNote\(\s*collectConversationAllergenTerms\(input\.history, input\.userMessage\)\s*\)/.test(branch));
  ok("A4: the write is guarded on a real conversation", /if \(conversationId\) \{/.test(branch));
  // Session-scoped terms only. customer_memory must never feed the kitchen-ticket note.
  ok("A5: the note is NOT sourced from customer memory",
    !/memoryAllergyHit|memoryAllergyLabels|customer_memory/.test(branch));
  // Reply text / escalation posture are untouched by the fix.
  ok("A6: the branch does not alter the reply or escalate",
    !/result\.reply\s*=/.test(branch) && !/escalate: true/.test(branch));
}

// ══ B — ONE checked, tenant-pinned writer of conversations.allergy_note ═══════
{
  const helper = ct.slice(
    ct.indexOf("async function writeConversationAllergyNote("),
    ct.indexOf("function isRule6ReadNotUnderstoodClarify(")
  );
  ok("B1: customer-turn has the single checked note writer", helper.length > 0);
  ok("B1: it uses mustWrite with exactRows:1 (a zero-row write is a failure, not a success)",
    /mustWrite<\{ id: string \}>/.test(helper) && /\{ exactRows: 1 \}/.test(helper) && /\.select\("id"\)/.test(helper));
  ok("B2: it is TENANT-PINNED",
    /\.eq\("id", conversationId\)/.test(helper) && /\.eq\("restaurant_id", restaurantId\)/.test(helper));
  ok("B3: a missing 0080 column stays inert; every other failure is surfaced",
    /isUndefinedColumnError\(e\)/.test(helper) && /console\.error\(/.test(helper));
  ok("B3: it never throws into a customer turn", /return false;/.test(helper));

  // No bare writer may survive anywhere else in the file.
  const bareWrites = ct.match(/\.from\("conversations"\)\s*\n?\s*\.?update\(\{ allergy_note/g) ?? [];
  const inlineBare = ct.match(/admin\.from\("conversations"\)\.update\(\{ allergy_note/g) ?? [];
  ok("B4: no bare unchecked conversations.allergy_note write remains",
    bareWrites.length === 0 && inlineBare.length === 0);

  // All four note writes (stale-context expiry, retraction clear, allergy_simple ticket
  // note, and the flag-OFF gate note) go through the one writer.
  const callSites = ct.match(/writeConversationAllergyNote\(\s*\n?\s*admin,/g) ?? [];
  ok("B5: all four note writes go through the checked writer", callSites.length === 4);
  ok("B5: the allergy_simple ticket-note call site is preserved verbatim",
    /\{ allergy_note: ticketNote \}/.test(ct));
}

// ══ C — companion side effects: checked + tenant-pinned (behavioural) ═════════
type QueryResult = { data: unknown; error: { code?: string; message: string; details?: string; hint?: string } | null };
type Call = { table: string; op: string; filters: Record<string, unknown>; selected: string | null };

function makeClient(results: QueryResult[]) {
  const calls: Call[] = [];
  const pending = [...results];
  const client = {
    from(table: string) {
      const state: Call = { table, op: "select", filters: {}, selected: null };
      const api: Record<string, unknown> = {
        update() { state.op = "update"; return api; },
        insert() { state.op = "insert"; return api; },
        select(cols?: string) { state.selected = cols ?? null; return api; },
        eq(key: string, value: unknown) { state.filters[key] = value; return api; },
        is() { return api; },
        order() { return api; },
        limit() { return api; },
        then(resolveFn: (value: QueryResult) => unknown, rejectFn?: (reason: unknown) => unknown) {
          calls.push({ ...state, filters: { ...state.filters } });
          const result = pending.shift() ?? { data: [], error: null };
          return Promise.resolve(result).then(resolveFn, rejectFn);
        },
      };
      return api;
    },
  };
  return { client, calls };
}

const oneRow = { data: [{ id: "row-1" }], error: null };
const zeroRows = { data: [], error: null };
const postCommitOrder = { data: [{ id: "order-1", order_number: "1001" }], error: null };
// path "emergency" exercises the post-commit ORDER stamp while suppressing the manager
// ping (firePostCommit is guarded off for emergency) — no alert machinery in the harness.
const emergencyDecision = {
  path: "emergency",
  note: "⚠️ العميل ذكر حساسية/حالة صحية: ألبان",
  reply: "noted",
  offerHuman: true,
  escalate: true,
} as never;

{
  const h = makeClient([oneRow, postCommitOrder, oneRow]);
  const result = await applyCompanionSideEffects(h.client as never, {
    restaurantId: "restaurant-1",
    conversationId: "conversation-1",
    decision: emergencyDecision,
    customerMessage: "عندي حساسية لبن",
    agentReply: "تمام",
  } as never);
  const convWrite = h.calls.find((c) => c.table === "conversations" && c.op === "update");
  const orderWrite = h.calls.find((c) => c.table === "orders" && c.op === "update");

  ok("C1: the conversation note write is TENANT-PINNED",
    convWrite?.filters.id === "conversation-1" && convWrite?.filters.restaurant_id === "restaurant-1");
  ok("C1: it still asserts the affected row", convWrite?.selected === "id" && result.noteWritten === true);

  ok("C2: the post-commit ORDER stamp is TENANT-PINNED (was `.eq(\"id\", orderId)` only)",
    orderWrite?.filters.id === "order-1" && orderWrite?.filters.restaurant_id === "restaurant-1");
  ok("C2: the order stamp asserts its affected row", orderWrite?.selected === "id");
  ok("C2: a successful stamp is reported", result.orderNoteWritten === true);
}

{
  // A ZERO-ROW order stamp (wrong tenant / vanished order) must NOT look like success.
  const h = makeClient([oneRow, postCommitOrder, zeroRows]);
  const result = await applyCompanionSideEffects(h.client as never, {
    restaurantId: "restaurant-1",
    conversationId: "conversation-1",
    decision: emergencyDecision,
    customerMessage: "عندي حساسية لبن",
    agentReply: "تمام",
  } as never);
  ok("C3: a zero-row order stamp reports orderNoteWritten:false, not silent success",
    result.orderNoteWritten === false);
}

{
  // A REJECTED conversation-note write must not report noteWritten:true.
  const rejected = { data: null, error: { code: "DB_FAIL", message: "write rejected", details: "", hint: "" } };
  const h = makeClient([rejected, { data: [], error: null }]);
  const result = await applyCompanionSideEffects(h.client as never, {
    restaurantId: "restaurant-1",
    conversationId: "conversation-1",
    decision: { path: "mention", note: "بيض", reply: "noted", offerHuman: true, escalate: false } as never,
    customerMessage: "عندي حساسية بيض",
    agentReply: "تمام",
  } as never);
  ok("C4: a rejected note write reports noteWritten:false", result.noteWritten === false);
}

ok("C5: the source still stamps decision.note onto the order (kitchen-ticket invariant)",
  /allergy_note: decision\.note/.test(eff));
ok("C5: both companion note writes are checked with exactRows:1",
  (eff.match(/\{ exactRows: 1 \}/g) ?? []).length === 2);
ok("C5: no bare unchecked write remains in the companion effects",
  !/await admin\.from\("orders"\)\.update\(/.test(eff));

// ══ D — order-create reads the session note checked + tenant-pinned ═══════════
{
  const block = oc.slice(oc.indexOf("let allergyNote = \"\";"), oc.indexOf("const { data, error } = await admin"));
  ok("D1: the session-note read is TENANT-PINNED",
    /\.eq\("id", conversationId\)/.test(block) && /\.eq\("restaurant_id", restaurantId\)/.test(block));
  ok("D2: the read result's error is INSPECTED, not swallowed by an unreachable catch",
    /error: convNoteError/.test(block) && /if \(convNoteError\)/.test(block) && !/} catch/.test(block));
  ok("D3: a missing 0080 column stays inert; any other failure is surfaced",
    /isUndefinedColumnError\(convNoteError\)/.test(block) && /console\.error\(/.test(block));
  ok("D4: the note is still copied onto the order at create", /allergy_note: allergyNote/.test(oc));
}

console.log(`\nALLERGY-NOTE-DURABILITY PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
