// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — conversations + messages data layer
// Loads the tenant's conversations (with customer + messages) mapped to the UI
// Conversation type, plus write-through helpers and a realtime subscription.
// Persisted fields only (messages/status/owner/intent); ephemeral AI working
// state (draftOrder/entities/typing) stays client-side.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelKey, ChatMessage, Conversation, MessageSender } from "@/lib/types";

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
  meta: Record<string, unknown> | null;
}

function toMessage(m: MsgRow): ChatMessage {
  const meta = m.meta ?? {};
  return {
    id: m.id,
    sender: m.sender as MessageSender,
    text: m.text,
    time: fmtTime(m.created_at),
    createdAtMs: m.created_at ? new Date(m.created_at).getTime() : undefined,
    confidence: meta.confidence as number | undefined,
    intent: meta.intent as ChatMessage["intent"],
    sources: meta.sources as ChatMessage["sources"],
    suggestedAction: meta.suggestedAction as string | undefined,
    metadata: meta,
  };
}

/** Load all conversations for the tenant, newest activity first. */
export async function loadConversations(s: SupabaseClient, restaurantId: string): Promise<Conversation[]> {
  const [{ data: convs }, { data: msgs }] = await Promise.all([
    s.from("conversations").select("*, customers(name, phone)").eq("restaurant_id", restaurantId).order("updated_at", { ascending: false }),
    s.from("messages").select("id, conversation_id, sender, text, created_at, meta").eq("restaurant_id", restaurantId).order("created_at", { ascending: true }),
  ]);

  const byConv = new Map<string, ChatMessage[]>();
  for (const m of (msgs ?? []) as MsgRow[]) {
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
    } as Conversation;
  });
}

const digits = (p: string) => p.replace(/\D/g, "");

/** Upsert customer + ensure a conversation exists; writes use the given ids. */
export async function ensureConversationDb(
  s: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  args: { phone: string; name?: string; channel: ChannelKey }
): Promise<void> {
  const { data: cust } = await s
    .from("customers")
    .upsert(
      { restaurant_id: restaurantId, phone: args.phone, ...(args.name ? { name: args.name } : {}), last_seen_at: new Date().toISOString() },
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
}

export async function insertMessageDb(
  s: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  msg: { id: string; sender: MessageSender; text: string; meta?: Record<string, unknown> }
): Promise<void> {
  const direction = msg.sender === "customer" ? "inbound" : "outbound";
  await s.from("messages").insert({
    id: msg.id,
    restaurant_id: restaurantId,
    conversation_id: conversationId,
    direction,
    sender: msg.sender,
    text: msg.text,
    meta: msg.meta ?? {},
    status: "sent",
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
  const ch = s
    .channel(`conv-${restaurantId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter }, onChange)
    .subscribe();
  return () => {
    void s.removeChannel(ch);
  };
}

export { digits };
