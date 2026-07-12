// ============================================================================
// WO-PHOTO-PERSIST — build the message row for a successfully-sent outbound dish
// photo. Pure (no I/O) so it is unit-testable; the caller (respond-and-send
// sendRequestedPhotos) inserts the returned object into `messages`. Additive to the
// jsonb `meta` — NO schema change. Gated by the persist_outbound_media flag; flag-off
// the send path never calls this, so it stays byte-identical.
//
// The row mirrors the outbound voice-note persist (direction outbound, sender "ai" =
// Karim). meta.image.url is the PUBLIC menu_items.image_url, so the console can render
// a real thumbnail directly (no media proxy needed for outbound).
// ============================================================================

export interface DishPhotoMessageInput {
  restaurantId: string;
  conversationId: string;
  /** Public menu_items.image_url that was sent. */
  imageUrl: string;
  /** The menu item's name (for the console's «صورة الصنف» label). */
  name: string;
  /** The caption that accompanied the image (name — price, or a thread lead). */
  caption?: string;
  /** WhatsApp message id from the send result, for idempotency / future status. */
  externalMessageId?: string | null;
}

export interface DishPhotoMessageRow {
  restaurant_id: string;
  conversation_id: string;
  direction: "outbound";
  sender: "ai";
  text: string;
  status: "sent";
  channel_message_id: string | null;
  meta: {
    kind: "dish_photo";
    image: { url: string; name: string; caption?: string };
  };
}

export function buildDishPhotoMessage(input: DishPhotoMessageInput): DishPhotoMessageRow {
  const caption = input.caption?.trim() || undefined;
  const name = input.name.trim();
  return {
    restaurant_id: input.restaurantId,
    conversation_id: input.conversationId,
    direction: "outbound",
    sender: "ai",
    // Preview/lastMessage text: the caption if there is one, else the item name —
    // never empty, so the conversation list shows something meaningful.
    text: caption ?? name,
    status: "sent",
    channel_message_id: input.externalMessageId ?? null,
    meta: {
      kind: "dish_photo",
      image: { url: input.imageUrl, name, ...(caption ? { caption } : {}) },
    },
  };
}
