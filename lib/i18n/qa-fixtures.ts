// ============================================================================
// MaitreAI — Item 12: bidi QA fixtures.
// The canonical worst-case mixed string for eyeballing the Bdi/Num/Phone
// primitives: an Arabic name + a Latin token + a duration + a phone, all in one
// line. Rendered NAIVELY (raw interpolation) the number/phone reorder under RTL;
// rendered through the primitives each fragment stays put. Use in a styleguide /
// visual QA page, never by interpolating these into a live Arabic string.
// ============================================================================

export interface BidiFixture {
  /** Arabic display name (RTL). */
  name: string;
  /** A Latin/mixed token that must stay LTR-isolated. */
  token: string;
  /** A duration/count that must stay LTR-isolated. */
  duration: string;
  /** A phone number that must render LTR with its leading «+». */
  phone: string;
}

/** «بهاء 6m test · +20» — the reference fixture from the item-12 spec. */
export const QA_FIXTURE_BAHAA: BidiFixture = {
  name: "بهاء",
  token: "test",
  duration: "6m",
  phone: "+20",
};

export const BIDI_QA_FIXTURES: BidiFixture[] = [
  QA_FIXTURE_BAHAA,
  { name: "محمد", token: "vip", duration: "12h", phone: "+201030036000" },
];
