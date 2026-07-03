// ============================================================================
// WO-1 proof harness — conversation_outcomes writer.
// Exercises the REAL emitConversationOutcome + its pure helpers against a fake
// admin client and an injectable classifier. Covers:
//   (A) handled_by derivation (karim-only / human / mixed) + human member ids
//   (B) classification parse/validate (enum guard, objection ≤120, verbatim)
//   (C) written-once (double-emit → exactly 1 insert)
//   (D) retry path (fail twice then succeed → insert; fail 3× → alert + no row)
//   (E) flag OFF → no classify call, no insert (default-off proof)
//   (F) deterministic spine mapping (order_value from orders, ad_source, duration)
// Coverage-view math + RLS isolation between two tenants are validated at the DB
// layer (BEGIN…ROLLBACK on prod, reported with the migration).
//
// Run (server-only stubbed via the react-server condition):
//   node --conditions=react-server --import <tsx>/dist/loader.mjs \
//     scripts/proof-conversation-outcomes.test.ts
// ============================================================================

import {
  emitConversationOutcome,
  deriveHandledBy,
  humanMemberIds,
  parseOutcomeClassification,
  type OutcomeClassification,
} from "../lib/intelligence/conversation-outcomes.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); }
}

// ---- A fake Supabase admin: table-aware, captures inserts -------------------
type Row = Record<string, unknown>;
function makeFakeAdmin(seed: {
  conv?: Row | null;
  messages?: Row[];
  order?: Row | null;
  outcomes?: Row[];
}) {
  const store: Record<string, Row[]> = {
    conversation_outcomes: [...(seed.outcomes ?? [])],
    conversations: seed.conv === null ? [] : [seed.conv ?? {}],
    messages: seed.messages ?? [],
    orders: seed.order ? [seed.order] : [],
    system_alerts: [],
    restaurants: [{ name: null }],
    members: [],
  };
  function rowsFor(table: string, filters: Record<string, unknown>): Row[] {
    let rows = store[table] ?? [];
    for (const [k, v] of Object.entries(filters)) {
      // Only apply a filter for a column actually modeled on these canned rows —
      // otherwise a canned single-row table (e.g. the conversation) without an
      // `id` field would be filtered away.
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
      if (table === "conversation_outcomes") {
        const dup = store[table].some((r) => r.conversation_id === row.conversation_id);
        if (dup) return { error: { code: "23505", message: "duplicate key" } };
      }
      store[table].push(row);
      return { error: null };
    };
    q.update = () => q;
    // thenable: `await q` (e.g. messages select().eq()) resolves to the row list
    q.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: rowsFor(table, filters), error: null });
    return q;
  }
  return { admin: { from: (t: string) => builder(t) } as unknown, store };
}

const baseArgs = (features: Record<string, unknown>, order?: Row | null) => ({
  restaurantId: "rest-A",
  tier: "standard" as const,
  features,
  conversationId: "conv-1",
  terminalTrigger: "finalized" as const,
  order: (order ?? null) as never,
  transcript: [{ role: "user" as const, content: "عايز وجبة فراخ" }],
});
const ON = { conversation_outcomes: true };
const goodClass: OutcomeClassification = {
  outcome: "confirmed", intent: "family meal", lost_reason: null,
  objection_quote: null, items_mentioned: ["فراخ"], sentiment: "positive",
};

async function run() {
  // ---- (A) handled_by derivation --------------------------------------------
  check("(A) karim-only → karim",
    deriveHandledBy([{ sender: "customer", meta: null }, { sender: "ai", meta: null }]) === "karim");
  check("(A) human takeover (no ai) → human",
    deriveHandledBy([{ sender: "customer", meta: null }, { sender: "human", meta: null }]) === "human");
  check("(A) mixed (ai + human) → mixed",
    deriveHandledBy([{ sender: "ai", meta: null }, { sender: "human", meta: null }]) === "mixed");
  check("(A) system notes ignored → karim",
    deriveHandledBy([{ sender: "system", meta: null }, { sender: "ai", meta: null }]) === "karim");
  check("(A) human member ids distinct, from meta.author_member_id",
    JSON.stringify(humanMemberIds([
      { sender: "human", meta: { author_member_id: "m1" } },
      { sender: "human", meta: { author_member_id: "m1" } },
      { sender: "human", meta: { author_member_id: "m2" } },
      { sender: "ai", meta: { author_member_id: "mX" } },
    ])) === JSON.stringify(["m1", "m2"]));

  // ---- (B) classification parse/validate ------------------------------------
  check("(B) valid outcome parses",
    parseOutcomeClassification('{"outcome":"lost","lost_reason":"price"}')?.outcome === "lost");
  check("(B) invalid outcome → null (classification failure, not a row)",
    parseOutcomeClassification('{"outcome":"maybe"}') === null);
  check("(B) missing outcome → null",
    parseOutcomeClassification('{"intent":"x"}') === null);
  check("(B) invalid lost_reason coerced to null",
    parseOutcomeClassification('{"outcome":"lost","lost_reason":"vibes"}')?.lost_reason === null);
  check("(B) objection_quote truncated to ≤120",
    (parseOutcomeClassification(`{"outcome":"lost","objection_quote":"${"ط".repeat(200)}"}`)?.objection_quote?.length ?? 0) === 120);
  check("(B) items_mentioned filters non-strings",
    JSON.stringify(parseOutcomeClassification('{"outcome":"info_only","items_mentioned":["a",2,"b"]}')?.items_mentioned) === JSON.stringify(["a", "b"]));

  // ---- (C) written-once: double-emit → exactly 1 row ------------------------
  {
    const { admin, store } = makeFakeAdmin({ conv: { customer_id: "cust-1", created_at: new Date(Date.now() - 90_000).toISOString() }, messages: [{ sender: "ai", meta: null }] });
    const deps = { classify: async () => goodClass, resolveNames: async () => new Map() };
    await emitConversationOutcome(admin as never, baseArgs(ON) as never, deps);
    await emitConversationOutcome(admin as never, baseArgs(ON) as never, deps); // double-emit
    check("(C) double-emit writes exactly ONE outcome row", store.conversation_outcomes.length === 1);
  }

  // ---- (D) retry path -------------------------------------------------------
  {
    const { admin, store } = makeFakeAdmin({ conv: { customer_id: "c", created_at: new Date().toISOString() }, messages: [{ sender: "ai", meta: null }] });
    let calls = 0;
    const flaky = { classify: async () => (++calls < 3 ? null : goodClass), resolveNames: async () => new Map() };
    await emitConversationOutcome(admin as never, baseArgs(ON) as never, flaky);
    check("(D) classify retried until success (3 attempts)", calls === 3);
    check("(D) success after retries → row written", store.conversation_outcomes.length === 1);
  }
  {
    const { admin, store } = makeFakeAdmin({ conv: { customer_id: "c", created_at: new Date().toISOString() }, messages: [{ sender: "ai", meta: null }] });
    let calls = 0;
    const dead = { classify: async () => { calls++; return null; }, resolveNames: async () => new Map() };
    await emitConversationOutcome(admin as never, baseArgs(ON) as never, dead);
    check("(D) classify attempted exactly 3 times before giving up", calls === 3);
    check("(D) total classify failure → NO row (gap, never invented)", store.conversation_outcomes.length === 0);
    check("(D) total classify failure → system_alerts row written", store.system_alerts.length === 1);
    check("(D) alert type is outcome_classify_failed", store.system_alerts[0]?.type === "outcome_classify_failed");
  }

  // ---- (E) flag OFF → nothing happens (default-off proof) -------------------
  {
    const { admin, store } = makeFakeAdmin({ conv: { customer_id: "c", created_at: new Date().toISOString() }, messages: [] });
    let classifyCalled = false;
    const deps = { classify: async () => { classifyCalled = true; return goodClass; }, resolveNames: async () => new Map() };
    await emitConversationOutcome(admin as never, baseArgs({}) as never, deps); // no flag
    check("(E) flag OFF → classifier never called", classifyCalled === false);
    check("(E) flag OFF → no row written", store.conversation_outcomes.length === 0);
  }

  // ---- (F) deterministic spine mapping --------------------------------------
  {
    const { admin, store } = makeFakeAdmin({
      conv: { customer_id: "cust-9", created_at: new Date(Date.now() - 120_000).toISOString(), ad_source_id: "ad-42", ad_source_type: "ad" },
      messages: [{ sender: "ai", meta: null }, { sender: "human", meta: { author_member_id: "m7" } }],
      order: { id: "ord-1", total: 175.5 },
    });
    const deps = {
      classify: async () => goodClass,
      resolveNames: async () => new Map([["m7", "Bahaa"]]),
    };
    await emitConversationOutcome(admin as never, baseArgs(ON, { id: "ord-1", total: 999 }) as never, deps);
    const r = store.conversation_outcomes[0] as Row;
    check("(F) order_value read from orders row (engine value, not args)", r.order_value === 175.5);
    check("(F) handled_by = mixed (ai + human)", r.handled_by === "mixed");
    check("(F) human_names resolved from operator identity", JSON.stringify(r.human_names) === JSON.stringify(["Bahaa"]));
    check("(F) ad_source from stored referral (ad_source_id)", r.ad_source === "ad-42");
    check("(F) duration_seconds derived (~120)", typeof r.duration_seconds === "number" && (r.duration_seconds as number) >= 118 && (r.duration_seconds as number) <= 125);
    check("(F) classifier labeled llm_v1", r.classifier === "llm_v1");
    check("(F) model-classified outcome stored", r.outcome === "confirmed");
  }

  console.log(`\nCONVERSATION-OUTCOMES PROOF: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
run();
