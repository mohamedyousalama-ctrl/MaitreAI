// ============================================================================
// MaitreAI — Item 13: knowledge COUNTS (pure; browser+server safe)
// The console's «صحة الذاكرة» shows DERIVED readiness scores (lib/knowledge), but
// operators also need the RAW, reconcilable truth: how many items exist, how many
// are priced, how many zones/FAQs, and when knowledge was last taught. Derived
// percentages can't be audited against reality («47/129?» «2/25?»); these counts
// can. The reconciliation report pairs each headline as have/total with a % so a
// fraction shown in the UI is always backed by real rows, never a guess.
//
// Pure: the endpoint fetches the rows, this counts them.
// ============================================================================

export interface CountItem { price: number | null; updated_at: string | null }
export interface CountFlagged { active: boolean | null; updated_at: string | null }

export interface KnowledgeCountsInput {
  items: CountItem[];
  zones: CountFlagged[];
  faqs: CountFlagged[];
}

export interface ReconciliationLine {
  key: string;
  have: number;
  total: number;
  /** have/total as a 0–100 integer (0 when total is 0). */
  pct: number;
}

export interface KnowledgeCounts {
  items: { total: number; priced: number; unpriced: number };
  zones: { total: number; active: number };
  faqs: { total: number; active: number };
  /** Most recent updated_at across items/zones/faqs, or null when nothing exists. */
  lastTaughtAt: string | null;
  /** Auditable have/total pairs — the reconciliation report (e.g. priced 47/129). */
  reconciliation: ReconciliationLine[];
}

const pctOf = (have: number, total: number): number => (total > 0 ? Math.round((have / total) * 100) : 0);

const maxIso = (isos: Array<string | null>): string | null => {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const iso of isos) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isFinite(ms) && ms > bestMs) { bestMs = ms; best = iso; }
  }
  return best;
};

export function computeKnowledgeCounts(input: KnowledgeCountsInput): KnowledgeCounts {
  const itemsTotal = input.items.length;
  const priced = input.items.filter((i) => (i.price ?? 0) > 0).length;

  const zonesTotal = input.zones.length;
  const zonesActive = input.zones.filter((z) => z.active === true).length;

  const faqsTotal = input.faqs.length;
  const faqsActive = input.faqs.filter((f) => f.active === true).length;

  const lastTaughtAt = maxIso([
    ...input.items.map((i) => i.updated_at),
    ...input.zones.map((z) => z.updated_at),
    ...input.faqs.map((f) => f.updated_at),
  ]);

  return {
    items: { total: itemsTotal, priced, unpriced: itemsTotal - priced },
    zones: { total: zonesTotal, active: zonesActive },
    faqs: { total: faqsTotal, active: faqsActive },
    lastTaughtAt,
    reconciliation: [
      { key: "items_priced", have: priced, total: itemsTotal, pct: pctOf(priced, itemsTotal) },
      { key: "zones_active", have: zonesActive, total: zonesTotal, pct: pctOf(zonesActive, zonesTotal) },
      { key: "faqs_active", have: faqsActive, total: faqsTotal, pct: pctOf(faqsActive, faqsTotal) },
    ],
  };
}
