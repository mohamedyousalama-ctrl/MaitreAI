// ============================================================================
// MaitreAI — Agent respond route (Sprint 8 slice 3b; Sprint 9 refactor) — SERVER
// Secret-guarded HTTP entry to the Customer-Agent Brain. Used by the eval/test
// harness and any server-to-server caller. The actual turn (Brain + persistence
// + cost logging + escalation flip) lives in lib/ai/customer-turn so the
// WhatsApp webhook bridge runs the exact same path with no drift. Guarded by a
// shared secret so it isn't an open, cost-bearing LLM proxy.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCustomerTurn, CustomerTurnError } from "@/lib/ai/customer-turn";
import type { LlmMessage } from "@/lib/ai/llm/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.AGENT_ROUTE_SECRET;
  if (!secret || req.headers.get("x-agent-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const restaurantId = String(body.restaurantId ?? "");
  const text = String(body.text ?? "").trim();
  const conversationId = body.conversationId ? String(body.conversationId) : null;
  if (!restaurantId || !text) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Prior turns for context. The inbound `text` is answered separately, so it
  // is NOT pre-persisted by this route — history is whatever already exists.
  let history: LlmMessage[] = [];
  if (conversationId) {
    const { data: msgs } = await admin
      .from("messages")
      .select("sender,text,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at")
      .limit(40);
    history = ((msgs ?? []) as { sender: string; text: string | null }[])
      .filter((m) => m.text)
      .map((m) => ({ role: m.sender === "customer" ? "user" : "assistant", content: m.text as string }));
  }

  try {
    const outcome = await runCustomerTurn(admin, { restaurantId, conversationId, history, userMessage: text });
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
    });
  } catch (e) {
    if (e instanceof CustomerTurnError && e.code === "restaurant_not_found") {
      return NextResponse.json({ error: "restaurant_not_found" }, { status: 404 });
    }
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "agent_error", detail }, { status: 502 });
  }
}
