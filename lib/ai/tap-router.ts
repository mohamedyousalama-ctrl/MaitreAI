// ============================================================================
// MaitreAI — Step 2: deterministic tap router (SERVER ONLY)
// When a customer TAPS a WhatsApp button/list, Meta sends a stable reply ID.
// This router acts on that ID directly — BEFORE the LLM — against the Step-1
// persistent order session: tool-validated, money tool-computed, no model call.
// Free-text (no interactiveId) is untouched and still goes to the Brain.
//
// The ROUTER (system), not the model, decides what an ID means. Unknown/stale
// IDs return null so the caller falls back to the Brain with the tap's title
// text (never act on a guessed meaning).
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrain } from "@/lib/db/brain";
import { deriveSystemMode, modeAllowsOrders } from "@/lib/ai/modes";
import { dialectProfile } from "@/lib/ai/dialect";
import {
  executeTool,
  recompute,
  summary,
  type Presentation,
  type ToolContext,
} from "@/lib/ai/tools";
import type { CustomerTurnOutcome } from "@/lib/ai/customer-turn";
import {
  loadOrCreateOrderSession,
  persistOrderSession,
  cancelOrderSession,
} from "@/lib/db/order-session";

export interface TapInput {
  restaurantId: string;
  conversationId: string;
  interactiveId: string;
  /** The tapped button/row title — used as the Brain fallback message. */
  titleText: string;
}

interface RouteResult {
  handled: boolean;
  reply: string;
  cancel?: boolean;
}

// --- next-step presentations the router builds directly (from DB data) -------
function presentFulfillment(ctx: ToolContext): void {
  ctx.presentation = {
    kind: "buttons",
    buttons: [
      { id: "fulfillment:delivery", title: "توصيل" },
      { id: "fulfillment:pickup", title: "استلام" },
    ],
  };
}
function presentZones(ctx: ToolContext, currency: string): void {
  const zones = ctx.deliveryAreas.filter((z) => z.active).slice(0, 10);
  if (!zones.length) {
    // No zones configured → fall back to pickup actions rather than a dead list.
    executeTool("present_order_actions", {}, ctx);
    return;
  }
  ctx.presentation = {
    kind: "list",
    button: "اختر المنطقة",
    sections: [
      {
        rows: zones.map((z) => ({
          id: `zone:${z.name}`,
          title: z.name.slice(0, 24),
          description: `رسوم التوصيل ${z.deliveryFee} ${currency}`.slice(0, 72),
        })),
      },
    ],
  };
}

// --- the deterministic ID → action map (the heart of Step 2) -----------------
function routeTap(ctx: ToolContext, id: string, currency: string): RouteResult {
  const d = ctx.draft;
  const colon = id.indexOf(":");
  const kind = colon === -1 ? id : id.slice(0, colon);
  const arg = colon === -1 ? "" : id.slice(colon + 1);

  switch (kind) {
    case "item": {
      const item = ctx.menuItems.find((i) => i.id === arg);
      if (!item || !item.available) {
        executeTool("present_menu", {}, ctx);
        return { handled: true, reply: "الصنف ده مش متاح دلوقتي، اختار من القايمة 👇" };
      }
      // Idempotency: a repeat tap of the same item (last line, no modifiers) just
      // re-asks the quantity — it does NOT add a second line.
      const last = d.lines[d.lines.length - 1];
      const dup = last && last.itemId === item.id && last.modifiers.length === 0;
      if (!dup) executeTool("add_to_order", { item_name: item.name, quantity: 1 }, ctx);
      executeTool("present_quantity", {}, ctx);
      return { handled: true, reply: `تمام، اخترت ${item.name} (${item.price} ${currency}). عايز كام؟` };
    }
    case "cat": {
      const res = executeTool("present_menu", { category: arg }, ctx);
      if (res.isError) {
        executeTool("present_menu", {}, ctx);
        return { handled: true, reply: "اختار من التصنيفات 👇" };
      }
      return { handled: true, reply: `أصناف ${arg} 👇` };
    }
    case "qty": {
      const n = Math.max(1, Math.floor(Number(arg)) || 1);
      if (!d.lines.length) {
        executeTool("present_menu", {}, ctx);
        return { handled: true, reply: "ابدأ باختيار صنف 👇" };
      }
      const line = d.lines[d.lines.length - 1];
      line.quantity = n;
      line.lineTotal = Math.round(line.unitPrice * n * 100) / 100;
      recompute(ctx);
      if (!d.fulfillment) {
        presentFulfillment(ctx);
        return { handled: true, reply: `${summary(d)}\n\nتحب توصيل ولا استلام؟` };
      }
      executeTool("present_order_actions", {}, ctx);
      return { handled: true, reply: summary(d) };
    }
    case "mod": {
      if (!d.lines.length) {
        executeTool("present_menu", {}, ctx);
        return { handled: true, reply: "اختار صنف الأول 👇" };
      }
      const line = d.lines[d.lines.length - 1];
      const item = ctx.menuItems.find((i) => i.id === line.itemId);
      const mod = ctx.modifiers.find((m) => m.id === arg && m.active && item?.modifierIds.includes(m.id));
      if (!mod) {
        executeTool("present_quantity", {}, ctx);
        return { handled: true, reply: "الإضافة دي مش متاحة للصنف ده." };
      }
      // Idempotent: applying the same modifier twice is a no-op.
      if (!line.modifiers.some((x) => x.name === mod.name)) {
        line.modifiers.push({ name: mod.name, priceImpact: mod.priceImpact });
        line.unitPrice = Math.round((line.unitPrice + mod.priceImpact) * 100) / 100;
        line.lineTotal = Math.round(line.unitPrice * line.quantity * 100) / 100;
        recompute(ctx);
      }
      executeTool("present_order_actions", {}, ctx);
      return { handled: true, reply: summary(d) };
    }
    case "fulfillment": {
      if (arg === "pickup") {
        executeTool("set_fulfillment", { type: "pickup" }, ctx);
        executeTool("present_order_actions", {}, ctx);
        return { handled: true, reply: summary(d) };
      }
      presentZones(ctx, currency);
      return { handled: true, reply: "اختار منطقة التوصيل 👇" };
    }
    case "zone": {
      const res = executeTool("set_fulfillment", { type: "delivery", zone_name: arg }, ctx);
      if (res.isError) {
        presentZones(ctx, currency);
        return { handled: true, reply: "المنطقة دي مش معروفة، اختار من القايمة 👇" };
      }
      executeTool("present_order_actions", {}, ctx);
      return { handled: true, reply: summary(d) };
    }
    case "confirm_order": {
      // The finalize gate stays intact: only a complete order advances.
      if (!d.lines.length) {
        executeTool("present_menu", {}, ctx);
        return { handled: true, reply: "السلة فاضية، ابدأ باختيار صنف 👇" };
      }
      if (!d.fulfillment) {
        presentFulfillment(ctx);
        return { handled: true, reply: "تحب توصيل ولا استلام؟" };
      }
      executeTool("present_payment_methods", {}, ctx);
      return { handled: true, reply: `تمام!\n${summary(d)}\n\nاختار طريقة الدفع 👇` };
    }
    case "add_more": {
      executeTool("present_menu", {}, ctx);
      return { handled: true, reply: "تحب تضيف إيه؟ 👇" };
    }
    case "cancel_order": {
      return { handled: true, cancel: true, reply: "تم إلغاء الطلب. تحب تبدأ من جديد؟ اكتب «منيو»." };
    }
    case "pay_cod": {
      if (!d.lines.length) {
        executeTool("present_menu", {}, ctx);
        return { handled: true, reply: "السلة فاضية." };
      }
      if (!d.fulfillment) {
        presentFulfillment(ctx);
        return { handled: true, reply: "محتاج أعرف توصيل ولا استلام الأول." };
      }
      executeTool("finalize_draft", {}, ctx); // sets draft.finalized (gate: non-empty)
      return { handled: true, reply: `تم تأكيد طلبك ✅ الدفع عند الاستلام.\n${summary(d)}\n\nبنستنى تأكيد المطعم.` };
    }
    case "pay_link": {
      // Stub (real payment provider is out of scope) — never fakes a session.
      return { handled: true, reply: "رابط الدفع الإلكتروني هيكون متاح قريّب 🙏 دلوقتي الدفع عند الاستلام." };
    }
    default:
      return { handled: false, reply: "" };
  }
}

/**
 * Run one deterministic tap turn. Returns a CustomerTurnOutcome (same shape the
 * Brain path returns, so the WhatsApp bridge sends + finalizes identically), or
 * null when the tap can't be handled deterministically (caller → Brain).
 */
export async function runTapTurn(admin: SupabaseClient, input: TapInput): Promise<CustomerTurnOutcome | null> {
  const { restaurantId, conversationId, interactiveId } = input;
  const t0 = Date.now();

  const { data: r } = await admin.from("restaurants").select("*").eq("id", restaurantId).single();
  if (!r) return null;
  const row = r as Record<string, unknown>;

  const mode = deriveSystemMode({
    supabaseConfigured: true,
    agentMode: String(row.agent_mode ?? "setup"),
    isOpen: !!row.is_open,
    llmHealthy: true,
  });
  // Taps that build an order only act when ordering is allowed; otherwise hand to
  // the Brain (which gives the right closed/paused message).
  if (!modeAllowsOrders(mode) || !row.is_open) return null;

  const dialect = String(row.dialect ?? "egyptian");
  const currency = String(row.currency || dialectProfile(dialect).currencyDefault);
  const brain = await loadBrain(admin, restaurantId);

  const session = await loadOrCreateOrderSession(admin, { restaurantId, conversationId, currency });
  const before = structuredClone(session.draft);

  const ctx: ToolContext = {
    menuItems: brain.menuItems,
    modifiers: brain.modifiers,
    deliveryAreas: brain.deliveryAreas,
    draft: session.draft,
    signals: [],
    escalation: null,
    presentation: null,
    taxMode: String(row.tax_mode ?? "inclusive"),
    taxRate: Number(row.tax_rate ?? 0),
  };

  const routed = routeTap(ctx, interactiveId.trim(), currency);
  if (!routed.handled) return null; // unknown/stale → Brain fallback

  const colon = interactiveId.indexOf(":");
  const kind = colon === -1 ? interactiveId : interactiveId.slice(0, colon);

  // Persist the session (or cancel it) + a tap event for observability/idempotency.
  try {
    if (routed.cancel) {
      await cancelOrderSession(admin, session.sessionId);
    } else {
      await persistOrderSession(admin, {
        sessionId: session.sessionId,
        before,
        after: ctx.draft,
        presentation: ctx.presentation,
      });
    }
    await admin.from("order_session_events").insert({
      order_session_id: session.sessionId,
      type: "tap",
      payload: { interactiveId, action: kind },
    });
  } catch (e) {
    console.error("[tap-router] session persist error", e);
  }

  // Persist the reply message (optimistically "sent"; the sender downgrades it
  // to failed + notes the timeline if real delivery fails).
  let replyMessageId: string | null = null;
  const { data: msg } = await admin
    .from("messages")
    .insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      direction: "outbound",
      sender: "ai",
      text: routed.reply,
      status: "sent",
      meta: { tap: interactiveId, model: "deterministic", draft: ctx.draft, presentation: ctx.presentation },
    })
    .select("id")
    .single();
  replyMessageId = (msg?.id as string) ?? null;
  await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  // Log a deterministic agent_runs row — ZERO LLM tokens/cost (proves no model call).
  const latencyMs = Date.now() - t0;
  const { data: runRow } = await admin
    .from("agent_runs")
    .insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      trigger: "tap",
      input: interactiveId,
      output: routed.reply,
      tools_used: [`tap:${kind}`],
      model: "deterministic",
      adapter: "deterministic",
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cost_usd: 0,
      latency_ms: latencyMs,
      tokens: 0,
    })
    .select("id")
    .single();

  return {
    reply: routed.reply,
    escalate: false,
    escalationReason: null,
    draft: ctx.draft,
    signals: [],
    presentation: ctx.presentation as Presentation | null,
    toolNames: [`tap:${kind}`],
    model: "deterministic",
    adapter: "mock",
    mode,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    costUsd: 0,
    latencyMs,
    agentRunId: (runRow?.id as string) ?? null,
    replyMessageId,
    orderSessionId: session.sessionId,
  };
}
