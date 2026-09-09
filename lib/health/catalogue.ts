// ============================================================================
// فيصل / Faysal — the service catalogue and the ONE money calculator.
// SPEC-1-DOMAIN.md §7.3 (durations and buffers) and §9 (prices).
//
// EVERY PRICE IN THIS FILE IS INVENTED [DEMO-03]. The dossier contains exactly
// two kinds of price information and disclaims BOTH: a third-party marketplace
// range ("marketplace figures, not official tariffs") and TPA discount-card
// percentages ("insurer/TPA promotional rates, not walk-in cash prices").
// Rendering either as "Al Wattan's price" would be a false statement about the
// client's commercial terms, made by an agent wearing the client's brand, to
// the client's patients, in a demo shown to the client. We don't.
//
// THE RULES THIS MODULE ENFORCES:
//   PRICE-1  no bare number ever leaves the agent — the label is a frozen
//            suffix emitted HERE, by the renderer, never composed by a model
//   PRICE-2  ONE calculator. No template, no prompt and no UI computes a total.
//   PRICE-4  the TPA discount-card percentages are not in the catalogue at
//            any level, and are never spoken
//   PRICE-5  no site-level price variation in Wave 1 — one catalogue, all sites
//   PKG-1    package6 === 5 × session, asserted at module load, not in a comment
//   BUF-1    the buffer blocks the resource and is part of NOTHING for money
//   EMP-1    a corporate batch is never quoted
//
// ZERO imports from lib/order-pricing.ts. The discipline is borrowed; the code
// is not — a restaurant's line/variant/modifier model has nothing to say about
// a clinic, and the seam is the point.
// ============================================================================

import { PRICE_LABEL_AR } from "./config";
import { isSiteId } from "./sites";
import type { CatalogueService, PriceAnswer, ServicePrice, SiteId, SpecialtyKey } from "./types";

/** Anchored against the dossier's 56–200 SAR consultation band [D §4 L215]. */
function anchored(amountSar: number, anchorNote: string): ServicePrice {
  return {
    amountSar,
    basis: "demo_invented_anchored",
    anchorNote,
    requiresDemoLabel: true,
    vatNote: "excluded_unknown",
  };
}

/** No dossier reference point exists at all. Invented, and it says so. */
function unanchored(amountSar: number): ServicePrice {
  return {
    amountSar,
    basis: "demo_invented_unanchored",
    anchorNote: null,
    requiresDemoLabel: true,
    vatNote: "excluded_unknown",
  };
}

const BAND = "inside the dossier's 56–200 SAR marketplace consultation band — a SANITY CHECK, not a source";

function svc(
  id: string,
  nameAr: string,
  nameEn: string,
  specialty: SpecialtyKey,
  durationMinutes: number,
  bufferMinutes: number,
  price?: ServicePrice,
  extra: Partial<CatalogueService> = {}
): CatalogueService {
  return { id, nameAr, nameEn, specialty, durationMinutes, bufferMinutes, price, ...extra };
}

// ── The catalogue ───────────────────────────────────────────────────────────

export const SERVICES: readonly CatalogueService[] = Object.freeze([
  // Consultations — anchored (§9.3)
  svc("gp-consult", "كشف طب أسرة", "General / family medicine consultation", "general_family", 20, 0, anchored(90, BAND)),
  svc("paeds-consult", "كشف أطفال", "Paediatric consultation", "paediatrics", 15, 0, anchored(120, BAND)),
  svc("internal-consult", "كشف باطنية", "Internal medicine consultation", "internal_medicine", 20, 0, anchored(130, BAND)),
  svc("derm-consult", "كشف جلدية", "Dermatology consultation", "dermatology", 20, 0, anchored(150, BAND)),
  svc("ent-consult", "كشف أنف وأذن وحنجرة", "ENT consultation", "ent", 20, 0, anchored(150, BAND)),
  svc("ophth-consult", "كشف عيون", "Ophthalmology consultation", "ophthalmology", 20, 0, anchored(150, BAND)),
  svc("obgyn-consult", "كشف نساء وولادة", "OB-GYN consultation", "obgyn", 20, 0, anchored(170, BAND)),
  svc("neuro-consult", "كشف مخ وأعصاب", "Neurology consultation", "neurology", 20, 0, anchored(200, `${BAND} (top of the band)`)),
  svc(
    "followup-14d",
    "مراجعة خلال ١٤ يوم مع نفس الطبيب",
    "Follow-up within 14 days, same clinician",
    "general_family",
    20,
    0,
    anchored(0, "included; [INF-14] a common regional convention, not a dossier fact")
  ),

  // Women's health (§9.3) — «obgyn consult + ultrasound» is the §7.3 duration row.
  svc("pelvic-us", "أشعة صوتية للحوض", "Pelvic ultrasound", "obgyn", 30, 10, unanchored(300)),
  svc("obstetric-us", "أشعة صوتية للحمل", "Obstetric ultrasound (2D)", "obgyn", 30, 10, unanchored(350)),
  svc("pap-smear", "مسحة عنق الرحم", "Pap smear (collection + lab)", "obgyn", 20, 0, unanchored(300)),
  svc(
    "obgyn-consult-ultrasound",
    "كشف نساء وولادة مع أشعة صوتية",
    "OB-GYN consultation + ultrasound",
    "obgyn",
    40,
    10,
    // 170 + 300 — arithmetic over two catalogue rows, not a third invented number.
    // proof-faysal-domain asserts the identity so it cannot drift.
    unanchored(470)
  ),
  svc("antenatal-trimester", "باقة متابعة حمل لكل ثلث", "Antenatal package, per trimester", "obgyn", 40, 10, unanchored(1200), {
    priceOnly: true,
    termsAr: "الباقة لكل ثلث من الحمل، وتفاصيلها تتأكد من الاستقبال.",
  }),

  // Paediatrics (§9.3)
  svc("well-baby", "فحص نمو ومتابعة طفل", "Well-baby / growth check", "paediatrics", 20, 0, unanchored(150)),
  svc("nebuliser", "جلسة بخار", "Nebuliser session", "paediatrics", 30, 0, unanchored(120)),
  svc("vaccine-admin", "رسوم إعطاء لقاح", "Vaccine administration fee", "paediatrics", 15, 0, unanchored(100), {
    // Rule PED-1 — the ADMINISTRATION FEE is listed; the vaccine is not, and
    // Faysal never names a vaccine, a schedule, or claims one is in stock.
    termsAr: "الرسوم للإعطاء فقط، وتوفّر اللقاح نفسه يتأكد من العيادة.",
  }),

  // Laser hair removal — unanchored (§9.3). Consumes a device (§7.4).
  svc("laser-small-session", "ليزر منطقة صغيرة — جلسة", "Laser, small area, one session", "laser_aesthetics", 30, 15, unanchored(150), { resourceKind: "device" }),
  svc("laser-medium-session", "ليزر منطقة متوسطة — جلسة", "Laser, medium area, one session", "laser_aesthetics", 30, 15, unanchored(300), { resourceKind: "device" }),
  svc("laser-large-session", "ليزر منطقة كبيرة — جلسة", "Laser, large area, one session", "laser_aesthetics", 30, 15, unanchored(700), { resourceKind: "device" }),
  svc("laser-full-session", "ليزر كامل الجسم — جلسة", "Laser, full body, one session", "laser_aesthetics", 30, 15, unanchored(1200), { resourceKind: "device" }),
  svc("laser-small-pkg6", "باقة ٦ جلسات — منطقة صغيرة", "Laser package — 6 sessions, small area", "laser_aesthetics", 30, 15, unanchored(750), {
    resourceKind: "device",
    termsAr: PACKAGE_TERMS(),
  }),
  svc("laser-medium-pkg6", "باقة ٦ جلسات — منطقة متوسطة", "Laser package — 6 sessions, medium area", "laser_aesthetics", 30, 15, unanchored(1500), {
    resourceKind: "device",
    termsAr: PACKAGE_TERMS(),
  }),
  svc("laser-large-pkg6", "باقة ٦ جلسات — منطقة كبيرة", "Laser package — 6 sessions, large area", "laser_aesthetics", 30, 15, unanchored(3500), {
    resourceKind: "device",
    termsAr: PACKAGE_TERMS(),
  }),
  svc("laser-full-pkg6", "باقة ٦ جلسات — كامل الجسم", "Laser package — 6 sessions, full body", "laser_aesthetics", 30, 15, unanchored(6000), {
    resourceKind: "device",
    termsAr: PACKAGE_TERMS(),
  }),

  // Orthodontics — unanchored (§9.3)
  svc("ortho-assessment", "كشف تقويم مع أشعة وقياسات", "Orthodontic assessment + records", "orthodontics", 40, 10, unanchored(300)),
  svc("ortho-adjustment", "زيارة شد تقويم", "Orthodontic adjustment visit", "orthodontics", 20, 0, unanchored(200)),
  svc("ortho-metal", "تقويم معدني للفكين", "Fixed metal braces, both arches", "orthodontics", 40, 10, unanchored(6500), {
    priceOnly: true,
    termsAr: "يشمل متابعة ١٨ شهر، ويبدأ بعد كشف التقويم.",
  }),
  svc("ortho-ceramic", "تقويم خزفي للفكين", "Ceramic braces, both arches", "orthodontics", 40, 10, unanchored(9000), {
    priceOnly: true,
    termsAr: "يشمل متابعة ١٨ شهر، ويبدأ بعد كشف التقويم.",
  }),
  svc("ortho-aligners", "تقويم شفاف — حالة أساسية", "Clear aligners, basic case", "orthodontics", 40, 10, unanchored(12000), {
    priceOnly: true,
    termsAr: "حتى ١٤ خطوة، ويبدأ بعد كشف التقويم.",
  }),
  svc("ortho-retainers", "مثبتات علوي وسفلي", "Retainers, upper + lower", "orthodontics", 20, 0, unanchored(900)),

  // Whitening and hygiene — unanchored (§9.3)
  svc("dental-scaling", "تنظيف وتلميع أسنان", "Scaling + polishing", "dentistry", 30, 10, unanchored(250)),
  svc("whitening-inoffice", "تبييض بالعيادة — جلسة", "In-office whitening, one session", "dentistry", 60, 15, unanchored(900), {
    // POL-05 — prerequisites stated, outcomes NEVER predicted.
    termsAr: "التبييض يحتاج كشف وتنظيف قبله، والنتيجة تختلف من حالة لحالة.",
  }),
  svc("whitening-plus-kit", "تبييض بالعيادة مع طقم منزلي", "In-office whitening + take-home kit", "dentistry", 60, 15, unanchored(1300), {
    termsAr: "التبييض يحتاج كشف وتنظيف قبله، والنتيجة تختلف من حالة لحالة.",
  }),
  svc("whitening-kit", "طقم تبييض منزلي", "Take-home whitening kit only", "dentistry", 20, 0, unanchored(600), { priceOnly: true }),

  // Employment medicals — unanchored (§9.3)
  svc("emp-basic", "فحص ما قبل التوظيف — أساسي", "Pre-employment medical, basic panel", "employment_medicals", 30, 0, unanchored(250)),
  svc("emp-xray-labs", "فحص ما قبل التوظيف مع أشعة وتحاليل", "Pre-employment medical + chest X-ray + labs", "employment_medicals", 30, 0, unanchored(400)),
  // EMP-1 — batch pricing is a commercial negotiation. NO price row, ever.
  svc("emp-corporate-batch", "فحوصات موظفين — دفعة شركات", "Corporate batch (≥ 20 employees)", "employment_medicals", 30, 0, undefined, {
    priceOnly: true,
  }),

  // Priced by NOBODY — §9.4's deliberate absences. These exist so the booking
  // path works and the money path refuses.
  svc("dental-extraction", "خلع سن", "Dental extraction", "dentistry", 30, 15, undefined),
  svc("day-case-procedure", "إجراء اليوم الواحد", "Day-case procedure", "general_surgery", 90, 30, undefined),
  svc("lab-tests-as-requested", "تحاليل حسب طلب الطبيب", "Lab tests as requested by the doctor", "lab_radiology", 20, 0, undefined),
]);

function PACKAGE_TERMS(): string {
  return "الباقة صالحة ١٢ شهر، لمريض واحد باسمه، غير قابلة للتحويل، والجلسات غير المستخدمة غير مستردة.";
}

export function serviceById(serviceId: string): CatalogueService | null {
  return SERVICES.find((s) => s.id === serviceId) ?? null;
}

export function servicesForSpecialty(specialty: SpecialtyKey): CatalogueService[] {
  return SERVICES.filter((s) => s.specialty === specialty && !s.priceOnly);
}

// ── PRICE-2: the ONE calculator ─────────────────────────────────────────────

/**
 * Rule PRICE-1 + PRICE-2. The only function in Faysal that decides money.
 *
 * It returns the figure AND the label together, in one object, because a label
 * that can be dropped by the caller is not a label. `demoLabel` is non-null for
 * every basis except `client_confirmed`, and `renderedAr` already carries it —
 * there is no code path that produces a bare number.
 *
 * PRICE-5: `siteId` is validated and then IGNORED for the amount. We have no
 * evidence prices differ by branch and inventing branch-differentiated fees
 * would fabricate a commercial structure. [OPEN-05]
 */
export function quote(serviceId: string, siteId: SiteId): PriceAnswer {
  const service = serviceById(serviceId);
  if (!service) throw new Error(`service_unknown:${serviceId}`);
  if (!isSiteId(siteId)) throw new Error(`unknown_site:${siteId}`);
  if (!service.price) {
    // §9.4 — lab/radiology, ER, day-case surgery and extraction have no figure
    // anywhere in the dossier. Faysal quotes nothing and routes to reception.
    throw new Error(`price_not_in_catalogue:${serviceId}`);
  }

  const price = service.price;
  const demoLabel = price.basis === "client_confirmed" ? null : PRICE_LABEL_AR;
  const amount = price.amountSar;
  const head = `${service.nameAr}: ${amount} ر.س.`;
  const renderedAr = demoLabel ? `${head} — ${demoLabel}` : head;

  return {
    amount,
    currency: "SAR",
    basis: price.basis,
    demoLabel,
    serviceId,
    siteId,
    renderedAr: service.termsAr ? `${renderedAr} ${service.termsAr}` : renderedAr,
    termsAr: service.termsAr ?? null,
    vatNote: price.vatNote,
  };
}

/** The engine's public money entry point. One calculator, no second opinion. */
export function priceFor(serviceId: string, siteId: SiteId): PriceAnswer {
  return quote(serviceId, siteId);
}

// ── Module-load invariants — fail loud, never fall back ─────────────────────

/**
 * Rule PKG-1 — the package relationship is asserted by a test, not by a
 * sentence. Faysal says «باقة ٦ جلسات بسعر ٥», so the sentence and the numbers
 * are pinned to each other MECHANICALLY. lib/demo/config.ts documents at length
 * what happens when a figure is corrected where it is computed and left stale
 * where it is read; this throws at import instead.
 */
export const LASER_AREAS: ReadonlyArray<{ area: string; session: string; package6: string }> = Object.freeze([
  { area: "small", session: "laser-small-session", package6: "laser-small-pkg6" },
  { area: "medium", session: "laser-medium-session", package6: "laser-medium-pkg6" },
  { area: "large", session: "laser-large-session", package6: "laser-large-pkg6" },
  { area: "full", session: "laser-full-session", package6: "laser-full-pkg6" },
]);

/**
 * PKG-1's pairing, as data: given either half of a laser area, the session, the
 * six-session package and the sentence that may be said about them («باقة ٦
 * جلسات بسعر ٥»). Exposed so no renderer re-derives the relationship — the
 * numbers and the sentence are pinned to each other by assertCatalogueInvariants.
 */
export function packageFor(serviceId: string): {
  area: string;
  sessionId: string;
  packageId: string;
  sessions: number;
  paidSessions: number;
  sessionAmount: number;
  packageAmount: number;
} | null {
  const row = LASER_AREAS.find((r) => r.session === serviceId || r.package6 === serviceId);
  if (!row) return null;
  const session = serviceById(row.session);
  const pack = serviceById(row.package6);
  if (!session?.price || !pack?.price) return null;
  return {
    area: row.area,
    sessionId: row.session,
    packageId: row.package6,
    sessions: 6,
    paidSessions: 5,
    sessionAmount: session.price.amountSar,
    packageAmount: pack.price.amountSar,
  };
}

export function assertCatalogueInvariants(services: readonly CatalogueService[] = SERVICES): void {
  const amount = (id: string): number => {
    const s = services.find((x) => x.id === id);
    if (!s?.price) throw new Error(`catalogue_invariant_missing_price:${id}`);
    return s.price.amountSar;
  };

  // PKG-1 — six sessions for the price of five, at every area.
  for (const row of LASER_AREAS) {
    const six = amount(row.package6);
    const one = amount(row.session);
    if (six !== 5 * one) {
      throw new Error(`pkg1_violated:${row.area}:${six}!==5*${one}`);
    }
  }

  // The composite OB-GYN row is arithmetic over two catalogue rows, never a
  // third invented number.
  if (amount("obgyn-consult-ultrasound") !== amount("obgyn-consult") + amount("pelvic-us")) {
    throw new Error("composite_price_drifted:obgyn-consult-ultrasound");
  }

  // PRICE-4 — the TPA percentages are not in the catalogue at ANY level.
  // Built from parts on purpose: the literals must not exist in this module
  // either, or PRICE-4's own source-level assertion would be self-defeating.
  const pct = "%";
  const pctAr = "\u066A";
  const forbidden = ["20", "25", "30"].map((n) => n + pct).concat(["\u0662\u0660", "\u0662\u0665", "\u0663\u0660"].map((n) => n + pctAr));
  for (const s of services) {
    const blob = `${s.nameAr} ${s.nameEn} ${s.termsAr ?? ""} ${s.price?.anchorNote ?? ""}`;
    for (const bad of forbidden) {
      if (blob.includes(bad)) throw new Error(`price4_violated:${s.id}:${bad}`);
    }
  }

  // PRICE-1 — every priced row must be able to carry its label. A row whose
  // basis is a demo basis and whose requiresDemoLabel is false cannot exist in
  // the type system; this catches a hand-edited object cast past it.
  for (const s of services) {
    if (!s.price) continue;
    if (s.price.basis !== "client_confirmed" && s.price.requiresDemoLabel !== true) {
      throw new Error(`price1_violated:${s.id}`);
    }
  }
}

assertCatalogueInvariants();
