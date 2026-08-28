// ============================================================================
// Kivo — the EPHEMERAL DEMO ORDER SESSION. SERVER ONLY.
//
// One `conversations` row per visitor, on the demo tenant, so the basket the
// Brain builds SURVIVES the turn. Without it the demo could not close an order at
// all: customer-turn.ts reloads the in-progress draft from the last AI message's
// `meta.draft`, and that reload is guarded by `if (conversationId)` — which both
// demo routes passed as null. Every turn therefore began from `emptyDraft()` and
// the agent asked «أجهّز لك الطلب؟» forever, because from its point of view there
// was never anything in the basket to finalize.
//
// THE THING THAT MAKES THIS SAFE, AND THE ONLY THING
// --------------------------------------------------
// The session id is held by the CLIENT and sent with every turn. The client is a
// public web page: the id in that request is attacker-controlled. So the id is
// never trusted — it is RESOLVED against the database with the tenant pinned:
//
//     .eq("id", candidate)
//     .eq("restaurant_id", DEMO_RESTAURANT_ID)   ← another tenant's id finds nothing
//     .eq("channel", DEMO_SESSION_CHANNEL)       ← a real thread finds nothing either
//
// A row that does not match BOTH is not an error and not a rejection — it simply
// is not found, and a fresh session is minted instead. That is deliberate: a
// visitor who pastes a real conversation id gets a working demo attached to their
// OWN new session, never a foothold in someone's live thread, and never an error
// message that tells them whether the id they guessed exists.
//
// The two `.eq` filters are independent controls and neither implies the other:
//   • restaurant_id alone would still admit the demo tenant's own real WhatsApp
//     conversations (the seed tenant is a normal tenant row and can have them).
//   • channel alone would admit any tenant's demo-channel row.
//
// WHAT IS NOT WRITTEN HERE
// ------------------------
// No customer row, no INBOUND message row. The inbound omission is load-bearing,
// not an oversight: lib/monitoring/sweep.ts fires `delivery_silence` — a WhatsApp
// message to the Founder — for any open tenant in `live`/`test` mode that has a
// recent inbound and then goes quiet. The demo tenant is open and is `test`. Write
// one inbound row per visitor and every abandoned demo becomes a 2am page.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEMO_RESTAURANT_ID,
  DEMO_SESSION_CHANNEL,
  DEMO_SESSION_TTL_MS,
  DEMO_SWEEP_BATCH,
  isUuid,
} from "./config";

export interface DemoSession {
  conversationId: string;
  /** True when this turn created the session (rather than resuming one). */
  minted: boolean;
}

/**
 * Resolve the demo session for this turn: reuse the caller's id when it genuinely
 * belongs to this tenant's demo channel and is still fresh, else mint a new one.
 *
 * FAILS SOFT, ON PURPOSE. If the database cannot give us a session the caller gets
 * null and passes `conversationId: null` to runCustomerTurn — which is exactly how
 * the demo behaved before this existed. A visitor then loses basket persistence for
 * that turn; they do not lose the demo. Refusing the turn instead would trade a
 * degraded demo for a broken one.
 */
export async function resolveDemoSession(
  admin: SupabaseClient,
  rawId: unknown
): Promise<DemoSession | null> {
  const existing = await findDemoSession(admin, rawId);
  if (existing) return { conversationId: existing, minted: false };
  return mintDemoSession(admin);
}

/**
 * The VALIDATOR. Returns the conversation id only when the candidate is a real row
 * that (a) belongs to the demo tenant, (b) sits on the demo channel, and (c) has
 * not aged past the TTL. Anything else — malformed, unknown, another tenant's,
 * another channel's, expired — returns null. Never throws.
 */
export async function findDemoSession(
  admin: SupabaseClient,
  rawId: unknown
): Promise<string | null> {
  // Shape first, and in JS. PostgREST answers a malformed uuid with a 22P02 ERROR,
  // not an empty result, so putting unvalidated input straight into `.eq("id", …)`
  // turns junk into a thrown query instead of a clean miss.
  if (!isUuid(rawId)) return null;
  const candidate = rawId.trim().toLowerCase();

  try {
    const { data, error } = await admin
      .from("conversations")
      .select("id, created_at")
      .eq("id", candidate)
      // ── THE TENANT PIN. Without this a visitor could name any conversation in
      //    the database and drive the Brain against it. It is not defence in
      //    depth; it is the control.
      .eq("restaurant_id", DEMO_RESTAURANT_ID)
      // ── THE CHANNEL PIN. Independent of the tenant pin: it is what stops the
      //    demo tenant's own (future) real WhatsApp thread being adopted.
      .eq("channel", DEMO_SESSION_CHANNEL)
      .maybeSingle();
    if (error || !data) return null;

    const createdAt = Date.parse(String((data as { created_at?: string }).created_at ?? ""));
    if (!Number.isFinite(createdAt)) return null;
    if (Date.now() - createdAt >= DEMO_SESSION_TTL_MS) return null; // expired → mint fresh

    return String((data as { id: string }).id);
  } catch {
    return null; // never break a demo turn over session lookup
  }
}

/**
 * Create a fresh demo session row. Returns null when the write fails — the caller
 * then runs the turn statelessly rather than refusing it.
 *
 * The TTL sweep is kicked off from here, and ONLY from here: minting happens once
 * per visitor, so the cleanup cost is paid on first contact instead of on every
 * turn. It is fired and forgotten — a sweep failure must never delay a reply.
 */
export async function mintDemoSession(admin: SupabaseClient): Promise<DemoSession | null> {
  try {
    const { data, error } = await admin
      .from("conversations")
      .insert({
        restaurant_id: DEMO_RESTAURANT_ID,
        channel: DEMO_SESSION_CHANNEL,
        // No customer row: a visitor with a link is nobody's customer, and a
        // customers row would outlive the sweep.
        customer_id: null,
        owner: "ai",
        status: "تجربة عامة",
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[demo] could not mint a session — running this turn stateless", error?.message);
      return null;
    }
    void sweepExpiredDemoSessions(admin).catch((e) =>
      console.error("[demo] session sweep failed (non-blocking)", e)
    );
    return { conversationId: String((data as { id: string }).id), minted: true };
  } catch (e) {
    console.error("[demo] could not mint a session — running this turn stateless", e);
    return null;
  }
}

/**
 * Delete demo sessions past the TTL, and the demo orders attached to them.
 *
 * ORDER MATTERS. `orders.conversation_id` is `ON DELETE SET NULL` (0001_init), so
 * dropping the conversation first would leave the order row behind — with the
 * visitor's delivery address on it — and no longer joinable to anything that says
 * it was a demo. Orders go first, matched on the conversations being removed AND
 * pinned to the demo tenant. `messages` is `ON DELETE CASCADE`, so the basket
 * drafts go with the conversation.
 *
 * Every statement is pinned to (restaurant_id = demo tenant, channel = demo), so
 * this can never reach a real tenant's data even if the id list were wrong.
 * Best-effort: returns the number of sessions removed, never throws.
 */
export async function sweepExpiredDemoSessions(admin: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - DEMO_SESSION_TTL_MS).toISOString();
  try {
    const { data: stale, error } = await admin
      .from("conversations")
      .select("id")
      .eq("restaurant_id", DEMO_RESTAURANT_ID)
      .eq("channel", DEMO_SESSION_CHANNEL)
      .lt("created_at", cutoff)
      .limit(DEMO_SWEEP_BATCH);
    if (error) return 0;
    const ids = (stale ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean);
    if (!ids.length) return 0;

    // Orders BEFORE conversations — see the note above.
    await admin
      .from("orders")
      .delete()
      .eq("restaurant_id", DEMO_RESTAURANT_ID)
      .in("conversation_id", ids);

    await admin
      .from("conversations")
      .delete()
      .eq("restaurant_id", DEMO_RESTAURANT_ID)
      .eq("channel", DEMO_SESSION_CHANNEL)
      .in("id", ids);

    return ids.length;
  } catch (e) {
    console.error("[demo] session sweep failed (non-blocking)", e);
    return 0;
  }
}
