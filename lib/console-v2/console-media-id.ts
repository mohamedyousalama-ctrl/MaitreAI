// ============================================================================
// WO-MEDIA-PROXY — decide which media id (if any) the console may fetch for a
// message. Pure + tiny so the route's authorization decision is unit-testable.
//
// Only an INBOUND customer image is served through the proxy: its meta.image.id is a
// WhatsApp media-id with no public URL. Outbound dish photos carry a public
// meta.image.url and are rendered directly (WO-PHOTO-PERSIST), so they are NOT
// proxied. Anything else (voice, interactive, text, an image without an id) → null,
// so the route serves nothing it shouldn't.
// ============================================================================

/** The WhatsApp media-id to fetch for `meta`, or null if this message has none the
 *  console is allowed to proxy. */
export function resolveConsoleMediaId(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const image = (meta as Record<string, unknown>).image;
  if (!image || typeof image !== "object") return null;
  const id = (image as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * The customer's caption for a photo, for use as the image's alt text.
 *
 * Alt text and not a visible label: the caption is customer-authored, so it is
 * rendered by React as a text node and never as markup. Returns "" when absent,
 * so the caller can fall back to a generic Arabic description rather than
 * shipping an unlabelled image to a screen reader.
 */
export function photoCaption(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  const image = (meta as Record<string, unknown>).image;
  if (!image || typeof image !== "object") return "";
  const caption = (image as Record<string, unknown>).caption;
  return typeof caption === "string" ? caption.trim() : "";
}
