// ============================================================================
// MaitreAI — Persist an order from a finalized Brain draft (Sprint 9, S9-4.5)
// SERVER ONLY. The keystone link: when the Customer Agent finalizes a draft in
// the WhatsApp flow, write a real `orders` row so it lands in الطلبات and the
// S9-3 auto-receipt can fire. Two invariants:
//   • IDEMPOTENCY — one finalized draft = exactly one row. The order id is a
//     deterministic hash of (conversation + line items + fulfillment + total),
//     so a retry / duplicate webhook / double-tap upserts the SAME id (no dupe).
//   • MONEY INTEGRITY — totals are copied verbatim from the tool-computed draft
//     after a server-side DB recompute verifies/rebuilds every amount from menu,
//     option, modifier, and delivery-zone rows. The row total == the verified
//     tool/server total, never a model-written amount.
// ============================================================================

import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderDraft } from "@/lib/ai/tools";
import { loadBrain } from "@/lib/db/brain";
import { recomputeOrderPricing } from "@/lib/order-pricing";
import { recordCriticalAlert } from "@/lib/alerts/record";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { loadResolvedPaymentMethods, offeredMethods, recordPaymentSnapshot } from "@/lib/payments/resolve";

/** Deterministic UUID from a string (stable id ⇒ idempotent insert). */
export function uuidFromHash(input: string): string {
  const h = createHash("sha256").update(input).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Content-only basket fingerprint (NO conversation / run id) — used by the
 *  double-tap window guard. Derived from the STORED `items` shape so the current
 *  order and any candidate row hash identically (same builder on both sides). */
type FingerprintItem = { menuItemId?: string; quantity?: number; variant?: string | null; choices?: string[]; modifiers?: string[] };
export function basketContentKey(args: { items: FingerprintItem[]; fulfillment: string; total: number }): string {
  const lines = args.items
    .map((it) => ({
      i: it.menuItemId ?? "",
      q: Number(it.quantity ?? 0),
      v: it.variant ?? "",
      c: [...(it.choices ?? [])].sort(),
      m: [...(it.modifiers ?? [])].sort(),
    }))
    .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const norm = JSON.stringify({ lines, f: args.fulfillment, t: Number(args.total).toFixed(2) });
  return createHash("sha256").update(norm).digest("hex");
}

/**
 * The next human-friendly order number for the tenant — allocated ATOMICALLY by
 * the database (migration 0113).
 *
 * The previous implementation read EVERY order row for the tenant, took the
 * numeric max and returned max+1. Two defects, both now closed:
 *
 *   1. RACE. Read-then-write with no lock: two orders created in the same instant
 *      read the same max and took the same number — and there was no unique
 *      constraint on (restaurant_id, order_number), so BOTH persisted. Two
 *      customers, one order number, and no way for the operator to tell them
 *      apart. 0113 adds the atomic counter AND the unique index as a backstop.
 *   2. O(n). A full tenant scan per order creation. Now constant time.
 *
 * The scan is KEPT for exactly ONE case: an environment where 0113 has not been
 * applied (a fresh local database, a preview branch). There, no unique index
 * exists either, so the scan behaves as it always did.
 *
 * It is deliberately NOT used for a transient RPC error, which an earlier version
 * of this function did. Where 0113 IS applied, a fallback number is worse than no
 * number: the scan does not advance the counter, so the number it returns can
 * already exist, and the unique index then refuses the INSERT — the order is not
 * persisted at all and the customer gets no confirmation. A fallback that turns a
 * retryable blip into a lost order buys nothing. So: missing function → scan;
 * anything else → throw, and let the caller's existing retry path handle it.
 */

/** Postgres/PostgREST codes meaning "this function does not exist here". */
const RPC_MISSING = new Set(["42883", "PGRST202"]);

export async function nextOrderNumber(admin: SupabaseClient, restaurantId: string): Promise<string> {
  // Wrapped: the admin client is an injected seam in tests, and a double without
  // a .rpc method would otherwise throw straight past this whole function.
  let data: unknown = null;
  let error: { message?: string; code?: string } | null = null;
  try {
    ({ data, error } = await admin.rpc("next_order_number", { p_restaurant_id: restaurantId }));
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e), code: "42883" };
  }

  if (!error && data != null) return String(data);

  if (error && !RPC_MISSING.has(String(error.code))) {
    // 0113 is applied and the allocator failed for some other reason. Falling
    // back here would hand out a number the unique index will reject.
    throw new Error(
      `[orders] next_order_number failed (${error.code ?? "no code"}): ${error.message ?? "unknown"}`,
    );
  }

  console.warn(
    "[orders] next_order_number RPC is absent — falling back to the non-atomic scan. " +
      "Apply migration 0113_atomic_order_numbers.",
    error?.message ?? "no row returned",
  );
  const { data: rows, error: scanError } = await admin
    .from("orders")
    .select("order_number")
    .eq("restaurant_id", restaurantId);
  if (scanError) {
    // Silently treating a failed scan as "no orders" returns 1001 for a tenant
    // that certainly already has it.
    throw new Error(`[orders] order-number fallback scan failed: ${scanError.message}`);
  }
  let max = 1000;
  for (const r of (rows ?? []) as { order_number: string }[]) {
    const n = parseInt(String(r.order_number).replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

export interface PersistOrderResult {
  created: boolean; // false = idempotent no-op (already persisted)
  orderId: string | null;
  orderNumber: string | null;
}

async function recomputeDraftFromDb(
  admin: SupabaseClient,
  args: { restaurantId: string; draft: OrderDraft }
): Promise<{ draft: OrderDraft; zoneId: string | null; branchId: string | null }> {
  const brain = await loadBrain(admin, args.restaurantId);
  const priced = recomputeOrderPricing({
    menuItems: brain.menuItems,
    modifiers: brain.modifiers,
    deliveryAreas: brain.deliveryAreas,
    lines: args.draft.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      variantName: line.variant?.name ?? null,
      choices: line.choices.map((choice) => ({ groupName: choice.groupName, label: choice.label })),
      modifierNames: line.modifiers.map((modifier) => modifier.name),
    })),
    fulfillment: args.draft.fulfillment ?? "pickup",
    deliveryZoneName: args.draft.deliveryZone,
    // WO-LIVE4-F3 (geo-pin-wins): the authoritative persisted fee + branch come from
    // the pin's zone, not the model-supplied name. deliveryPin rides on the draft only
    // for a flag-ON matched pin, so pin-less orders persist exactly as before.
    deliveryPin: args.draft.deliveryPin ?? null,
    branches: brain.branches,
    taxMode: brain.taxMode,
    taxRate: brain.taxRate,
    currency: brain.profile.currency || args.draft.currency,
  });
  return {
    draft: {
      ...args.draft,
      lines: priced.lines.map((line) => ({
        itemId: line.itemId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        variant: line.variant,
        choices: line.choices,
        modifiers: line.modifiers,
        lineTotal: line.lineTotal,
      })),
      deliveryZone: priced.deliveryZone?.name ?? null,
      deliveryFee: priced.deliveryFee,
      subtotal: priced.subtotal,
      tax: priced.taxAmount,
      taxRate: priced.taxRate,
      total: priced.total,
      currency: priced.currency,
      finalized: args.draft.finalized,
    },
    zoneId: priced.deliveryZone?.id ?? null,
    // Delivery: the matched zone's branch is authoritative. Pickup (no zone): the
    // customer's chosen pickup branch rides via the draft (WO-DELIVERY-D1). Money is
    // unaffected — branch_id is routing metadata, not a price input.
    branchId: priced.deliveryZone?.branchId ?? args.draft.branchId ?? null,
  };
}

export async function persistOrderFromDraft(
  admin: SupabaseClient,
  args: { restaurantId: string; conversationId: string; customerId: string | null; draft: OrderDraft; agentRunId?: string | null }
): Promise<PersistOrderResult> {
  const { restaurantId, conversationId, customerId, draft, agentRunId } = args;
  if (!draft.finalized || !draft.lines.length) return { created: false, orderId: null, orderNumber: null };
  const { draft: verifiedDraft, zoneId, branchId } = await recomputeDraftFromDb(admin, { restaurantId, draft });

  // Idempotency key: the finalized draft content + the agent-run that produced it.
  // agentRunId is unique per customer message (deduplicated at the webhook level on
  // channel_message_id), so same-conversation reorders of identical items now get
  // distinct fingerprints and land as separate orders. A same-turn retry still
  // produces the same agentRunId → same UUID → safe idempotent no-op.
  const fingerprint = JSON.stringify({
    c: conversationId,
    r: agentRunId ?? null,
    lines: verifiedDraft.lines.map((l) => ({
      i: l.itemId,
      q: l.quantity,
      v: l.variant?.name ?? "",
      c: l.choices.map((x) => `${x.groupName}:${x.label}`).sort(),
      m: l.modifiers.map((x) => x.name).sort(),
    })),
    f: verifiedDraft.fulfillment,
    z: verifiedDraft.deliveryZone,
    t: verifiedDraft.total,
  });
  const id = uuidFromHash(fingerprint);

  // Items + money: copied from the server-verified draft.
  const items = verifiedDraft.lines.map((l, idx) => ({
    id: `${l.itemId}-${idx}`,
    menuItemId: l.itemId,
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    variant: l.variant?.name,
    choices: l.choices.map((c) => c.label),
    modifiers: l.modifiers.map((m) => m.name),
    total: l.lineTotal,
  }));

  // Double-tap window guard. The agentRunId in `id` lets a genuine reorder of the
  // same basket save as a NEW row — but it also means two confirm messages with
  // different channel_message_ids (separate, concurrently-processed webhook POSTs)
  // would mint two distinct ids for the SAME basket. Before inserting, look for an
  // order in this conversation with an identical content-only fingerprint created
  // in the last ~120s; if found, treat this as the same order (no new row, no
  // duplicate customer confirmation). A real reorder happens outside this window
  // (it requires a multi-message basket rebuild) so it is unaffected.
  // NOTE: a SELECT→INSERT guard is not fully atomic; two truly simultaneous inserts
  // could still both pass. Future hardening: a partial-unique index makes it atomic.
  const DOUBLE_TAP_WINDOW_MS = 120_000;
  const contentKey = basketContentKey({ items, fulfillment: verifiedDraft.fulfillment ?? "pickup", total: verifiedDraft.total });
  const sinceIso = new Date(Date.now() - DOUBLE_TAP_WINDOW_MS).toISOString();
  const { data: recent } = await admin
    .from("orders")
    .select("id, order_number, items, fulfillment, total")
    .eq("restaurant_id", restaurantId)
    .eq("conversation_id", conversationId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(10);
  const dup = (recent ?? []).find(
    (o) =>
      basketContentKey({
        items: (o.items as FingerprintItem[]) ?? [],
        fulfillment: (o.fulfillment as string) ?? "pickup",
        total: Number(o.total),
      }) === contentKey
  );
  if (dup) {
    return { created: false, orderId: dup.id as string, orderNumber: (dup.order_number as string) ?? null };
  }

  // Idempotency check on the key the UPSERT actually dedupes on. The guard above
  // is a content fingerprint over recent orders; the upsert keys on `id`. A
  // webhook redelivery resolves to the same `id`, so it can miss the fingerprint
  // guard and still insert nothing — after allocating a number.
  //
  // That matters now in a way it did not before. The old allocator was a stateless
  // scan, so a wasted call cost nothing. next_order_number PERMANENTLY increments
  // a counter, so every redelivery burns a number and leaves a visible gap in a
  // field operators reconcile COD against.
  const { data: byId } = await admin
    .from("orders")
    .select("id, order_number")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (byId) {
    return { created: false, orderId: byId.id as string, orderNumber: (byId.order_number as string) ?? null };
  }

  const orderNumber = await nextOrderNumber(admin, restaurantId);

  // WO-COMPANION-W1-CORE (§1a.2, kitchen-ticket INVARIANT): copy the FULL session
  // allergy-note union onto the order AT create so the kitchen ticket carries every
  // allergen mentioned this conversation, independent of is_safety_hold. Deploy-safe:
  // the column is added by 0080; a missing column → the select errors → empty note →
  // we DON'T add the field to the insert, so a pre-0080/flag-off tenant is byte-
  // identical. A non-empty note only exists when the companion flow wrote it (⇒ 0080
  // applied ⇒ the orders column exists), so the insert never errors on the column.
  let allergyNote = "";
  try {
    const { data: convNote } = await admin
      .from("conversations")
      .select("allergy_note")
      .eq("id", conversationId)
      .maybeSingle();
    allergyNote = ((convNote as { allergy_note?: string | null } | null)?.allergy_note ?? "").trim();
  } catch {
    /* column absent (0080 not applied) → inert */
  }

  const { data, error } = await admin
    .from("orders")
    .upsert(
      {
        id,
        restaurant_id: restaurantId,
        order_number: orderNumber,
        conversation_id: conversationId,
        customer_id: customerId,
        ...(allergyNote ? { allergy_note: allergyNote } : {}),
        fulfillment: verifiedDraft.fulfillment ?? "pickup",
        branch_id: branchId,
        zone_id: zoneId,
        address: verifiedDraft.address ?? null,
        notes: null,
        items,
        subtotal: verifiedDraft.subtotal,
        delivery_fee: verifiedDraft.deliveryFee,
        tax_amount: verifiedDraft.tax,
        tax_rate: verifiedDraft.taxRate,
        total: verifiedDraft.total,
        currency: verifiedDraft.currency,
        source: "whatsapp",
        order_status: "pending_confirmation",
        payment_status: "unpaid",
        // F1.7 Fix 1 / F1.6 — stamp the payment method at birth so pending/pickup/
        // cancelled WhatsApp orders aren't born NULL (uncapturable later). Sources the
        // customer's chosen method from the draft (set_payment_method); falls back to
        // "cod" (the default-on path, mirroring the web path) when none was chosen.
        // T7 — the "cod" fallback is RETAINED here deliberately (downstream COD
        // capture/reconciliation already treats null AND "cod" identically, so this
        // value is the safe non-null default), but the unspecified case is no longer
        // SILENT: a payment_unspecified alert fires below so the operator resolves the
        // real method instead of it just looking like a cash order.
        payment_method: verifiedDraft.paymentMethod ?? "cod",
      },
      { onConflict: "id", ignoreDuplicates: true }
    )
    .select("id, order_number");
  if (error) throw error;

  const created = (data?.length ?? 0) > 0;
  if (created) {
    await admin.from("conversations").update({ status: "بانتظار التأكيد" }).eq("id", conversationId);

    // T7 — make an UNDETERMINED payment method visible instead of letting the "cod"
    // fallback silently present it as a cash order. Only on a genuinely-created row
    // (never on an idempotent no-op/double-tap), so a retry doesn't re-alert. The
    // order is NOT lost — it's persisted and flagged for the operator to resolve.
    if (!verifiedDraft.paymentMethod) {
      await recordCriticalAlert(admin, {
        restaurantId,
        type: "payment_unspecified",
        detail: `طلب رقم ${orderNumber} اتسجّل من غير طريقة دفع محددة — محتاج تحديد طريقة الدفع.`,
        conversationId,
        context: { orderId: id, orderNumber, storedFallback: "cod" },
      });
    }

    // WO-T1-PAYMENTS: immutable per-order snapshot (offered + chosen) so the
    // WhatsApp path records selection like the web path. Flag-gated + best-effort;
    // self-loads the tenant's flags/config and NEVER blocks the order.
    try {
      const { data: rf } = await admin
        .from("restaurants")
        .select("feature_flags, payment_config")
        .eq("id", restaurantId)
        .maybeSingle();
      const flags = (rf?.feature_flags as Record<string, unknown> | null) ?? null;
      if (isFeatureExplicitlyEnabled("canonical_payment_methods", flags)) {
        const resolved = await loadResolvedPaymentMethods(admin, restaurantId, {
          paymentConfig: rf?.payment_config,
          featureFlags: flags,
        });
        await recordPaymentSnapshot(admin, {
          orderId: id,
          restaurantId,
          offered: offeredMethods(resolved.config),
          chosen: verifiedDraft.paymentMethod ?? "cod",
          featureFlags: flags,
        });
      }
    } catch {
      /* best-effort snapshot — never blocks the order */
    }

    return { created: true, orderId: id, orderNumber };
  }

  // Idempotent no-op: return the already-persisted row's number.
  const { data: ex } = await admin.from("orders").select("order_number").eq("id", id).maybeSingle();
  return { created: false, orderId: id, orderNumber: (ex?.order_number as string) ?? null };
}
