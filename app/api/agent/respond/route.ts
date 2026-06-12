// ============================================================================
// MaitreAI — Agent respond route (Sprint 8, slice 3b) — SERVER ONLY
// Runs the customer-agent Brain turn against the real adapter and persists the
// outcome. Uses the service-role admin client (server-to-server, webhook-style;
// Sprint 9 wires the WhatsApp webhook to this path). Guarded by a shared secret
// header so it isn't an open, cost-bearing LLM proxy. Logs token usage + cost to
// agent_runs and any signals to conversation_signals.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrain } from "@/lib/db/brain";
import { respond } from "@/lib/ai/respond";
import { deriveSystemMode } from "@/lib/ai/modes";
import { costUsd, modelFor } from "@/lib/ai/llm";
import { seedAiTone } from "@/lib/seed-data";
import type { BrainContext } from "@/lib/ai/prompt";
import type { LlmMessage } from "@/lib/ai/llm/types";
import type { AiToneConfig } from "@/lib/types";

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

  const { data: r, error: rErr } = await admin
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .single();
  if (rErr || !r) return NextResponse.json({ error: "restaurant_not_found" }, { status: 404 });
  const row = r as Record<string, unknown>;

  const brain = await loadBrain(admin, restaurantId);

  const mode = deriveSystemMode({
    supabaseConfigured: true,
    agentMode: String(row.agent_mode ?? "setup"),
    isOpen: !!row.is_open,
    llmHealthy: true,
  });

  const aiTone: AiToneConfig = {
    ...seedAiTone,
    ...((row.ai_tone as Partial<AiToneConfig>) ?? {}),
  };

  // Optional prior turns for context.
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
      .map((m) => ({
        role: m.sender === "customer" ? "user" : "assistant",
        content: m.text as string,
      }));
  }

  const ctx: BrainContext = {
    profile: {
      name: String(row.name ?? ""),
      currency: String(row.currency ?? "ر.س"),
      timezone: String(row.timezone ?? "Asia/Riyadh"),
      businessType: String(row.business_type ?? ""),
    },
    dialect: String(row.dialect ?? "saudi"),
    menuItems: brain.menuItems,
    modifiers: brain.modifiers,
    branches: brain.branches,
    deliveryAreas: brain.deliveryAreas,
    policies: brain.policies,
    faqs: brain.faqs,
    aiTone,
    mode,
    isOpen: !!row.is_open,
    autoAccept: !!row.auto_accept_orders,
  };

  const t0 = Date.now();
  let result;
  try {
    result = await respond({ brain: ctx, history, userMessage: text });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("agent_runs").insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      trigger: "customer",
      input: text,
      error: message,
    });
    return NextResponse.json({ error: "agent_error", detail: message }, { status: 502 });
  }
  const latencyMs = Date.now() - t0;

  const cfg = modelFor("customer_agent");
  const cost = costUsd(cfg, result.usage.inputTokens, result.usage.outputTokens);

  // Persist the AI reply into the conversation (when one is supplied).
  if (conversationId) {
    await admin.from("messages").insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      direction: "outbound",
      sender: "ai",
      text: result.reply,
      status: "sent",
      meta: { model: result.model, escalate: result.escalate, draft: result.draft },
    });
  }

  const { data: run } = await admin
    .from("agent_runs")
    .insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      trigger: "customer",
      input: text,
      output: result.reply,
      tools_used: result.toolNames,
      model: result.model,
      adapter: result.adapter,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cache_read_tokens: result.usage.cacheReadTokens,
      cost_usd: cost,
      latency_ms: latencyMs,
      tokens: result.usage.inputTokens + result.usage.outputTokens,
      confidence: result.escalate ? 50 : null,
    })
    .select("id")
    .single();

  if (result.signals.length) {
    await admin.from("conversation_signals").insert(
      result.signals.map((s) => ({
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        type: s.type,
        detail: s.detail,
      }))
    );
  }

  // On escalation, hand the conversation to a human (Amendment 03 §E): the AI
  // stops owning it and the operator picks it up.
  if (result.escalate && conversationId) {
    await admin
      .from("conversations")
      .update({
        owner: "human",
        status: "يحتاج تدخل موظف",
        escalation_reason: result.escalationReason,
      })
      .eq("id", conversationId);
  }

  return NextResponse.json({
    reply: result.reply,
    mode,
    escalate: result.escalate,
    escalationReason: result.escalationReason,
    draft: result.draft,
    toolsUsed: result.toolNames,
    model: result.model,
    adapter: result.adapter,
    usage: result.usage,
    costUsd: cost,
    latencyMs,
    agentRunId: run?.id ?? null,
  });
}
