// ============================================================================
// WO-1 proof harness — conversation_outcomes writer + close route.
// Exercises the REAL emitConversationOutcome (self-sufficient: gate-first, then
// self-fetches conversation/messages/order) against a fake admin + injectable
// classifier. Covers:
//   (A) handled_by / human ids / transcript build
//   (B) classification parse/validate (enum guard, objection <=120, verbatim)
//   (C) written-once (double-emit → exactly 1 insert)
//   (D) retry path (fail twice then succeed; fail 3x → alert + no row)
//   (E) FLAG OFF → gate-first, no LLM, no insert (Wesaya close invariant)
//   (F) deterministic spine (order_value from orders, duration = updated−created,
//       ad_source, handled_by, human_names) + restaurant_id derived-from-conv
//   (G) restaurant_id mismatch (caller ≠ conversation) → abort, no row
//   (H) route source-assertions (close committed before emit; safety reject)
//
// Coverage-view math + RLS predicate are validated at the DB layer (BEGIN…ROLLBACK).
//
// Run: node --conditions=react-server --import <tsx>/dist/loader.mjs \
//        scripts/proof-conversation-outcomes.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  emitConversationOutcome,
  deriveHandledBy,
  humanMemberIds,
  parseOutcomeClassification,
  buildTranscript,
  type OutcomeClassification,
} from "../lib/intelligence/conversation-outcomes.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); }
}

type Row = Record<string, unknown>;
function makeFakeAdmin(seed: {
  featureFlags?: Row | null;
  conv?: Row | null;
  messages?: Row[];
  order?: Row | null;
  outcomes?: Row[];
}) {
  const store: Record<string, Row[]> = {
    restaurants: [{ id: "rest-A", feature_flags: seed.featureFlags ?? {} }],
    conversation_outcomes: [...(seed.outcomes ?? [])],
    conversations: seed.conv === null ? [] : [seed.conv ?? {}],
    messages: seed.messages ?? [],
    orders: seed.order ? [seed.order] : [],
    system_alerts: [],
  };
  function rowsFor(table: string, filters: Record<string, unknown>): Row[] {
    let rows = store[table] ?? [];
    for (const [k, v] of Object.entries(filters)) {
      if (!rows.some((r) => k in r)) continue;
      rows = rows.filter((r) => r[k] === v);
    }
    return rows;
  }
  function builder(table: string) {
    const filters: Record<string, unknown> = {};
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (c: string, v: unknown) => { filters[c] = v; return q; };
    q.is = (c: string, v: unknown) => { filters[c] = v; return q; };
    q.in = () => q;
    q.order = () => q;
    q.limit = () => q;
    q.maybeSingle = async () => ({ data: rowsFor(table, filters)[0] ?? null, error: null });
    q.single = async () => ({ data: rowsFor(table, filters)[0] ?? null, error: null });
    q.insert = async (row: Row) => {
      if (table === "conversation_outcomes" && store[table].some((r) => r.conversation_id === row.conversation_id)) {
        return { error: { code: "23505", message: "duplicate key" } };
      }
      store[table].push(row);
      return { error: null };
    };
    q.update = () => q;
    q.then = (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rowsFor(table, filters), error: null });
    return q;
  }
  return { admin: { from: (t: string) => builder(t) } as unknown, store };
}

const ON = { conversation_outcomes: true };
const args = { restaurantId: "rest-A", conversationId: "conv-1" };
const goodClass: OutcomeClassification = {
  outcome: "confirmed", intent: "family meal", lost_reason: null,
  objection_quote: null, items_mentioned: ["فراخ"], sentiment: "positive",
};
const convRow = (extra: Row = {}) => ({
  restaurant_id: "rest-A", customer_id: "cust-1",
  created_at: new Date(Date.now() - 120_000).toISOString(),
  updated_at: new Date(Date.now() - 60_000).toISOString(), ...extra,
});

async function run() {
  // ---- (A) pure derivations -------------------------------------------------
  check("(A) karim-only → karim", deriveHandledBy([{ sender: "customer" } as Row, { sender: "ai" } as Row]) === "karim");
  check("(A) human (no ai) → human", deriveHandledBy([{ sender: "human" } as Row]) === "human");
  check("(A) mixed → mixed", deriveHandledBy([{ sender: "ai" } as Row, { sender: "human" } as Row]) === "mixed");
  check("(A) human ids distinct from meta.author_member_id",
    JSON.stringify(humanMemberIds([
      { sender: "human", meta: { author_member_id: "m1" } } as Row,
      { sender: "human", meta: { author_member_id: "m1" } } as Row,
      { sender: "human", meta: { author_member_id: "m2" } } as Row,
    ])) === JSON.stringify(["m1", "m2"]));
  check("(A) transcript maps customer→user, ai/human→assistant, drops system",
    JSON.stringify(buildTranscript([
      { sender: "customer", text: "hi" }, { sender: "system", text: "note" },
      { sender: "ai", text: "hello" }, { sender: "human", text: "hey" },
    ] as Row[])) === JSON.stringify([
      { role: "user", content: "hi" }, { role: "assistant", content: "hello" }, { role: "assistant", content: "hey" },
    ]));

  // ---- (B) classification validation ----------------------------------------
  check("(B) valid outcome parses", parseOutcomeClassification('{"outcome":"lost","lost_reason":"price"}')?.outcome === "lost");
  check("(B) invalid outcome → null", parseOutcomeClassification('{"outcome":"maybe"}') === null);
  check("(B) missing outcome → null", parseOutcomeClassification('{"intent":"x"}') === null);
  check("(B) bad lost_reason → null", parseOutcomeClassification('{"outcome":"lost","lost_reason":"vibes"}')?.lost_reason === null);
  check("(B) objection truncated to 120",
    (parseOutcomeClassification(`{"outcome":"lost","objection_quote":"${"ط".repeat(200)}"}`)?.objection_quote?.length ?? 0) === 120);

  // ---- (C) written-once -----------------------------------------------------
  {
    const { admin, store } = makeFakeAdmin({ featureFlags: ON, conv: convRow(), messages: [{ sender: "ai", text: "hi" }] });
    const deps = { classify: async () => goodClass, resolveNames: async () => new Map() };
    await emitConversationOutcome(admin as never, args, deps);
    await emitConversationOutcome(admin as never, args, deps);
    check("(C) double-emit → exactly ONE row", store.conversation_outcomes.length === 1);
  }

  // ---- (D) retry ------------------------------------------------------------
  {
    const { admin, store } = makeFakeAdmin({ featureFlags: ON, conv: convRow(), messages: [{ sender: "ai", text: "hi" }] });
    let calls = 0;
    await emitConversationOutcome(admin as never, args, { classify: async () => (++calls < 3 ? null : goodClass), resolveNames: async () => new Map() });
    check("(D) retried until success (3 attempts)", calls === 3);
    check("(D) success-after-retry → row written", store.conversation_outcomes.length === 1);
  }
  {
    const { admin, store } = makeFakeAdmin({ featureFlags: ON, conv: convRow(), messages: [{ sender: "ai", text: "hi" }] });
    let calls = 0;
    await emitConversationOutcome(admin as never, args, { classify: async () => { calls++; return null; }, resolveNames: async () => new Map() });
    check("(D) exactly 3 attempts before giving up", calls === 3);
    check("(D) total failure → NO row (gap)", store.conversation_outcomes.length === 0);
    check("(D) total failure → system_alerts written", store.system_alerts.length === 1);
    check("(D) alert type outcome_classify_failed", store.system_alerts[0]?.type === "outcome_classify_failed");
  }

  // ---- (D') empty transcript → no classify, no row, no misleading alert ------
  {
    const { admin, store } = makeFakeAdmin({ featureFlags: ON, conv: convRow(), messages: [{ sender: "system", text: "note" }] });
    let classifyCalled = false;
    await emitConversationOutcome(admin as never, args, { classify: async () => { classifyCalled = true; return goodClass; }, resolveNames: async () => new Map() });
    check("(D') empty transcript → classifier NOT called", classifyCalled === false);
    check("(D') empty transcript → no outcome row (not a gap-worthy failure)", store.conversation_outcomes.length === 0);
    check("(D') empty transcript → NO outcome_classify_failed alert (honest signal)", store.system_alerts.length === 0);
  }

  // ---- (E) FLAG OFF → Wesaya close invariant --------------------------------
  {
    const { admin, store } = makeFakeAdmin({ featureFlags: {}, conv: convRow(), messages: [{ sender: "ai", text: "hi" }] });
    let classifyCalled = false;
    await emitConversationOutcome(admin as never, args, { classify: async () => { classifyCalled = true; return goodClass; }, resolveNames: async () => new Map() });
    check("(E) flag OFF → classifier NEVER called (no LLM)", classifyCalled === false);
    check("(E) flag OFF → no outcome row written", store.conversation_outcomes.length === 0);
    check("(E) flag OFF → no alert (no work at all)", store.system_alerts.length === 0);
  }

  // ---- (F) deterministic spine ----------------------------------------------
  {
    const { admin, store } = makeFakeAdmin({
      featureFlags: ON,
      conv: convRow({ ad_source_id: "ad-42", ad_source_type: "ad" }),
      messages: [{ sender: "ai", text: "hi" }, { sender: "human", text: "hey", meta: { author_member_id: "m7" } }],
      order: { id: "ord-1", total: 175.5, conversation_id: "conv-1", restaurant_id: "rest-A" },
    });
    await emitConversationOutcome(admin as never, args, { classify: async () => goodClass, resolveNames: async () => new Map([["m7", "Bahaa"]]) });
    const r = store.conversation_outcomes[0] as Row;
    check("(F) restaurant_id derived from conversation row", r.restaurant_id === "rest-A");
    check("(F) order_value from orders row (engine value)", r.order_value === 175.5);
    check("(F) order_id from orders row", r.order_id === "ord-1");
    check("(F) handled_by = mixed", r.handled_by === "mixed");
    check("(F) human_names from operator identity", JSON.stringify(r.human_names) === JSON.stringify(["Bahaa"]));
    check("(F) ad_source from stored referral", r.ad_source === "ad-42");
    check("(F) duration = updated_at − created_at (~60s, DB-sourced)", typeof r.duration_seconds === "number" && (r.duration_seconds as number) >= 58 && (r.duration_seconds as number) <= 62);
    check("(F) classifier labeled llm_v1", r.classifier === "llm_v1");
  }

  // ---- (G) restaurant_id mismatch → abort -----------------------------------
  {
    const { admin, store } = makeFakeAdmin({ featureFlags: ON, conv: convRow({ restaurant_id: "rest-OTHER" }), messages: [{ sender: "ai", text: "hi" }] });
    let classifyCalled = false;
    await emitConversationOutcome(admin as never, args, { classify: async () => { classifyCalled = true; return goodClass; }, resolveNames: async () => new Map() });
    check("(G) caller/conv tenant mismatch → NO row (cross-tenant guard)", store.conversation_outcomes.length === 0);
    check("(G) mismatch aborts before classify", classifyCalled === false);
  }

  // ---- (H) close route source-assertions ------------------------------------
  const route = readFileSync(join(ROOT, "app/api/conversations/[id]/close/route.ts"), "utf8");
  check("(H) route rejects safety hold (never close-around #87)",
    route.includes('=== "SYSTEM_HOLD"') && route.includes("cannot_close_safety_hold"));
  const idxClose = route.indexOf('setOwnershipState(admin, params.id, "CLOSED"');
  const idxEmit = route.indexOf("emitConversationOutcome(admin");
  check("(H) close transition committed BEFORE emit", idxClose > 0 && idxEmit > idxClose);
  check("(H) member-auth (getServerTenant) like sibling routes", route.includes("getServerTenant"));

  console.log(`\nCONVERSATION-OUTCOMES PROOF: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
run();
