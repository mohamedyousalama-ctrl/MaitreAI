// ============================================================================
// MaitreAI — Copilot suggest route (Sprint 8.5 / §M4 E4) — SERVER ONLY
// Operator-facing, SESSION-authenticated (not the shared secret): the signed-in
// member asks the Brain to DRAFT a reply for the current conversation. It does
// NOT send or persist anything (copilot = suggest-only). RLS scopes every read
// to the caller's tenant. The customer-facing send path stays on the
// secret-guarded /api/agent/respond (webhook).
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { loadBrain } from "@/lib/db/brain";
import { respond } from "@/lib/ai/respond";
import { deriveSystemMode } from "@/lib/ai/modes";
import { seedAiTone } from "@/lib/seed-data";
import type { BrainContext } from "@/lib/ai/prompt";
import type { LlmMessage } from "@/lib/ai/llm/types";
import type { AiToneConfig } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const restaurantId = tenant.restaurantId;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const conversationId = body.conversationId ? String(body.conversationId) : "";
  const override = body.text ? String(body.text) : "";
  if (!conversationId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { data: r } = await supabase.from("restaurants").select("*").eq("id", restaurantId).single();
  if (!r) return NextResponse.json({ error: "restaurant_not_found" }, { status: 404 });
  const row = r as Record<string, unknown>;

  const brain = await loadBrain(supabase, restaurantId);

  const { data: msgs } = await supabase
    .from("messages")
    .select("sender,text,direction,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at")
    .limit(60);
  const rows = (msgs ?? []) as { sender: string; text: string | null; direction: string }[];

  // The message to draft a reply to: an explicit override, else the latest
  // inbound/customer message.
  const lastCustomerIdx = [...rows].map((m) => m.sender).lastIndexOf("customer");
  const userMessage = override || (lastCustomerIdx >= 0 ? rows[lastCustomerIdx].text ?? "" : "");
  if (!userMessage.trim()) {
    return NextResponse.json({ error: "no_customer_message" }, { status: 400 });
  }

  // Prior turns (everything before that customer message) as context.
  const priorRows = override ? rows : rows.slice(0, lastCustomerIdx >= 0 ? lastCustomerIdx : rows.length);
  const history: LlmMessage[] = priorRows
    .filter((m) => m.text)
    .map((m) => ({ role: m.sender === "customer" ? "user" : "assistant", content: m.text as string }));

  const mode = deriveSystemMode({
    supabaseConfigured: true,
    agentMode: String(row.agent_mode ?? "setup"),
    isOpen: !!row.is_open,
    llmHealthy: true,
  });
  const aiTone: AiToneConfig = { ...seedAiTone, ...((row.ai_tone as Partial<AiToneConfig>) ?? {}) };
  const { data: convRow } = await supabase.from("conversations").select("handover_note").eq("id", conversationId).single();
  const handoverNote = (convRow?.handover_note as string | null) ?? undefined;

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
    handoverNote,
  };

  try {
    const result = await respond({ brain: ctx, history, userMessage });
    return NextResponse.json({
      suggestion: result.reply,
      escalate: result.escalate,
      escalationReason: result.escalationReason,
      draft: result.draft,
      model: result.model,
      adapter: result.adapter,
    });
  } catch (e) {
    return NextResponse.json({ error: "agent_error", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
