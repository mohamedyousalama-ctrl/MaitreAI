// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — payment sessions data layer
// Persists mock payment sessions so the checkout LINK resolves cross-device
// (the customer opens it on their phone, not the manager's browser). The public
// checkout API (app/api/payments/[sessionId]) reads/advances sessions via the
// service role; managers see the outcome through the order's payment status.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { mustWrite } from "@/lib/db/checked";
import { subscribeWithReload } from "@/lib/realtime/resubscribe";
import type { PaymentMethodKey, PaymentSession, PaymentSessionStatus } from "@/lib/types";

interface SessionRowJoined extends Record<string, unknown> {
  id: string;
  order_id: string;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  link: string | null;
  expires_at: string | null;
  provider_ref: string | null;
  created_at: string;
  updated_at: string;
  orders?: {
    order_number?: string;
    conversation_id?: string | null;
    customers?: { name?: string; phone?: string } | null;
  } | null;
}

export function mapSession(r: SessionRowJoined): PaymentSession {
  const createdAt = new Date(r.created_at).getTime();
  const updatedAt = new Date(r.updated_at).getTime();
  return {
    id: r.id,
    orderId: r.order_id,
    orderNumber: r.orders?.order_number ?? "",
    conversationId: r.orders?.conversation_id ?? undefined,
    customerName: r.orders?.customers?.name || r.orders?.customers?.phone || "عميل",
    customerPhone: r.orders?.customers?.phone || "",
    amount: Number(r.amount),
    currency: r.currency,
    status: r.status as PaymentSessionStatus,
    provider: r.provider,
    method: (r.provider_ref as PaymentMethodKey) || undefined,
    checkoutUrl: r.link ?? "",
    expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : 0,
    paidAt: r.status === "paid" ? updatedAt : undefined,
    createdAt,
    updatedAt,
    events: [],
  };
}

export async function loadSessions(s: SupabaseClient, restaurantId: string): Promise<PaymentSession[]> {
  const { data } = await s
    .from("payment_sessions")
    .select("*, orders(order_number, conversation_id, customers(name, phone))")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as SessionRowJoined[]).map(mapSession);
}

/** Insert a session; retries once if the order row isn't visible yet (FK race). */
export async function insertSessionDb(
  s: SupabaseClient,
  restaurantId: string,
  session: PaymentSession
): Promise<void> {
  const row = {
    id: session.id,
    restaurant_id: restaurantId,
    order_id: session.orderId,
    provider: session.provider,
    amount: session.amount,
    currency: session.currency,
    status: session.status,
    link: session.checkoutUrl,
    expires_at: session.expiresAt ? new Date(session.expiresAt).toISOString() : null,
    provider_ref: session.method ?? null,
  };
  // eslint-disable-next-line local-rules/no-unchecked-supabase-write -- insert with explicit throw-on-error/FK retry; no zero-row update hazard.
  const { error } = await s.from("payment_sessions").insert(row);
  if (error && /foreign key|violates/i.test(error.message)) {
    await new Promise((r) => setTimeout(r, 600));
    // eslint-disable-next-line local-rules/no-unchecked-supabase-write -- retry insert with explicit throw-on-error; no zero-row update hazard.
    const { error: retryError } = await s.from("payment_sessions").insert(row);
    if (retryError) throw retryError;
  } else if (error) {
    throw error;
  }
}

export async function updateSessionStatusDb(
  s: SupabaseClient,
  id: string,
  status: PaymentSessionStatus,
  method?: PaymentMethodKey
): Promise<void> {
  await mustWrite<{ id: string }>(
    s
      .from("payment_sessions")
      .update({ status, ...(method ? { provider_ref: method } : {}), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id"),
    "payment_sessions.update_status",
    { exactRows: 1 },
  );
}

export function subscribeSessions(s: SupabaseClient, restaurantId: string, onChange: () => void): () => void {
  // WO-REALTIME-AUTH-REFRESH: previously a bare .subscribe() with NO status callback —
  // the socket could die silently with no reconnect-reload. Flag-ON now gives it the
  // same active resubscribe-with-backoff + reconnect-reload as the other channels;
  // flag-OFF ("bare") preserves the prior no-callback behavior byte-identically.
  return subscribeWithReload(s, {
    channelName: `pay-${restaurantId}`,
    bind: (ch) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: "payment_sessions", filter: `restaurant_id=eq.${restaurantId}` }, onChange),
    onChange,
    label: "payments",
    legacyMode: "bare",
  });
}
