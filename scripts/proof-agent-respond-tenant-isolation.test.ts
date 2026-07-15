// KVO-001 proof: /api/agent/respond conversationId must be tenant-owned.
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-agent-respond-tenant-isolation.test.ts

import { __setTestAdminClient } from "../lib/supabase/admin.ts";
import { __setTestAgentRespondTurn } from "../lib/ai/agent-respond-runner.ts";
import { POST } from "../app/api/agent/respond/route.ts";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const TOKEN = "agent-token";
const CONV_A = "conv-a";
const CONV_B = "conv-b";

type Row = Record<string, any>;
type Filter = { method: "eq"; col: string; value: unknown };
type Call = {
  table: string;
  op: string;
  filters: Filter[];
  orderCol?: string;
  limitCount?: number;
};

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

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    if (filter.method === "eq") return row[filter.col] === filter.value;
    return true;
  });
}

function makeState() {
  return {
    conversations: [
      { id: CONV_A, restaurant_id: TENANT_A },
      { id: CONV_B, restaurant_id: TENANT_B },
    ] as Row[],
    messages: [
      { conversation_id: CONV_A, restaurant_id: TENANT_A, sender: "customer", text: "old customer", created_at: "2026-01-01T00:00:01Z" },
      { conversation_id: CONV_A, restaurant_id: TENANT_A, sender: "assistant", text: "old assistant", created_at: "2026-01-01T00:00:02Z" },
      { conversation_id: CONV_A, restaurant_id: TENANT_B, sender: "customer", text: "cross tenant leak", created_at: "2026-01-01T00:00:03Z" },
      { conversation_id: CONV_B, restaurant_id: TENANT_B, sender: "customer", text: "tenant b secret", created_at: "2026-01-01T00:00:04Z" },
    ] as Row[],
    calls: [] as Call[],
  };
}

function makeAdmin(state = makeState()) {
  function rowsFor(table: string): Row[] {
    if (table === "conversations") return state.conversations;
    if (table === "messages") return state.messages;
    return [];
  }

  function from(table: string) {
    const q: Call = { table, op: "select", filters: [] };
    const builder: Row = {};

    const execute = (single: boolean) => {
      state.calls.push({
        table: q.table,
        op: q.op,
        filters: [...q.filters],
        orderCol: q.orderCol,
        limitCount: q.limitCount,
      });

      let rows = rowsFor(q.table).filter((row) => matches(row, q.filters));
      if (q.orderCol) {
        rows = [...rows].sort((a, b) => String(a[q.orderCol ?? ""]).localeCompare(String(b[q.orderCol ?? ""])));
      }
      if (q.limitCount !== undefined) {
        rows = rows.slice(0, q.limitCount);
      }

      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };

    builder.select = () => builder;
    builder.eq = (col: string, value: unknown) => {
      q.filters.push({ method: "eq", col, value });
      return builder;
    };
    builder.order = (col: string) => {
      q.orderCol = col;
      return builder;
    };
    builder.limit = (count: number) => {
      q.limitCount = count;
      return builder;
    };
    builder.maybeSingle = async () => execute(true);
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(execute(false)).then(resolve, reject);

    return builder;
  }

  return { client: { from }, state };
}

function hasFilter(call: Call | undefined, col: string, value: unknown): boolean {
  return call?.filters.some((filter) => filter.method === "eq" && filter.col === col && filter.value === value) === true;
}

function request(body: Record<string, unknown>): Request {
  return new Request("http://local.test/api/agent/respond", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-secret": TOKEN,
    },
    body: JSON.stringify(body),
  });
}

async function runCase(body: Record<string, unknown>) {
  const fake = makeAdmin();
  const turnCalls: Row[] = [];
  __setTestAdminClient(fake.client);
  __setTestAgentRespondTurn((async (_admin: unknown, input: Row) => {
    turnCalls.push(input);
    return {
      reply: "stub reply",
      mode: "auto",
      escalate: false,
      escalationReason: null,
      draft: null,
      toolNames: [],
      model: "test-model",
      adapter: "test-adapter",
      usage: null,
      costUsd: 0,
      latencyMs: 1,
      agentRunId: "test-run",
      perception: null,
    };
  }) as never);

  const res = await POST(request(body));
  const json = await res.json();
  return { res, json, state: fake.state, turnCalls };
}

process.env.AGENT_ROUTE_SECRET = `${TENANT_A}:${TOKEN}`;

const cross = await runCase({ restaurantId: TENANT_A, conversationId: CONV_B, text: "hello" });
const crossConversationCall = cross.state.calls.find((call) => call.table === "conversations");
ok("cross-tenant conversationId returns 404", cross.res.status === 404 && cross.json.error === "not_found");
ok("ownership check is pinned to requested conversation", hasFilter(crossConversationCall, "id", CONV_B));
ok("ownership check is pinned to authenticated tenant", hasFilter(crossConversationCall, "restaurant_id", TENANT_A));
ok("cross-tenant conversationId does not load message history", cross.state.calls.every((call) => call.table !== "messages"));
ok("cross-tenant conversationId does not call runCustomerTurn", cross.turnCalls.length === 0);

const sameTenant = await runCase({ restaurantId: TENANT_A, conversationId: CONV_A, text: "continue" });
const sameConversationCall = sameTenant.state.calls.find((call) => call.table === "conversations");
const sameMessagesCall = sameTenant.state.calls.find((call) => call.table === "messages");
ok("same-tenant conversationId proceeds normally", sameTenant.res.status === 200 && sameTenant.json.reply === "stub reply");
ok("same-tenant ownership check uses conversation id", hasFilter(sameConversationCall, "id", CONV_A));
ok("same-tenant ownership check uses restaurant id", hasFilter(sameConversationCall, "restaurant_id", TENANT_A));
ok("same-tenant history query is conversation pinned", hasFilter(sameMessagesCall, "conversation_id", CONV_A));
ok("same-tenant history query is restaurant pinned", hasFilter(sameMessagesCall, "restaurant_id", TENANT_A));
ok("same-tenant runCustomerTurn called once", sameTenant.turnCalls.length === 1);
ok("same-tenant history excludes cross-tenant messages", !JSON.stringify(sameTenant.turnCalls[0]?.history ?? []).includes("cross tenant leak"));

const fresh = await runCase({ restaurantId: TENANT_A, conversationId: null, text: "fresh" });
ok("null conversationId proceeds as fresh turn", fresh.res.status === 200 && fresh.json.reply === "stub reply");
ok("null conversationId does not query conversations", fresh.state.calls.every((call) => call.table !== "conversations"));
ok("null conversationId does not query messages", fresh.state.calls.every((call) => call.table !== "messages"));
ok("null conversationId calls runCustomerTurn once", fresh.turnCalls.length === 1);
ok("null conversationId passes null id and empty history", fresh.turnCalls[0]?.conversationId === null && Array.isArray(fresh.turnCalls[0]?.history) && fresh.turnCalls[0].history.length === 0);

__setTestAgentRespondTurn(undefined);
__setTestAdminClient(undefined);

console.log(`\nAGENT-RESPOND-TENANT-ISOLATION PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
