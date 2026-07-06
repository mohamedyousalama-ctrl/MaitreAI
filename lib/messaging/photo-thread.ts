// ============================================================================
// MaitreAI — WO-PHOTO-THREAD: compact captioned photo SEQUENCE (PURE, no I/O).
// Mohamed's note 4 — "small thread moving": when Khalid sends 2+ dish photos they
// should read as ONE compact captioned set, not N anonymous cards. WhatsApp already
// downscales link-sent images to inline previews (full-res only on tap), so literal
// "full-size walls" don't occur — the real clutter is unlabelled separate cards.
// This adds a single LEAD caption on the first image naming the set; every image
// keeps its own item name + price tag. V1-lean: the full Meta catalog carousel is
// post-V1; server-side re-encode compression is a deferred fast-follow (WhatsApp's
// own downscaling covers V1).
//
// PURELY PRESENTATION: this reshapes captions for images that ALREADY passed the
// media_guard caps/budget/hard-zero. It changes nothing about WHICH or HOW MANY
// images ship — the caller runs it on the post-cap slice.
// ============================================================================

export interface PhotoLike {
  /** Item display name. */
  name: string;
  /** Per-image caption — already "name — price currency" (photoCaption). */
  caption: string;
}

/** Max item names to spell out in the lead caption before summarizing the tail, so
 *  the lead stays a compact single line even for a full 3-image set. */
const LEAD_NAME_LIMIT = 3;

/** Build the lead line that names the set, e.g. "📸 صور: كبسة لحم • مندي دجاج". */
function buildLead(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const shown = clean.slice(0, LEAD_NAME_LIMIT);
  let list = shown.join(" • ");
  if (clean.length > LEAD_NAME_LIMIT) list += ` وغيرها`;
  return `📸 صور: ${list}`;
}

/**
 * Given the photos that will be sent (in order, already within the cap), return the
 * caption for each — aligned to the input order:
 *   • 1 photo  → its own caption, unchanged (no lead; a single card isn't a wall).
 *   • 2+ photos → photo[0] gets the LEAD line naming the set + its own name/price;
 *                 photos[1..N] keep their own name/price tag.
 * Pure + deterministic; never mutates the input.
 */
export function buildPhotoThreadCaptions(photos: PhotoLike[]): string[] {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  if (photos.length === 1) return [photos[0].caption];
  const lead = buildLead(photos.map((p) => p.name));
  return photos.map((p, i) => (i === 0 ? `${lead}\n${p.caption}` : p.caption));
}
