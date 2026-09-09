// ============================================================================
// فيصل / Faysal — THE DOMAIN BRIDGE.  ⚠ TEMPORARY — DELETE WHEN lib/health LANDS.
//
// WHAT THIS IS. The demo surface was built against the domain contract while
// `lib/health/*` was still being written by another agent. Rather than ship a
// surface that does not compile, this file implements the contract over the seed
// data transcribed in `seed.ts`, so `/faysal` genuinely books, genuinely refuses
// to book at a contested site, and genuinely renders Rule DEMO-1(c).
//
// WHAT THIS IS NOT. It is not a second opinion about the domain. Every rule it
// enforces is cited to SPEC-1 by section, and where SPEC-1 says "unknown" this
// file says unknown rather than guessing — that is the whole point of §0.2's
// "a flattened hours field is the exact mechanism by which a patient is sent to a
// locked door."
//
// HOW TO REMOVE IT. `_domain/index.ts` is the single swap point: one commented
// line there re-points every import in the app at `@/lib/health`. Then delete
// this file and `seed.ts`. Nothing else changes — the scene machine, the strings
// and the renderer all import from `_domain`, never from here.
//
// STATE. There is none that matters. A slot id is self-describing and a HOLD is a
// SIGNED TOKEN (`signing.ts`), so `confirmBooking` can verify a hold this instance
// never issued — which is what a serverless deployment actually needs and what a
// process-local Map silently failed to give (it reproduced in `next dev` within
// one turn: the greeting was re-sent because reset and turn were different module
// instances). The bookings Map is a convenience for `cancelBooking` only, and a
// booking here is explicitly «حجز تجريبي — غير مسجّل لدى الفرع» in any case. That
// is what `lib/health/db/` is for.
// ============================================================================

import type {
  BookableWindow,
  Booking,
  BranchRecommendation,
  Hold,
  InsuranceAnswer,
  NeedKey,
  OpenStateResult,
  Patient,
  PriceQuote,
  RecommendOpts,
  SiteId,
  Slot,
  SlotQuery,
} from "./contract";
import { CARRIERS, CLINICIANS, OPS, PRICES, ROUTES, SITES, SITE_IDS } from "./seed";
import { open, seal } from "./signing";

// ── Riyadh wall clock ───────────────────────────────────────────────────────
// SPEC-1 §4.1: "Riyadh is UTC+03:00 with no DST. Pinned; never derived from the
// server clock." A demo that reads the deployment region's clock will show a
// Saudi patient a European evening.

const RIYADH_OFFSET_MIN = 3 * 60;

export interface RiyadhParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  /** 0 = Sunday … 5 = Friday, 6 = Saturday. */
  weekday: number;
}

export function riyadhParts(when: Date): RiyadhParts {
  const shifted = new Date(when.getTime() + RIYADH_OFFSET_MIN * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

export function riyadhDateISO(when: Date): string {
  const p = riyadhParts(when);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Build an instant from a Riyadh wall-clock reading. */
export function fromRiyadh(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - RIYADH_OFFSET_MIN * 60_000);
}

const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** SPEC-2 §3.4 — «5:30 م», Western digits, 12-hour, never 24-hour. */
export function timeAr(when: Date): string {
  const p = riyadhParts(when);
  const suffix = p.hour < 12 ? "ص" : "م";
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, "0")} ${suffix}`;
}

/** «السبت 11:00 ص», with «اليوم»/«بكرة» when the day is today or tomorrow. */
export function slotLabelAr(when: Date, now: Date): string {
  const day = WEEKDAY_AR[riyadhParts(when).weekday];
  const dLabel = riyadhDateISO(when);
  const today = riyadhDateISO(now);
  const tomorrow = riyadhDateISO(new Date(now.getTime() + 24 * 3600_000));
  const prefix = dLabel === today ? "اليوم " : dLabel === tomorrow ? "بكرة " : "";
  return `${prefix}${day} ${timeAr(when)}`;
}

export function isFridayAt(when: Date): boolean {
  return riyadhParts(when).weekday === 5;
}

// ── openStateAt ─────────────────────────────────────────────────────────────

export function openStateAt(siteId: SiteId, when: Date): OpenStateResult {
  const site = SITES[siteId];
  const p = riyadhParts(when);
  const friday = p.weekday === 5;

  // SPEC-2 §2.3: UNVERIFIED must be reachable as a manual/structural flag, not
  // only by TTL. Complex 4 is a CONTRADICTION between sources plus no published
  // hours at all — SPEC-1 §3.4.1 + §4.6 — so it can never answer OPEN or CLOSED.
  if (site.contested || (!site.clinicHours.satThu && !site.clinicHours.friday)) {
    return { state: "UNVERIFIED", opensAtAr: null, isFriday: friday, contested: site.contested };
  }

  const window = friday ? site.clinicHours.friday : site.clinicHours.satThu;
  if (!window) {
    // Invariant H3: a missing day is unknown, never "closed by omission".
    return { state: "UNVERIFIED", opensAtAr: null, isFriday: friday, contested: false };
  }

  const [openH, closeH] = window;
  const nowMinutes = p.hour * 60 + p.minute;
  const state: OpenStateResult["state"] =
    nowMinutes >= openH * 60 && nowMinutes < closeH * 60 ? "OPEN" : "CLOSED";
  return {
    state,
    opensAtAr: timeAr(fromRiyadh(p.year, p.month, p.day, openH)),
    isFriday: friday,
    contested: false,
  };
}

// ── bookableWindows ─────────────────────────────────────────────────────────

export function bookableWindows(siteId: SiteId, dateISO: string): BookableWindow[] {
  const site = SITES[siteId];
  // Invariant H4 + SPEC-1 §6.3: only the demo-seeded clinic layer is bookable.
  // A `facility` or `er` window never authorises a clinic slot.
  if (!site.bookable) return [];

  const [y, m, d] = dateISO.split("-").map((n) => Number(n));
  if (!y || !m || !d) return [];
  const probe = fromRiyadh(y, m, d, 12);
  const friday = riyadhParts(probe).weekday === 5;
  const window = friday ? site.clinicHours.friday : site.clinicHours.satThu;
  if (!window) return [];

  const start = fromRiyadh(y, m, d, window[0]);
  const end = fromRiyadh(y, m, d, window[1]);
  return [
    {
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      labelAr: `${timeAr(start)} – ${timeAr(end)}`,
    },
  ];
}

/**
 * Is this clinic bookable at this site? SPEC-1 §6.2 + §6.3, as a predicate.
 *
 * `G` (group-wide) and `I` (inferred) are NOT bookable — Rule SPEC-1 turns them
 * into "let me confirm", and §6.2 footnote 1 says an inferred capability is
 * "inferred, therefore not bookable". Without this, the demo cheerfully offered
 * an orthopaedics slot at Ar Rawabi, where the matrix records orthopaedics as `G`
 * at every one of the six sites — an `availability_claim` (SPEC-2 §8.1 #12) with
 * a forty-minute drive attached to it.
 */
export function clinicBookableAt(siteId: SiteId, clinicKey: string): boolean {
  const site = SITES[siteId];
  if (!site?.bookable) return false;
  if (site.namedSpecialties.includes(clinicKey)) return true;
  return CLINICIANS.some((c) => c.clinicKey === clinicKey && c.siteIds.includes(siteId));
}

// ── recommendBranch ─────────────────────────────────────────────────────────

function nearestSiteFor(districtAr: string | null | undefined): SiteId | null {
  if (!districtAr) return null;
  const needle = districtAr.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").trim();
  for (const id of SITE_IDS) {
    for (const dist of SITES[id].nearDistrictsAr) {
      const hay = dist.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه");
      if (needle.includes(hay) || hay.includes(needle)) return id;
    }
  }
  return null;
}

export function recommendBranch(need: NeedKey, opts: RecommendOpts = {}): BranchRecommendation {
  const route = ROUTES[need] ?? ROUTES.general;
  // The clinically-best site is the first link in the chain that can ACTUALLY see
  // this patient — bookable, and carrying this clinic as a named capability rather
  // than a group-wide claim. Falling back to "the first non-contested link" alone
  // recommends a branch and then discovers it has no inventory, which is a wasted
  // turn at best and Rule STR-3's silent substitution at worst.
  //
  // Rule C4-2: a contested site is NEVER the only option, so it can never be the
  // clinical best — it can only ever be the *nearest*.
  const best =
    route.chain.find((id) => !SITES[id].contested && clinicBookableAt(id, route.clinicKey)) ??
    route.chain.find((id) => !SITES[id].contested) ??
    route.chain[0];
  const nearId = nearestSiteFor(opts.districtAr);

  if (!nearId || nearId === best) {
    return { siteId: best, reasonAr: route.reasonAr, nearest: null };
  }

  // The geography fork (SPEC-2 §6.2). What the near branch genuinely HAS —
  // never a comparison, never "less than".
  const near = SITES[nearId];
  const capability = near.clinicsAr.length
    ? `${near.clinicsAr.slice(0, 2).join(" و")}`
    : "عيادات عامة";
  return {
    siteId: best,
    reasonAr: route.reasonAr,
    nearest: { siteId: nearId, capabilityAr: capability },
  };
}

// ── searchSlots ─────────────────────────────────────────────────────────────

/** SPEC-1 §7.2 — deterministic generation. Same query, same day, same slots. */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SLOT_MINUTES = 30;
const SEARCH_DAYS = 10;

export function searchSlots(q: SlotQuery): Slot[] {
  const site = SITES[q.siteId];
  if (!site?.bookable) return []; // callback path — SPEC-1 §4.10 / §6.3.
  // A clinic this site does not carry has no slots, ever. The caller renders the
  // callback path; it does not render a time. (SPEC-1 §6.2, Rule SPEC-1.)
  if (!clinicBookableAt(q.siteId, q.clinicKey)) return [];

  const from = new Date(q.fromISO);
  if (Number.isNaN(from.getTime())) return [];
  const labelClock = q.nowISO ? new Date(q.nowISO) : from;
  const limit = Math.max(1, Math.min(q.limit ?? 2, 8));
  const route = Object.values(ROUTES).find((r) => r.clinicKey === q.clinicKey);
  const clinicAr = route?.clinicAr ?? q.clinicKey;
  // DOC-3: a clinician may only be scheduled inside a bookable window.
  const roster = CLINICIANS.filter((c) => c.clinicKey === q.clinicKey && c.siteIds.includes(q.siteId));

  const out: Slot[] = [];
  for (let dayOffset = 0; dayOffset < SEARCH_DAYS && out.length < limit; dayOffset++) {
    const probe = new Date(from.getTime() + dayOffset * 24 * 3600_000);
    const dateISO = riyadhDateISO(probe);
    const windows = bookableWindows(q.siteId, dateISO);
    if (!windows.length) continue;

    const winStart = new Date(windows[0].startISO);
    const winEnd = new Date(windows[0].endISO);
    // Never propose a slot in the past, and leave a real booking lead time.
    const earliest = new Date(Math.max(winStart.getTime(), from.getTime() + 60 * 60_000));

    for (let t = winStart.getTime(); t < winEnd.getTime() && out.length < limit; t += SLOT_MINUTES * 60_000) {
      if (t < earliest.getTime()) continue;
      const at = new Date(t);
      const seed = hash32(`${q.siteId}|${q.clinicKey}|${dateISO}|${t}`);
      // ~55% of the grid is already taken — a clinic with every slot free reads
      // as fake, and a demo that always offers 9:00 AM teaches nothing.
      if (seed % 100 < 55) continue;
      const doc = roster.length ? roster[seed % roster.length] : null;
      out.push({
        slotId: `slot_${q.siteId}_${q.clinicKey}_${t}`,
        siteId: q.siteId,
        clinicKey: q.clinicKey,
        clinicAr,
        startISO: at.toISOString(),
        labelAr: slotLabelAr(at, labelClock),
        isFriday: isFridayAt(at),
        doctorId: doc?.id ?? null,
        doctorAr: doc?.nameAr ?? null,
      });
    }
  }
  return out;
}

// ── hold → confirm → cancel  (SPEC-1 §7.5) ──────────────────────────────────

/**
 * SPEC-1 §7.5 — hold, THEN confirm.
 *
 * The hold is a SEALED TOKEN, not a row in a Map. The first cut used a Map and it
 * was wrong off a single process: on Vercel the turn that holds a slot and the
 * turn that confirms it can land on different instances, and the confirmation
 * would have failed with the visitor's chosen time already gone from the screen.
 * The token carries the slot id and the expiry and is signed, so `confirmBooking`
 * can verify a hold it has never seen. `lib/health/db/` replaces this with a row.
 */
interface HoldPayload {
  s: string; // slotId
  e: number; // expiresAt (epoch ms)
  w: string; // who
}

const bookings = new Map<string, Booking>();
const HOLD_TTL_MS = OPS.holdMinutes * 60_000;
const MAX_ROWS = 2_000;

function sweep(): void {
  if (bookings.size > MAX_ROWS) bookings.clear();
}

function slotFromId(slotId: string): Slot | null {
  // The id is server-minted and self-describing, so a hold survives the process
  // never having seen the search that produced it. The parse is strict: an id that
  // does not decode to a real site inside a real bookable window is refused.
  const m = /^slot_([a-z0-9-]+)_([a-z_]+)_(\d+)$/.exec(slotId);
  if (!m) return null;
  const siteId = m[1] as SiteId;
  const clinicKey = m[2];
  // The same rule as `searchSlots`, applied on the way back in. A slot id is
  // client-carried, so the confirm path re-checks the capability rather than
  // trusting that the search that produced it obeyed the rule.
  if (!clinicBookableAt(siteId, clinicKey)) return null;
  const at = new Date(Number(m[3]));
  if (Number.isNaN(at.getTime())) return null;
  const windows = bookableWindows(siteId, riyadhDateISO(at));
  if (!windows.length) return null;
  if (at < new Date(windows[0].startISO) || at >= new Date(windows[0].endISO)) return null;
  const route = Object.values(ROUTES).find((r) => r.clinicKey === clinicKey);
  const roster = CLINICIANS.filter((c) => c.clinicKey === clinicKey && c.siteIds.includes(siteId));
  const seed = hash32(`${siteId}|${clinicKey}|${riyadhDateISO(at)}|${at.getTime()}`);
  const doc = roster.length ? roster[seed % roster.length] : null;
  return {
    slotId,
    siteId,
    clinicKey,
    clinicAr: route?.clinicAr ?? clinicKey,
    startISO: at.toISOString(),
    labelAr: slotLabelAr(at, new Date()),
    isFriday: isFridayAt(at),
    doctorId: doc?.id ?? null,
    doctorAr: doc?.nameAr ?? null,
  };
}

export function holdSlot(slotId: string, who: string): Hold | null {
  const slot = slotFromId(slotId);
  if (!slot) return null;
  const expiresAt = Date.now() + HOLD_TTL_MS;
  const holdId = seal("hold", { s: slotId, e: expiresAt, w: who.slice(0, 64) } satisfies HoldPayload);
  return {
    holdId,
    slotId,
    expiresAtISO: new Date(expiresAt).toISOString(),
    holdMinutes: OPS.holdMinutes,
  };
}

export function confirmBooking(holdId: string, patient: Patient): Booking | null {
  sweep();
  const payload = open<HoldPayload>("hold", holdId);
  // An expired hold is NOT a booking. §6.5: "wait for real confirmation before
  // claiming it" — the caller renders the honest "that time is gone" line.
  if (!payload || typeof payload.e !== "number" || payload.e < Date.now()) return null;
  const slot = slotFromId(String(payload.s));
  if (!slot) return null;
  const site = SITES[slot.siteId];
  const booking: Booking = {
    ref: `WT-${hash32(holdId).toString(36).toUpperCase().slice(0, 6)}`,
    kind: "slot",
    siteId: slot.siteId,
    clinicAr: slot.clinicAr,
    slotLabelAr: slot.labelAr,
    preferredWindowAr: null,
    patientNameAr: patient.nameAr,
    carrierAr: patient.carrierAr ?? null,
    pendingBranchConfirmation: site.contested,
    // Rule DEMO-1(c)(4): true while ANY of the booking's data carries a demo basis.
    // Every clinic window in this build is `demo_seeded`, so it is always true here.
    demoBasis: true,
    isFriday: slot.isFriday,
  };
  bookings.set(booking.ref, booking);
  return booking;
}

/**
 * SPEC-1 §4.6 / Rule C4-1 — a request at a contested or hours-unknown site.
 * It consumes no slot inventory and NEVER carries a time the patient could turn
 * up for. `slotLabelAr` is null BY CONSTRUCTION, not by convention: there is no
 * argument to this function that could put a clock time on the confirmation.
 */
export function requestCallback(siteId: SiteId, patient: Patient): Booking {
  sweep();
  const site = SITES[siteId];
  const booking: Booking = {
    ref: `WT-${hash32(`${siteId}|${patient.nameAr}|${Date.now()}`).toString(36).toUpperCase().slice(0, 6)}`,
    kind: "callback_request",
    siteId,
    clinicAr: site.clinicsAr[0] ?? "الاستقبال",
    slotLabelAr: null,
    preferredWindowAr: patient.preferredWindowAr ?? null,
    patientNameAr: patient.nameAr,
    carrierAr: patient.carrierAr ?? null,
    pendingBranchConfirmation: true,
    demoBasis: true,
    isFriday: false,
  };
  bookings.set(booking.ref, booking);
  return booking;
}

/** Rule MED-6 — cancellation is never argued and no penalty is quoted. */
export function cancelBooking(ref: string): boolean {
  return bookings.delete(ref);
}

export function getBooking(ref: string): Booking | null {
  return bookings.get(ref) ?? null;
}

// ── priceFor ────────────────────────────────────────────────────────────────

/**
 * Rule PRICE-1's label, in SPEC-2 §5.2's wording — the one that ships. It is a
 * frozen suffix emitted HERE, by the quote renderer, and never composed by the
 * model. Rule PRICE-5: one catalogue, all sites — no site-level variation exists.
 */
export const PRICE_LABEL_AR = "هذا سعر استرشادي، والمعتمد من الاستقبال.";

export function priceFor(serviceId: string, siteId: SiteId): PriceQuote | null {
  void siteId; // Rule PRICE-5 — no site-level price variation in Wave 1.
  const row = PRICES.find((p) => p.id === serviceId);
  if (!row) return null;
  return {
    serviceId: row.id,
    serviceAr: row.nameAr,
    amount: row.amount,
    currency: "SAR",
    basis: row.basis,
    demoLabel: PRICE_LABEL_AR,
  };
}

export function packageFor(serviceId: string): { single: PriceQuote; pkg: PriceQuote } | null {
  const pkg = PRICES.find((p) => p.packageOf === serviceId);
  const single = PRICES.find((p) => p.id === serviceId);
  if (!pkg || !single) return null;
  return {
    single: { serviceId: single.id, serviceAr: single.nameAr, amount: single.amount, currency: "SAR", basis: single.basis, demoLabel: PRICE_LABEL_AR },
    pkg: { serviceId: pkg.id, serviceAr: pkg.nameAr, amount: pkg.amount, currency: "SAR", basis: pkg.basis, demoLabel: PRICE_LABEL_AR },
  };
}

// ── insuranceAnswer ─────────────────────────────────────────────────────────

/**
 * Rule INS-1 — NEVER promises coverage. Not partial, not full, not "should be".
 * `accepted` means only "the BUILDING appears on this carrier's network list".
 * `classKnown` is a literal false: Faysal does not know the class, the deductible
 * or the approval outcome, and SPEC-2 §5.2 makes «مغطّى» the forbidden word.
 */
export function insuranceAnswer(carrier: string, siteId: SiteId): InsuranceAnswer {
  const needle = carrier.trim().toLowerCase();
  const row = CARRIERS.find((c) => c.aliases.some((a) => needle.includes(a.toLowerCase())));
  const nameAr = row?.nameAr ?? carrier.trim();
  const listed = !!row && SITES[siteId].networks.includes(row.nameAr);
  return {
    accepted: listed,
    classKnown: false,
    sentenceAr:
      `شبكة ${nameAr} والفئة والتحمّل تطلع من بطاقتك نفسها، والاستقبال يأكدها لك قبل الكشف.\n` +
      `ما أبي أقول لك "مغطّى" وتطلع غير كذا.`,
  };
}

export function carrierNameAr(raw: string): string | null {
  const needle = raw.trim().toLowerCase();
  const row = CARRIERS.find((c) => c.aliases.some((a) => needle.includes(a.toLowerCase())));
  return row?.nameAr ?? null;
}
