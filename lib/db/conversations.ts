// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — conversations + messages data layer
// Loads the tenant's conversations (with customer + messages) mapped to the UI
// Conversation type, plus write-through helpers and a realtime subscription.
// Persisted fields only (messages/status/owner/intent); ephemeral AI working
// state (draftOrder/entities/typing) stays client-side.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeWithReload } from "@/lib/realtime/resubscribe";
import { paginateRange } from "@/lib/db/message-pagination";
import type { ChannelKey, ChatMessage, Conversation, MessageSender } from "@/lib/types";
import { normalizePhone } from "@/lib/messaging/phone";

const PALETTE = ["#2563eb", "#9333ea", "#059669", "#f97316", "#06b6d4", "#db2777"];
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const mer = h < 12 ? "ص" : "م";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${mer}`;
}

interface MsgRow {
  id: string;
  conversation_id: string;
  sender: string;
  text: string;
  created_at: string;
  status: string | null;
  meta: Record<string, unknown> | null;
}

const MESSAGE_STATUSES = new Set(["sending", "sent", "delivered", "read", "failed"]);

function toMessage(m: MsgRow): ChatMessage {
  const meta = m.meta ?? {};
  return {
    id: m.id,
    sender: m.sender as MessageSender,
    text: m.text,
    time: fmtTime(m.created_at),
    // T8 — surface the real send status so the bubble can show sending/sent/
    // failed honestly. Only pass known values through (legacy/null ⇒ undefined ⇒
    // no indicator). The bubble decides to show it only on outbound messages.
    status: m.status && MESSAGE_STATUSES.has(m.status) ? (m.status as ChatMessage["status"]) : undefined,
    createdAtMs: m.created_at ? new Date(m.created_at).getTime() : undefined,
    confidence: meta.confidence as number | undefined,
    intent: meta.intent as ChatMessage["intent"],
    sources: meta.sources as ChatMessage["sources"],
    suggestedAction: meta.suggestedAction as string | undefined,
    metadata: meta,
  };
}

// WO-CONV-LIST-PAGINATION — PostgREST caps a single response at db-max-rows (Supabase
// default 1000). The old un-ranged messages SELECT therefore returned only the OLDEST
// 1000 rows (ordered created_at ASC) once a tenant crossed 1000 messages, so the
// newest messages were silently dropped and every list preview (messages[last]) froze
// on a stale row. We now page through with .range() until a short page, so the full
// history — and thus the true newest message — is loaded.
const MESSAGES_PAGE = 1000; // one PostgREST page (matches the default db-max-rows cap)
// REFINEMENT 1 (binding) — hard cap the loop so no pathological case can spin forever
// against the live DB. 20 pages = 20k messages, well beyond current launch scale; a
// tenant that ever exceeds this is the trigger for the WO-CONV-LIST-SCALE follow-up
// (previews-only list + per-conversation history loader), not an unbounded client pull.
const MESSAGES_MAX_PAGES = 20;

/** Fetch ALL of a tenant's messages, paging past the PostgREST 1000-row cap. Ordered
 *  created_at ASC (with an id tiebreaker for a STABLE total order, so no row is dropped
 *  or duplicated at a page boundary), so the caller's messages[last] is the newest. */
async function loadAllMessages(s: SupabaseClient, restaurantId: string): Promise<MsgRow[]> {
  return paginateRange<MsgRow>(
    async (from, toInclusive) => {
      const { data } = await s
        .from("messages")
        .select("id, conversation_id, sender, text, created_at, status, meta")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, toInclusive);
      return (data ?? []) as MsgRow[];
    },
    { pageSize: MESSAGES_PAGE, maxPages: MESSAGES_MAX_PAGES },
  );
}

/** Load all conversations for the tenant, newest activity first. */
export async function loadConversations(s: SupabaseClient, restaurantId: string): Promise<Conversation[]> {
  const [{ data: convs }, msgs] = await Promise.all([
    s.from("conversations").select("*, customers(name, phone)").eq("restaurant_id", restaurantId).order("updated_at", { ascending: false }),
    loadAllMessages(s, restaurantId),
  ]);

  const byConv = new Map<string, ChatMessage[]>();
  for (const m of msgs) {
    const arr = byConv.get(m.conversation_id) ?? [];
    arr.push(toMessage(m));
    byConv.set(m.conversation_id, arr);
  }

  return ((convs ?? []) as Array<Record<string, unknown>>).map((c) => {
    const id = c.id as string;
    const cust = (c.customers as { name?: string; phone?: string } | null) ?? {};
    const messages = byConv.get(id) ?? [];
    const last = messages[messages.length - 1];
    return {
      id,
      customer: cust.name || cust.phone || "عميل",
      customerId: (c.customer_id as string) ?? undefined,
      phone: cust.phone || "",
      avatarColor: colorFor(id),
      channel: (c.channel as ChannelKey) ?? "whatsapp",
      owner: (c.owner as "ai" | "human") ?? "ai",
      status: c.status as Conversation["status"],
      lastMessage: last?.text ?? "",
      lastTime: last?.time ?? fmtTime(c.updated_at as string),
      unread: 0,
      branch: "",
      messages,
      aiConfidence: (c.confidence as number | null) ?? undefined,
      currentIntent: (c.last_intent as ChatMessage["intent"]) ?? undefined,
      escalationReason: (c.escalation_reason as string | null) ?? undefined,
      // Authoritative ownership fields — read-only surfacing, no write path here.
      ownershipState: (c.ownership_state as Conversation["ownershipState"]) ?? undefined,
      isSafetyHold: (c.is_safety_hold as boolean | null) ?? false,
      // MO1 — named ownership (resolved to a display name via GET /api/members).
      assignedMemberId: (c.assigned_member_id as string | null) ?? null,
      // WB2 — sales-lifecycle stage. select("*") carries it; absent (pre-migration
      // 0052) → defaults to "new" so the UI is deploy-safe with or without it.
      stage: (c.stage as Conversation["stage"]) ?? "new",
      // WB-FIX-1 — internal staff note (select("*") carries it; absent pre-0056 →
      // null). UI-store only — NEVER read into the agent prompt.
      staffNotes: (c.staff_notes as string | null) ?? null,
      // WB3 — ad referral context (null/absent for organic; select("*") carries it,
      // deploy-safe pre-migration 0053).
      adSourceType: (c.ad_source_type as string | null) ?? null,
      adSourceId: (c.ad_source_id as string | null) ?? null,
      adHeadline: (c.ad_headline as string | null) ?? null,
      adBody: (c.ad_body as string | null) ?? null,
      adReferrerUrl: (c.ad_referrer_url as string | null) ?? null,
      adCtwaClid: (c.ad_ctwa_clid as string | null) ?? null,
    } as Conversation;
  });
}

const digits = (p: string) => p.replace(/\D/g, "");

/** Upsert customer + ensure a conversation exists; writes use the given ids. */
/** WO-RACE-1 — ensureConversationDb rejects an un-normalizable phone at creation instead of
 *  storing a send-doomed row; the caller surfaces `invalid_phone` to the operator. */
export type EnsureConversationResult = { ok: true } | { ok: false; reason: "invalid_phone" };

export async function ensureConversationDb(
  s: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  args: { phone: string; name?: string; channel: ChannelKey }
): Promise<EnsureConversationResult> {
  // Canonical phone (Step 2): an operator may type a local number (01030036000)
  // or paste one with +/spaces — WhatsApp wants international, trunk-less digits
  // (201030036000) or it rejects the recipient with #131030. Normalize on the
  // tenant's country so the stored row is wire-ready and the customers
  // (restaurant_id, phone) unique key dedups against the canonical form.
  const { data: rc } = await s.from("restaurants").select("country").eq("id", restaurantId).maybeSingle();
  const phone = normalizePhone(args.phone, (rc?.country as string | null) ?? null);
  // WO-RACE-1 (FR-014) — a phone that doesn't normalize is send-doomed (Meta #131030). Reject
  // at creation and surface it, rather than storing an empty/broken customer + conversation.
  if (!phone) return { ok: false, reason: "invalid_phone" };
  // Launch rule: ensure the customers row + link customer_id (same
  // (restaurant_id, phone) key the canonical ensureCustomerId helper uses; kept
  // inline here because this module is client-reachable and can't import the
  // server-only helper).
  const { data: cust } = await s
    .from("customers")
    .upsert(
      { restaurant_id: restaurantId, phone, ...(args.name ? { name: args.name } : {}), last_seen_at: new Date().toISOString() },
      { onConflict: "restaurant_id,phone" }
    )
    .select("id")
    .single();
  await s.from("conversations").upsert(
    {
      id: conversationId,
      restaurant_id: restaurantId,
      customer_id: cust?.id ?? null,
      channel: args.channel,
      status: "AI نشط",
      owner: "ai",
      ownership_state: "AI_ACTIVE",
    },
    { onConflict: "id" }
  );
  return { ok: true };
}

export async function insertMessageDb(
  s: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  msg: { id: string; sender: MessageSender; text: string; meta?: Record<string, unknown> }
): Promise<void> {
  const direction = msg.sender === "customer" ? "inbound" : "outbound";
  // T8 — a human operator reply actually goes over the WhatsApp wire and is
  // reconciled to sent/failed by the send route, so it must start as "sending"
  // (not a premature "sent"). Inbound customer + local system notes keep "sent"
  // (they don't traverse a wire whose result we await). The send logic itself is
  // unchanged — only this initial value is made honest.
  const status = msg.sender === "human" ? "sending" : "sent";
  await s.from("messages").insert({
    id: msg.id,
    restaurant_id: restaurantId,
    conversation_id: conversationId,
    direction,
    sender: msg.sender,
    text: msg.text,
    meta: msg.meta ?? {},
    status,
  });
  await s.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

export async function updateConversationDb(
  s: SupabaseClient,
  conversationId: string,
  patch: { status?: string; owner?: string; last_intent?: string | null; confidence?: number | null; escalation_reason?: string | null; handover_note?: string | null }
): Promise<void> {
  await s.from("conversations").update(patch).eq("id", conversationId);
}

/** Subscribe to realtime changes for this tenant's conversations + messages. */
export function subscribeConversations(
  s: SupabaseClient,
  restaurantId: string,
  onChange: () => void
): () => void {
  const filter = `restaurant_id=eq.${restaurantId}`;
  // WO-REALTIME-AUTH-REFRESH: active resubscribe-with-backoff (flag-ON) or the prior
  // fail-quietly reconnect-reload (flag-OFF, byte-identical). On (re)SUBSCRIBED the
  // store's (debounced, ephemeral-preserving) reload fires so changes missed while
  // offline are caught instead of leaving the conversation list silently stale.
  return subscribeWithReload(s, {
    channelName: `conv-${restaurantId}`,
    bind: (ch) =>
      ch
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter }, onChange),
    onChange,
    label: "conversations",
  });
}

export { digits };
