// ============================================================================
// MaitreAI — Item 10: publish availability truth (pure; browser+server safe)
// Since 0050 (menu_publish_upsert, applied), publish_menu_draft UPSERTS live
// menu_items by name and PRESERVES each surviving item's `available` flag — so a
// re-publish no longer silently un-86's sold-out/safety-held items. The old
// publish route still claimed `availabilityReset: true` on every publish, which
// is now a FALSE warning. This computes the ACTUAL truth by diffing the set of
// 86'd item names before vs after a publish:
//   • preserved — 86'd before AND still 86'd after (the fix working: stays 86'd).
//   • lost      — 86'd before but NOT 86'd after → its 86 was dropped. This can
//                 only happen when the item was RENAMED or REMOVED from the draft
//                 (0050's documented limitation: a rename = remove-old + add-new,
//                 which loses the old id/86). THIS is the only case that warrants
//                 the reset warning.
// Pure so the route and its harness share one truth.
// ============================================================================

export interface AvailabilityDiff {
  /** 86'd before AND still 86'd after — the preservation working. */
  preserved: string[];
  /** 86'd before but no longer 86'd after (renamed/removed) — a real 86 loss. */
  lost: string[];
  /** True only when at least one 86 was actually lost — the honest warning gate. */
  availabilityReset: boolean;
}

export function diffUnavailable(beforeNames: string[], afterNames: string[]): AvailabilityDiff {
  const after = new Set(afterNames);
  const before = [...new Set(beforeNames)];
  const preserved = before.filter((n) => after.has(n));
  const lost = before.filter((n) => !after.has(n));
  return { preserved, lost, availabilityReset: lost.length > 0 };
}
