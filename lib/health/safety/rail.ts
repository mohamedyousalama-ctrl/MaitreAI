// ============================================================================
// فيصل / Faysal — SAFETY RAIL · the emergency rail. PURE.
// SPEC-4-SAFETY.md §4.1 (structure, not instruction), §4.2 (verbatim copy), §4.4 (which ER).
//
// THE RAIL IS UNREACHABLE-BY-ARGUMENT BECAUSE OF WHERE IT SITS, NOT BECAUSE OF WHAT A PROMPT
// SAYS. Everything below is STRUCTURAL:
//
//   • `toolNames: []`  — the booking tools are NOT IN THE TURN'S TOOL SET. There is nothing
//     to call. A model cannot be talked into calling a tool it was not given.
//   • `canBook: false`, `presentation: null` — no list, no buttons, no quick replies. A
//     tappable "Book now" beside an ambulance instruction is the defect.
//   • `composeFinalReply` is SKIPPED ENTIRELY — the recap, ask-back and turn-contract stages
//     each append a trailing question, and a trailing «نكمل الحجز؟» after an ambulance
//     instruction is the corrupted-composite failure `lib/ai/reply-compose.ts` exists to
//     prevent. `text` here is a FROZEN STRING, not a generation. No model call is made.
//   • upsell / campaign / offer are suppressed BY CLASS, not by a flag.
//
// AND THE ONE AWAITED WRITE. `openTriageHold()` (§1.5 R2) is awaited by the caller before the
// reply is enqueued, and its failure is not swallowed: a rail that speaks without holding is a
// rail the next turn walks past. See `triage-hold.ts`.
// ============================================================================

import type { RedFlagClass, RedFlagTier } from "./lexicon";

/** §4.4 — an ER site as the OPERATOR-MAINTAINED table returns it. The dossier is a research
 *  artifact and is NOT a data source for the rail: it disagrees with itself on four of six
 *  sites and says to confirm by phone. */
export interface ErSite {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly is_er: boolean;
  readonly er_open_24h: boolean;
  /** ISO instant. A site is eligible ONLY if this is within 30 days. Stale → ineligible. */
  readonly hours_verified_at: string | null;
  readonly verified_by: string | null;
}

export type RailBranch = "A" | "B" | "C";

export interface RailResult {
  readonly branch: RailBranch;
  readonly text: string;
  /** §4.1 — EMPTY. The booking tools are not in the turn's tool set. */
  readonly toolNames: readonly string[];
  readonly canBook: false;
  readonly presentation: null;
  readonly safetyEvent: true;
  /** §4.1 — on EVERY branch, A, B *and* C. SPEC-2 §4.5's emoji carve-out is scoped on this
   *  key and never on an emoji, so widening an emoji allowlist can never widen the rail. */
  readonly stopReason: "faysal_redflag_emergency";
  readonly triageHold: true;
  /** §4.1 — a mis-heard emergency digit has a physical consequence.
   *  `"faysal_redflag_emergency"` must NEVER be added to `VOICE_SPEAKABLE_STOP_REASONS`. */
  readonly voiceHardZeroReason: "safety_hold";
  /** The site actually named, or null on branch B. For the audit row and for §11.3. */
  readonly siteNamed: string | null;
  readonly pagerPriority: "P0";
}

/** §12 row 6 — THE MENTAL-HEALTH SUPPORT LINE SHIPS BLANK.
 *
 *  It renders as NOTHING until the group's medical director confirms, in writing, the national
 *  support number and its hours. This is the exact precedent set in
 *  `lib/ai/allergen-companion-flow.ts`, where the Egyptian branch was deliberately shipped
 *  with NO ambulance number rather than the Saudi one:
 *
 *      "a wrong number is worse than none, because it is dialled and it fails."
 *
 *  That defect — a Saudi number presented to an Egyptian patient as theirs — shipped live and
 *  is described in that file as the most dangerous it has had. A psychological-support number
 *  reached by a person in crisis has the same property.
 *
 *  IT IS A CONSTANT AND NOT A CONFIG READ, DELIBERATELY: a config value can be filled in by
 *  anyone with deploy access, and §12 row 6 requires a SIGNATURE. Changing this line is a
 *  code review with a named reviewer, which is the shape of the gate. */
export const SUPPORT_LINE_SENTENCE = "";

const SITE_VERIFY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** §4.4 — a site is eligible ONLY if `hours_verified_at` is within 30 days AND it is an ER.
 *  Stale is INELIGIBLE, and the staleness fires an operational alert to the group rather than
 *  degrading silently. Sending a patient with chest pain to a branch that closed at midnight
 *  is a lethal defect that a unit test cannot catch, so the code refuses to guess. */
export function eligibleErSites(sites: readonly ErSite[], now: Date): ErSite[] {
  const t = now.getTime();
  return sites.filter((s) => {
    if (!s.is_er) return false;
    if (!s.hours_verified_at) return false;
    const v = Date.parse(s.hours_verified_at);
    if (!Number.isFinite(v)) return false;
    return t - v >= 0 && t - v <= SITE_VERIFY_WINDOW_MS;
  });
}

// §4.2 — THE VERBATIM COPY. Riyadh register, WESTERN DIGITS
// (`dialectProfile("saudi").digitStyle === "western"`). THE INSTRUCTION LEADS, THE REASON
// FOLLOWS — a frightened person reads the first few words, and that ordering was a native-
// review correction in `lib/ai/allergen-companion-flow.ts`, carried forward deliberately.

/** A. Classes A–H, with a verified-open ER site from the tool. */
export function railA(siteName: string, siteAddress: string): string {
  return [
    "🚨 اتصل بالإسعاف 997 الحين.",
    "اللي وصفته يحتاج كشف عاجل، وما ينتظر موعد.",
    `أقرب طوارئ مفتوحة الحين: ${siteName} — ${siteAddress}`,
    "لا تسوق بنفسك. لو زاد الوضع أو صار إغماء، 997 قبل أي شي.",
    "سلامتك أهم، وما أقدر أشخّص من الشات.",
  ].join("\n");
}

/** B. Classes A–H, when NO site is confirmed open at this moment.
 *
 *  BRANCH B IS NOT A DEGRADED FALLBACK TO BE AVOIDED. It is the correct output whenever the
 *  roster cannot answer the question, and it must be the default the code reaches when
 *  anything is uncertain. It needs nothing but `997`, which is why it is reachable from
 *  inside a `catch` (§1.5 R3). */
export const RAIL_B = [
  "🚨 اتصل بالإسعاف 997 الحين.",
  "اللي وصفته يحتاج كشف عاجل، وما ينتظر موعد.",
  "ما أقدر أأكد لك فرع مفتوح هالحين، فلا تعتمد عليّ في هذا — 997 أسرع وأضمن.",
  "سلامتك أهم، وما أقدر أشخّص من الشات.",
].join("\n");

/** C. Class I (`self_harm`) — A DIFFERENT RAIL, because pointing a suicidal person at an ER
 *  address and stopping is the wrong act.
 *
 *  Note what it does NOT say: no «لا تسوي كذا», no «فكر في أهلك», no minimisation, and no
 *  promise that someone will call within a time we do not control. */
export function railC(): string {
  const lines = [
    "كلامك وصلني وآخذه على محمل الجد 🙏",
    "إذا فيه خطر على حياتك الحين، اتصل 997 أو روح أقرب طوارئ.",
  ];
  if (SUPPORT_LINE_SENTENCE) lines.push(SUPPORT_LINE_SENTENCE);
  lines.push("ما راح أكمل أي حجز الحين. تبي أوصلك بأحد من فريقنا يكلمك؟");
  return lines.join("\n");
}

const FROZEN: Omit<RailResult, "branch" | "text" | "siteNamed"> = Object.freeze({
  toolNames: Object.freeze([]) as readonly string[],
  canBook: false,
  presentation: null,
  safetyEvent: true,
  stopReason: "faysal_redflag_emergency",
  triageHold: true,
  voiceHardZeroReason: "safety_hold",
  pagerPriority: "P0",
});

/**
 * Build the rail. PURE — `now` and the site list are arguments, never reads.
 *
 * `cls: null` is the DETECTOR-EXCEPTION path (§1.5 R3): we could not classify, so we certainly
 * cannot route, and branch B is the answer. It is `emergency` and never `urgent`, because
 * `urgent` leaves booking reachable.
 */
export function emergencyRail(input: {
  readonly cls: RedFlagClass | null;
  readonly tier: RedFlagTier;
  readonly sites?: readonly ErSite[];
  readonly now?: Date;
}): RailResult {
  if (input.cls === "self_harm") {
    return { ...FROZEN, branch: "C", text: railC(), siteNamed: null };
  }
  // A detector exception names NO site — §1.5 R3 — and neither does a rail with no eligible,
  // recently-verified site. It never guesses "the nearest".
  if (input.cls === null) {
    return { ...FROZEN, branch: "B", text: RAIL_B, siteNamed: null };
  }
  const eligible = eligibleErSites(input.sites ?? [], input.now ?? new Date(0));
  const site = eligible[0];
  if (!site) return { ...FROZEN, branch: "B", text: RAIL_B, siteNamed: null };
  return { ...FROZEN, branch: "A", text: railA(site.name, site.address), siteNamed: site.name };
}

/** §4.3 — WHAT THE RAIL MAY NEVER CONTAIN, as a predicate rather than a hope. Returned as the
 *  list of offending tokens so a failing proof names them.
 *
 *  ═══════════════════════════════════════════════════════════════════════════════════════
 *  CORRECTED IN WAVE 1.7, AND THE CORRECTION IS A DEFECT THREE AUDITS DID NOT FIND.
 *
 *  §4.3 says the rendered rail contains NONE of «حجز» / «موعد» / «عرض» / «خصم» / «باقة».
 *  Transcribed literally, THAT ASSERTION IS RED AT BIRTH AGAINST §4.2'S OWN VERBATIM COPY,
 *  on all three branches:
 *
 *      branch A / B   «اللي وصفته يحتاج كشف عاجل، وما ينتظر موعد.»      ← «موعد»
 *      branch C       «ما راح أكمل أي حجز الحين.»                        ← «حجز»
 *
 *  That is exactly the T4 shape — a rule that never reached the artifact something downstream
 *  reads — one section away from where the audit found it, and the tempting fix is the wrong
 *  one twice over: deleting the two sentences removes «this does not wait for an appointment»
 *  (the whole point of the rail) and «I will not continue any booking» (the sentence that
 *  makes the refusal explicit to a person in crisis).
 *
 *  THE RULE §4.3 MEANT is that the rail may not OFFER a booking. Both surviving uses are
 *  REFUSALS — the grammatical opposite. So the two spans are exempted BY EXACT TEXT, listed
 *  here and nowhere else, and never by a general "is it negated?" heuristic: a heuristic over
 *  negation is precisely the kind of open-ended guard §2.9's T6 inversion was written to
 *  refuse, and a rail that can talk its way past its own output assertion is not a rail.
 *  Any OTHER occurrence of a booking word, in any inflection, still fails.
 *  ═══════════════════════════════════════════════════════════════════════════════════════ */
export const RAIL_BOOKING_WORD_EXEMPTIONS: readonly string[] = [
  "وما ينتظر موعد",       // branch A and B — "and it does not wait for an appointment"
  "ما راح أكمل أي حجز",   // branch C       — "I will not continue any booking"
];

export function railCopyViolations(text: string): string[] {
  const bad: string[] = [];
  const push = (why: string) => { if (!bad.includes(why)) bad.push(why); };
  for (const span of RAIL_BOOKING_WORD_EXEMPTIONS) text = text.split(span).join(" ");
  if (/ريال|﷼|sar\b|\$/i.test(text)) push("currency");
  if (/\b\d{1,3}(?:[.,]\d{2})?\s*(?:ريال|sar)\b/i.test(text)) push("price");
  if (/\b\d{1,2}:\d{2}\b|الساعة \d/.test(text)) push("time");
  if (/https?:\/\/|www\./i.test(text)) push("url");
  for (const w of ["حجز", "موعد", "عرض", "خصم", "باقة", "باقه"]) {
    if (new RegExp(`(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?${w}(?![ء-ي])`).test(text)) push(`booking word «${w}»`);
  }
  for (const w of ["لا تقلق", "ما فيك شي", "شكله عادي", "مو خطير", "ما يحتاج طوارئ", "الأمور تمام"]) {
    if (text.includes(w)) push(`reassurance «${w}»`);
  }
  return bad;
}
