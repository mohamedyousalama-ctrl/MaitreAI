// ============================================================================
// MaitreAI — Persistent order session (Step 1, the keystone) — SERVER ONLY
// A durable, per-conversation order draft. Before each Brain turn we LOAD the
// active session (its lines + state) so the agent resumes the in-progress order
// instead of starting empty; after the turn we PERSIST the tool-computed draft
// back and append a timeline event. Money is always the tool-computed snapshot
// from lib/ai/tools (the model never writes it).
//
// Lifecycle (§1C):
//   building  → the live draft, reloaded every turn (one active per conversation)
//   confirmed → the customer finalized this turn; awaiting the real order row
//   finalized → converted to an orders row (order_id linked)
//   cancelled → abandoned (explicit «إلغاء» or expiry); next message starts fresh
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyDraft, type DraftLine, type OrderDraft } from "@/lib/ai/tools";
import type { Presentation } from "@/lib/ai/tools";

// A building session older than this is abandoned rather than resurrected — we
// never re-open a stale half-order from a day ago (§1C "reasonable expiry").
const ACTIVE_SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface LoadedSession {
  sessionId: string;
  draft: OrderDraft;
}

interface SessionRow {
  id: string;
  status: string;
  fulfillment_type: string | null;
  delivery_zone: string | null;
  delivery_fee: number | string;
  currency: string;
  subtotal: number | string;
  tax_amount: number | string;
  tax_rate: number | string;
  total: number | string;
  updated_at: string;
}
interface LineRow {
  item_id: string;
  name: string;
  qty: number;
  unit_price: number | string;
  modifiers: { name: string; priceImpact: number }[] | null;
  line_total: number | string;
  position: number;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

/** Hydrate an OrderDraft from a session row + its lines. */
function hydrate(row: SessionRow, lines: LineRow[]): OrderDraft {
  const draftLines: DraftLine[] = lines
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      itemId: l.item_id,
      name: l.name,
      quantity: l.qty,
      unitPrice: num(l.unit_price),
      modifiers: Array.isArray(l.modifiers)
        ? l.modifiers.map((m) => ({ name: m.name, priceImpact: num(m.priceImpact) }))
        : [],
      lineTotal: num(l.line_total),
    }));
  return {
    lines: draftLines,
    fulfillment: (row.fulfillment_type as OrderDraft["fulfillment"]) ?? null,
    deliveryZone: row.delivery_zone ?? null,
    deliveryFee: num(row.delivery_fee),
    subtotal: num(row.subtotal),
    tax: num(row.tax_amount),
    taxRate: num(row.tax_rate),
    total: num(row.total),
    currency: row.currency || "ج.م",
    finalized: false, // a loaded building session is never pre-finalized
  };
}

/**
 * Load the conversation's active (building) order session, or create a fresh
 * one. Returns the session id + a hydrated draft to seed the turn.
 */
export async function loadOrCreateOrderSession(
  admin: SupabaseClient,
  args: { restaurantId: string; conversationId: string; currency: string }
): Promise<LoadedSession> {
  const { restaurantId, conversationId, currency } = args;

  const { data: existing } = await admin
    .from("order_sessions")
    .select("id,status,fulfillment_type,delivery_zone,delivery_fee,currency,subtotal,tax_amount,tax_rate,total,updated_at")
    .eq("conversation_id", conversationId)
    .eq("status", "building")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const row = existing as SessionRow;
    const ageMs = Date.now() - new Date(row.updated_at).getTime();
    if (ageMs <= ACTIVE_SESSION_TTL_MS) {
      const { data: lines } = await admin
        .from("order_session_lines")
        .select("item_id,name,qty,unit_price,modifiers,line_total,position")
        .eq("order_session_id", row.id);
      return { sessionId: row.id, draft: hydrate(row, (lines ?? []) as LineRow[]) };
    }
    // Stale → abandon it, then fall through to create a fresh session.
    await admin.from("order_sessions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", row.id);
    await admin.from("order_session_events").insert({ order_session_id: row.id, type: "expired", payload: { ageMs } });
  }

  const { data: created } = await admin
    .from("order_sessions")
    .insert({ restaurant_id: restaurantId, conversation_id: conversationId, status: "building", currency })
    .select("id")
    .single();
  const sessionId = (created?.id as string) ?? "";
  if (sessionId) {
    await admin.from("order_session_events").insert({ order_session_id: sessionId, type: "created", payload: {} });
  }
  return { sessionId, draft: emptyDraft(currency) };
}

/** Summarize what changed this turn for the append-only event log. */
function diffPayload(before: OrderDraft, after: OrderDraft): Record<string, unknown> {
  const sig = (d: OrderDraft) => d.lines.map((l) => `${l.itemId}:${l.quantity}`).sort().join(",");
  return {
    linesBefore: before.lines.length,
    linesAfter: after.lines.length,
    linesChanged: sig(before) !== sig(after),
    fulfillment: after.fulfillment,
    deliveryZone: after.deliveryZone,
    subtotal: after.subtotal,
    deliveryFee: after.deliveryFee,
    tax: after.tax,
    total: after.total,
    finalized: after.finalized,
  };
}

/**
 * Persist the post-turn draft back into the session (replace lines, snapshot the
 * tool-computed money + state) and append a timeline event. When the draft was
 * finalized this turn, the session leaves `building` → `confirmed` so the next
 * message starts a fresh order; the real orders row is linked later via
 * finalizeOrderSession (the existing finalize→order path owns that write).
 */
export async function persistOrderSession(
  admin: SupabaseClient,
  args: {
    sessionId: string;
    before: OrderDraft;
    after: OrderDraft;
    presentation?: Presentation | null;
    pendingQuestion?: string | null;
  }
): Promise<void> {
  const { sessionId, before, after, presentation } = args;
  if (!sessionId) return;
  const d = after;

  // Replace the line set with the current draft (delete-then-insert keeps it the
  // exact tool-computed truth — no stale lines, no model-authored money).
  await admin.from("order_session_lines").delete().eq("order_session_id", sessionId);
  if (d.lines.length) {
    await admin.from("order_session_lines").insert(
      d.lines.map((l, idx) => ({
        order_session_id: sessionId,
        item_id: l.itemId,
        name: l.name,
        qty: l.quantity,
        unit_price: l.unitPrice,
        modifiers: l.modifiers,
        line_total: l.lineTotal,
        position: idx,
      }))
    );
  }

  const interactiveIds =
    presentation?.kind === "buttons"
      ? presentation.buttons.map((b) => b.id)
      : presentation?.kind === "list"
      ? presentation.sections.flatMap((s) => s.rows.map((r) => r.id))
      : [];

  await admin
    .from("order_sessions")
    .update({
      status: d.finalized ? "confirmed" : "building",
      confirmation_status: d.finalized ? "confirmed" : "none",
      fulfillment_type: d.fulfillment,
      delivery_zone: d.deliveryZone,
      delivery_fee: d.deliveryFee,
      currency: d.currency,
      subtotal: d.subtotal,
      tax_amount: d.tax,
      tax_rate: d.taxRate,
      total: d.total,
      pending_question: args.pendingQuestion ?? null,
      last_presented_options: interactiveIds,
      last_interactive_ids: interactiveIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  await admin.from("order_session_events").insert({
    order_session_id: sessionId,
    type: d.finalized ? "finalized_draft" : "turn",
    payload: diffPayload(before, after),
  });
}

/** Link a finalized session to the real order row it became (§1C). */
export async function finalizeOrderSession(
  admin: SupabaseClient,
  sessionId: string,
  orderId: string
): Promise<void> {
  if (!sessionId) return;
  await admin
    .from("order_sessions")
    .update({ status: "finalized", order_id: orderId, confirmation_status: "confirmed", updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  await admin.from("order_session_events").insert({ order_session_id: sessionId, type: "order_created", payload: { orderId } });
}

/** Explicit cancel («إلغاء») — abandon the session; the next order starts fresh. */
export async function cancelOrderSession(admin: SupabaseClient, sessionId: string): Promise<void> {
  if (!sessionId) return;
  await admin
    .from("order_sessions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  await admin.from("order_session_events").insert({ order_session_id: sessionId, type: "cancelled", payload: {} });
}

/** Conservative cancel-intent match (typed «إلغاء» or the cancel button id). */
export function isCancelIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t === "cancel_order") return true;
  return /^(إلغاء|الغاء|إلغاء الطلب|الغاء الطلب|كنسل|بطّل|بطل)$/.test(t);
}
