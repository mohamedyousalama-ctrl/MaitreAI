// ============================================================================
// فيصل / Faysal — branch strengths and routing. SPEC-1-DOMAIN.md §5.
//
// Rule STR-1 — a strength MUST cite the dossier. No strength may be built from
//              a star rating (RATE-1) or from a review of a named clinician
//              (Prohibition A).
// Rule STR-2 — reasons are CAPABILITY CLAIMS, never comparisons. "This is the
//              branch the group markets for laser" — never "their laser is
//              better", never "the doctors there are stronger", never "that
//              branch is rated higher". We have evidence about marketing,
//              accreditation and geography. We have none about outcomes.
// Rule STR-3 — a fallback is offered WITH ITS REASON. A silent substitution is
//              how a patient ends up in the wrong district.
// Rule C4-2  — a contested site is NEVER the only option offered.
// ============================================================================

import { bookableWindows, type HoursOpts } from "./hours";
import { canMintSlots, isContested, isSiteId, patientPhoneFor, siteById, siteInDistrict } from "./sites";
import type { AppointmentKind, BranchRecommendation, NeedKey, SiteId, SiteStrength } from "./types";

// ── §5.2 — the routing table ────────────────────────────────────────────────

function strength(
  siteId: SiteId,
  need: NeedKey,
  rank: 1 | 2 | 3,
  basis: SiteStrength["basis"],
  reasonAr: string,
  reasonEn: string,
  dossierRef: string,
  gated?: SiteStrength["gated"]
): SiteStrength {
  return { siteId, need, rank, basis, reasonAr, reasonEn, dossierRef, gated };
}

export const STRENGTHS: readonly SiteStrength[] = Object.freeze([
  strength("wattan-2", "derm_laser", 1, "group_marketing",
    "فرع الروابي هو الفرع اللي المجموعة تركّز فيه على الجلدية والليزر.",
    "Ar Rawabi is the branch the group focuses on for dermatology and laser.",
    "§8 L282, §3.2 L144-146"),
  strength("wattan-2", "dental_ortho", 1, "group_marketing",
    "الروابي فرع الأسنان والتقويم عندهم.",
    "Ar Rawabi is their dental and orthodontics branch.",
    "§3.2 L145-146, §8 L282"),
  strength("wattan-3", "endodontics", 1, "named_capability",
    "الربوة عندهم عيادة علاج جذور (حشو عصب).",
    "Ar Rabwah has an endodontics (root canal) clinic.",
    "§3.3 L159-160"),
  strength("shoaa-wurud", "accredited_care", 1, "accreditation",
    "شعاع الورود هو الفرع الحاصل على اعتماد المجلس السعودي CBAHI.",
    "Shoaa Al Wurud is the branch holding Saudi CBAHI accreditation.",
    "§2 L84, §3.5 L175, §2 L91"),
  strength("shoaa-wurud", "day_case_surgery", 1, "named_capability",
    "شعاع الورود يقدّم جراحات اليوم الواحد.",
    "Shoaa Al Wurud offers day-case surgery.",
    "§3.5 L194, §2 L76"),
  strength("shoaa-wurud", "employment_medical", 1, "named_capability",
    "شعاع الورود يسوّي فحوصات ما قبل التوظيف.",
    "Shoaa Al Wurud does pre-employment medicals.",
    "§3.5 L194, §2 L77"),
  strength("shoaa-wurud", "app_booking", 1, "named_capability",
    "فرعي شعاع لهم تطبيق جوّال للحجز.",
    "The two Shoaa branches have their own booking app.",
    "§3.5 L175, §8 L283"),
  strength("shoaa-rawdah", "app_booking", 2, "named_capability",
    "فرعي شعاع لهم تطبيق جوّال للحجز.",
    "The two Shoaa branches have their own booking app.",
    "§3.5 L175, §8 L283"),
  strength("wattan-1", "after_hours_er", 1, "hours",
    "اليمامة مفتوح ٢٤ ساعة وفيه طوارئ وطبيب مناوب.",
    "Al Yamamah is open 24 hours with an ER and a duty doctor.",
    "§3.1 L112-113, §3.1 L127"),
  strength("wattan-1", "urgent_tonight", 1, "hours",
    "اليمامة مفتوح ٢٤ ساعة وفيه طوارئ وطبيب مناوب.",
    "Al Yamamah is open 24 hours with an ER and a duty doctor.",
    "§3.1 L112-113, §3.1 L127"),
  strength("shoaa-wurud", "urgent_tonight", 2, "hours",
    "شعاع الورود معلن دوامه ٢٤/٧ وفيه طوارئ.",
    "Shoaa Al Wurud advertises 24/7 with an ER.",
    "§3.5 L184-185"),
  strength("wattan-1", "neurology", 1, "named_capability",
    "عيادة المخ والأعصاب مذكورة في فرع اليمامة.",
    "The neurology clinic is listed at Al Yamamah.",
    "§2 L82, §3.1 L127"),
  strength("wattan-1", "onsite_pharmacy", 1, "named_capability",
    "فيه صيدلية الديار بنفس المبنى.",
    "There's a Diyar pharmacy in the same building.",
    "§3.1 L118-119"),
  strength("shoaa-wurud", "onsite_pharmacy", 2, "named_capability",
    "فيه صيدلية بنفس المبنى.",
    "There's a pharmacy in the same building.",
    "§3.5 L194"),
  strength("wattan-4", "south_riyadh", 1, "geography",
    "عندنا فرع الشفا قريب منك — أأكّد لك دوامه وأرجع لك، وإلا أحجز لك في فرع ثاني الحين.",
    "We have the Ash Shifa branch near you — I'll confirm its hours and come back to you, or book you elsewhere now.",
    "§3.4 L162-165, gated by §8 L284",
    "requires_status_confirmation"),
  strength("wattan-4", "orthodontics_shifa", 1, "group_marketing",
    "فيه عرض تقويم معلن على فرع الشفا — أتأكد لك منه.",
    "There's an advertised orthodontics offer at the Shifa branch — let me confirm it for you.",
    "§3.4 L171, §9 L290",
    "requires_status_confirmation"),
  strength("shoaa-rawdah", "east_riyadh", 1, "geography",
    "فرع الروضة على الدائري الشرقي.",
    "The Ar Rawdah branch is on the Eastern Ring Road.",
    "§3.6 L197-198"),

  // §5.3's chains name these sites for these needs; a chain member is a
  // strength too, and Rule STR-1 applies to it identically.
  strength("shoaa-wurud", "derm_laser", 2, "group_marketing",
    "شعاع الورود كمان يسوّق الليزر والتجميل.",
    "Shoaa Al Wurud also markets laser and aesthetics.",
    "§3.5 L194"),
  strength("wattan-3", "derm_laser", 3, "named_capability",
    "الربوة عندهم جلدية وليزر ضمن جدول خصومات بطاقتهم.",
    "Ar Rabwah's published card schedule prices laser, so the service is provided there.",
    "§3.3 L161 [INF-06]"),
  strength("wattan-3", "dental_ortho", 2, "named_capability",
    "الربوة فيه عيادة أسنان وعلاج جذور.",
    "Ar Rabwah runs dentistry and endodontics.",
    "§3.3 L159-160"),
  strength("shoaa-wurud", "dental_ortho", 3, "named_capability",
    "شعاع الورود عندهم أسنان.",
    "Shoaa Al Wurud has dentistry.",
    "§3.5 L194"),
  strength("wattan-4", "dental_ortho", 3, "group_marketing",
    "فرع الشفا فيه تقويم معلن — أأكّد لك دوامه أول.",
    "The Shifa branch has an advertised orthodontics service — let me confirm its hours first.",
    "§3.4 L171",
    "requires_status_confirmation"),
  strength("shoaa-wurud", "paediatrics", 1, "named_capability",
    "شعاع الورود عندهم عيادة أطفال.",
    "Shoaa Al Wurud runs a paediatrics clinic.",
    "§3.5 L194"),
  strength("wattan-2", "paediatrics", 2, "named_capability",
    "الروابي عندهم أطفال.",
    "Ar Rawabi runs paediatrics.",
    "§3.2 L146"),
  strength("wattan-1", "paediatrics", 3, "named_capability",
    "اليمامة عندهم أطفال.",
    "Al Yamamah runs paediatrics.",
    "§3.1 L127"),
  strength("wattan-2", "obgyn", 1, "named_capability",
    "الروابي عندهم نساء وولادة.",
    "Ar Rawabi runs OB-GYN.",
    "§3.2 L146"),
  strength("wattan-2", "ent", 1, "named_capability",
    "الروابي عندهم أنف وأذن وحنجرة.",
    "Ar Rawabi runs ENT.",
    "§3.2 L146"),
  strength("shoaa-wurud", "ent", 2, "named_capability",
    "شعاع الورود عندهم أنف وأذن وحنجرة.",
    "Shoaa Al Wurud runs ENT.",
    "§3.5 L194"),
  strength("wattan-1", "south_riyadh", 2, "geography",
    "اليمامة كمان في جنوب الرياض، وهو الخيار اللي أقدر أثبّته لك الحين.",
    "Al Yamamah is the group's other southern-quadrant site.",
    "§3.1 L100-101 [INF-07]"),
  strength("wattan-2", "orthodontics_shifa", 2, "group_marketing",
    "الروابي فرع التقويم المعتمد عندهم.",
    "Ar Rawabi is their orthodontics branch.",
    "§3.2 L145-146"),

  // The two commonest asks after derm and dental. Both are `named_at_site` in
  // the §6.2 matrix at all three sites below — Rule STR-1 satisfied without
  // inventing an emphasis the group has never marketed.
  strength("wattan-2", "general_practice", 1, "named_capability",
    "الروابي فيه عيادة طب أسرة وعامة.",
    "Ar Rawabi runs family and general medicine.",
    "§3.2 L146"),
  strength("shoaa-wurud", "general_practice", 2, "named_capability",
    "شعاع الورود فيه طب أسرة.",
    "Shoaa Al Wurud runs family medicine.",
    "§3.5 L194"),
  strength("wattan-1", "general_practice", 3, "named_capability",
    "اليمامة فيه عيادات عامة وطبيب مناوب على مدار الساعة.",
    "Al Yamamah runs general clinics with a round-the-clock duty doctor.",
    "§3.1 L127"),
  strength("wattan-2", "internal_medicine", 1, "named_capability",
    "الروابي فيه عيادة باطنية.",
    "Ar Rawabi runs internal medicine.",
    "§3.2 L146"),
  strength("shoaa-wurud", "internal_medicine", 2, "named_capability",
    "شعاع الورود فيه باطنية.",
    "Shoaa Al Wurud runs internal medicine.",
    "§3.5 L194"),
  strength("wattan-1", "internal_medicine", 3, "named_capability",
    "اليمامة فيه باطنية.",
    "Al Yamamah runs internal medicine.",
    "§3.1 L127"),
]);

// ── §5.3 — the fallback chains. NEVER across needs. ─────────────────────────

const CHAINS: Record<NeedKey, readonly SiteId[]> = {
  derm_laser: ["wattan-2", "shoaa-wurud", "wattan-3"],
  dental_ortho: ["wattan-2", "wattan-3", "shoaa-wurud", "wattan-4"],
  endodontics: ["wattan-3"],
  accredited_care: ["shoaa-wurud"],
  day_case_surgery: ["shoaa-wurud"],
  employment_medical: ["shoaa-wurud"],
  app_booking: ["shoaa-wurud", "shoaa-rawdah"],
  after_hours_er: ["wattan-1", "shoaa-wurud"],
  urgent_tonight: ["wattan-1", "shoaa-wurud"],
  neurology: ["wattan-1"],
  onsite_pharmacy: ["wattan-1", "shoaa-wurud"],
  south_riyadh: ["wattan-4", "wattan-1"],
  orthodontics_shifa: ["wattan-4", "wattan-2"],
  east_riyadh: ["shoaa-rawdah"],
  paediatrics: ["shoaa-wurud", "wattan-2", "wattan-1"],
  obgyn: ["wattan-2", "shoaa-wurud"],
  ent: ["wattan-2", "shoaa-wurud"],
  general_practice: ["wattan-2", "shoaa-wurud", "wattan-1"],
  internal_medicine: ["wattan-2", "shoaa-wurud", "wattan-1"],
};

/** Free-text → NeedKey. Unmatched returns null; the caller asks, never guesses. */
const NEED_ALIASES: ReadonlyArray<[NeedKey, string[]]> = [
  ["derm_laser", ["laser", "ليزر", "جلدية", "derm", "dermatology", "بشرة"]],
  ["dental_ortho", ["أسنان", "dental", "تقويم", "ortho", "orthodontics"]],
  ["endodontics", ["عصب", "حشو عصب", "جذور", "root canal", "endodontics"]],
  ["accredited_care", ["cbahi", "سباهي", "اعتماد", "accredited"]],
  ["day_case_surgery", ["عملية اليوم الواحد", "day case", "day-case", "جراحة"]],
  ["employment_medical", ["فحص توظيف", "ما قبل التوظيف", "employment", "pre-employment"]],
  ["app_booking", ["تطبيق", "app"]],
  ["after_hours_er", ["طوارئ", "emergency", "er", "after_hours", "after hours", "بالليل", "متأخر", "بعد الدوام"]],
  ["urgent_tonight", ["اليوم", "الحين", "urgent", "tonight", "مستعجل"]],
  ["neurology", ["مخ", "أعصاب", "neuro", "neurology"]],
  ["onsite_pharmacy", ["صيدلية", "pharmacy"]],
  ["south_riyadh", ["الشفا", "shifa", "جنوب الرياض", "south"]],
  ["orthodontics_shifa", ["تقويم الشفا"]],
  ["east_riyadh", ["الروضة", "rawdah", "شرق الرياض", "الدائري الشرقي"]],
  ["paediatrics", ["أطفال", "paediatrics", "pediatrics", "طفلي", "ولدي"]],
  ["obgyn", ["نساء وولادة", "نسائية", "obgyn", "ob-gyn", "حامل", "حمل"]],
  ["ent", ["أنف", "أذن", "حنجرة", "ent"]],
  ["internal_medicine", ["باطنية", "باطني", "internal"]],
  ["general_practice", ["طب أسرة", "عيادة عامة", "طب عام", "general", "family medicine", "gp"]],
];

// NOT routable, deliberately: orthopaedics, urology, ophthalmology at most
// sites and every other `group_only` row in the §6.2 matrix. recommendBranch()
// THROWS `need_unrecognised` rather than naming a branch we cannot claim runs
// that clinic — Rule SPEC-1's conversational path («let me confirm which branch
// runs that clinic and come back to you») belongs to the persona layer, which
// can ask specialtyEvidence() what we are allowed to say.

/**
 * LONGEST ALIAS WINS, and a Latin alias must match a WHOLE WORD.
 *
 * Both halves are load-bearing, and both were found by the proof:
 *   • substring matching sent «orthopaedics» to the DENTAL branch, because
 *     "ortho" is inside it — a routing answer we have no evidence for, which is
 *     exactly what Rule STR-1 forbids;
 *   • first-match-wins sent «تقويم الشفا» to Ar Rawabi, because «تقويم» was
 *     listed first, quietly dropping the gated Shifa path (Rule C4-1).
 */
function aliasHit(q: string, alias: string): boolean {
  const a = alias.toLowerCase();
  if (/^[\x20-\x7E]+$/.test(a)) {
    const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(q);
  }
  return q.includes(a);
}

export function needFromText(text: string): NeedKey | null {
  const q = String(text ?? "").trim().toLowerCase();
  if (!q) return null;
  if (isNeedKey(q)) return q;
  let best: { need: NeedKey; len: number } | null = null;
  for (const [need, words] of NEED_ALIASES) {
    for (const w of words) {
      if (aliasHit(q, w) && (!best || w.length > best.len)) best = { need, len: w.length };
    }
  }
  return best?.need ?? null;
}

export function isNeedKey(v: string): v is NeedKey {
  return Object.prototype.hasOwnProperty.call(CHAINS, v);
}

export interface RecommendOpts extends HoursOpts {
  /** When given, bookability on that date steers the pick (Rule STR-3). */
  dateISO?: string;
  /** Districts the patient can't reach, or sites already refused. */
  excludeSiteIds?: SiteId[];
  /**
   * The patient's district IN THEIR OWN WORDS. It never changes the clinical
   * pick — it populates `nearestSiteId` so the caller can render SPEC-2 §6.2's
   * geography fork honestly: nearest first, then what is only at the other one.
   */
  districtAr?: string | null;
}

function strengthFor(siteId: SiteId, need: NeedKey): SiteStrength | null {
  return (
    STRENGTHS.filter((s) => s.need === need && s.siteId === siteId).sort((a, b) => a.rank - b.rank)[0] ??
    null
  );
}

/**
 * ONE branch, and THE REASON IT IS THAT BRANCH. Never «أي فرع يمشي».
 *
 * The reason line is always present — that is the contract, and a
 * recommendation without one is a routing decision the patient cannot check.
 */
export function recommendBranch(need: NeedKey | string, opts: RecommendOpts = {}): BranchRecommendation {
  const key = isNeedKey(String(need)) ? (String(need) as NeedKey) : needFromText(String(need));
  if (!key) throw new Error(`need_unrecognised:${String(need)}`);

  const excluded = new Set(opts.excludeSiteIds ?? []);
  const chain = CHAINS[key].filter((id) => !excluded.has(id) && canMintSlots(id));
  if (chain.length === 0) throw new Error(`no_site_for_need:${key}`);

  const bookableOn = (siteId: SiteId): boolean =>
    !!opts.dateISO && bookableWindows(siteId, opts.dateISO, opts).length > 0;

  const primary = chain[0];
  let chosen = primary;
  let fallbackFromSiteId: SiteId | undefined;
  let fallbackReasonAr: string | undefined;

  if (opts.dateISO) {
    // Rule STR-3 — if the primary cannot take the patient on the day they
    // asked for, we say WHY and name what we can do instead.
    if (!bookableOn(primary)) {
      const alt = chain.slice(1).find((id) => bookableOn(id));
      if (alt) {
        chosen = alt;
        fallbackFromSiteId = primary;
        fallbackReasonAr =
          `${siteById(primary).nameAr} ما أقدر أثبّت فيه موعد بهذا اليوم، ` +
          `ورقمه ${patientPhoneFor(primary)} لو تحب تتأكد منهم مباشرة.`;
      }
    }
  }

  // The branch in the patient's district, if they named one. It is REPORTED,
  // never substituted: the fork is «أقرب فرع لك هو X … بس أصارحك، Y هو اللي
  // نسوي فيه هذا» and the caller renders both halves.
  const nearest = opts.districtAr ? siteInDistrict(opts.districtAr) : null;

  const s = strengthFor(chosen, key) ?? strengthFor(primary, key);
  if (!s) throw new Error(`no_strength_for:${key}:${chosen}`);

  const gated = s.siteId === chosen ? s.gated ?? null : null;
  const contested = isContested(chosen);
  const canBook = opts.dateISO ? bookableOn(chosen) : !gated && !contested;
  const appointmentKind: AppointmentKind = gated || contested || !canBook ? "callback_request" : "slot";

  // Rule C4-2 — a contested or gated site is never the only option offered, and
  // neither is a site we cannot actually book on the requested day.
  const mustNameAlternate = !!gated || contested || appointmentKind === "callback_request";
  // §5.3 — the alternates are the REST OF THE SAME NEED'S CHAIN, never another
  // need's. Both gated sites (Ash Shifa) sit in chains that carry one, so C4-2
  // is satisfied by construction. Where a need has exactly one site (endodontics
  // at Ar Rabwah) this is empty and `mustNameAlternate` still true: the caller
  // must then say plainly that it is the only branch we can name for it, with
  // the phone number — inventing a second branch would be worse than saying so.
  const alternates = chain.filter((id) => id !== chosen);

  return {
    siteId: chosen,
    reasonAr: s.siteId === chosen ? s.reasonAr : `${siteById(chosen).nameAr} أقرب خيار أقدر أثبّته لك الحين.`,
    reasonEn: s.siteId === chosen ? s.reasonEn : `${siteById(chosen).nameEn} is the option I can actually book.`,
    basis: s.basis,
    rank: s.rank,
    dossierRef: s.dossierRef,
    gated,
    mustNameAlternate,
    alternates,
    phone: patientPhoneFor(chosen),
    appointmentKind,
    fallbackFromSiteId,
    fallbackReasonAr,
    nearestSiteId: nearest,
    nearestReasonAr: nearest && nearest !== chosen ? `فرع ${siteById(nearest).nameAr} هو الأقرب لك.` : null,
    safetyRailOutranks: key === "urgent_tonight" || key === "after_hours_er",
  };
}

/** The whole chain for a need, in order — for "what else do you have?". */
export function fallbackChain(need: NeedKey): readonly SiteId[] {
  return CHAINS[need];
}

/** Every authored strength for a site, for the branch page and for audit. */
export function strengthsForSite(siteId: SiteId): SiteStrength[] {
  if (!isSiteId(siteId)) return [];
  return STRENGTHS.filter((s) => s.siteId === siteId);
}
