// ============================================================================
// MaitreAI — Agent respond route (Sprint 8 slice 3b; Sprint 9 refactor) — SERVER
// Secret-guarded HTTP entry to the Customer-Agent Brain. Used by the eval/test
// harness and any server-to-server caller. The actual turn (Brain + persistence
// + cost logging + escalation flip) lives in lib/ai/customer-turn so the
// WhatsApp webhook bridge runs the exact same path with no drift.
//
// AUTH: AGENT_ROUTE_SECRET must be set to "<restaurantId>:<token>" (colon-
// separated). The token in the x-agent-secret header is validated against the
// token half; the restaurant half is the AUTHORITATIVE tenant — the body-
// supplied restaurantId must match exactly. A single leaked secret therefore
// can only ever drive the one restaurant it was issued for. An unset or
// malformed env var closes the route entirely (returns 401).
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCustomerTurn, CustomerTurnError } from "@/lib/ai/customer-turn";
import type { LlmMessage } from "@/lib/ai/llm/types";
import { maybeSucceed } from "@/lib/db/checked";

export const runtime = "nodejs";

type CustomerTurnRunner = typeof runCustomerTurn;
let __testRunCustomerTurn: CustomerTurnRunner | undefined;
export function __setTestRunCustomerTurn(runner: CustomerTurnRunner | undefined): void {
  __testRunCustomerTurn = runner;
}

/** Parse AGENT_ROUTE_SECRET ("restaurantId:token") → null if unset/malformed. */
function parseAgentSecret(env: string | undefined): { boundRestaurantId: string; token: string } | null {
  if (!env) return null;
  const colonIdx = env.indexOf(":");
  if (colonIdx < 1) return null; // no colon, or colon at position 0 → malformed
  const boundRestaurantId = env.slice(0, colonIdx);
  const token = env.slice(colonIdx + 1);
  if (!boundRestaurantId || !token) return null;
  return { boundRestaurantId, token };
}

export async function POST(req: Request) {
  const parsed = parseAgentSecret(process.env.AGENT_ROUTE_SECRET);
  if (!parsed) {
    // Unset or malformed secret → route is closed.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (req.headers.get("x-agent-secret") !== parsed.token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const restaurantId = String(body.restaurantId ?? "");
  const text = String(body.text ?? "").trim();

  // Reject any mismatch between the secret's bound tenant and the requested tenant.
  if (!restaurantId || restaurantId !== parsed.boundRestaurantId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const conversationId = body.conversationId ? String(body.conversationId) : null;
  if (!text) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Prior turns for context. The inbound `text` is answered separately, so it
  // is NOT pre-persisted by this route — history is whatever already exists.
  let history: LlmMessage[] = [];
  if (conversationId) {
    const ownedConversation = await maybeSucceed(
      admin
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
      "agent.respond.conversation_owner",
    );
    if (!ownedConversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { data: msgs } = await admin
      .from("messages")
      .select("sender,text,created_at")
      .eq("conversation_id", conversationId)
      .eq("restaurant_id", restaurantId)
      .order("created_at")
      .limit(40);
    history = ((msgs ?? []) as { sender: string; text: string | null }[])
      .filter((m) => m.text)
      .map((m) => ({ role: m.sender === "customer" ? "user" : "assistant", content: m.text as string }));
  }

  try {
    const runTurn = __testRunCustomerTurn ?? runCustomerTurn;
    const outcome = await runTurn(admin, { restaurantId, conversationId, history, userMessage: text });
    return NextResponse.json({
      reply: outcome.reply,
      mode: outcome.mode,
      escalate: outcome.escalate,
      escalationReason: outcome.escalationReason,
      draft: outcome.draft,
      toolsUsed: outcome.toolNames,
      model: outcome.model,
      adapter: outcome.adapter,
      usage: outcome.usage,
      costUsd: outcome.costUsd,
      latencyMs: outcome.latencyMs,
      agentRunId: outcome.agentRunId,
      perception: outcome.perception,
    });
  } catch (e) {
    if (e instanceof CustomerTurnError && e.code === "restaurant_not_found") {
      return NextResponse.json({ error: "restaurant_not_found" }, { status: 404 });
    }
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "agent_error", detail }, { status: 502 });
  }
}
