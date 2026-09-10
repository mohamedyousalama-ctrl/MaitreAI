// ============================================================================
// فيصل / Faysal — the demo session, as a SEALED CLIENT-CARRIED TOKEN.
//
// The first cut kept sessions in a process-local Map and it was wrong off a
// single process: `/api/faysal/reset` and `/api/faysal/turn` are separate
// functions and can land on separate instances, so the greeting was re-sent on
// the visitor's first real message. It reproduced in `next dev` on turn one.
//
// So the session travels with the client, sealed and signed (`_domain/signing.ts`).
// The client echoes an opaque token; the server verifies the tag before it parses.
// Tampering does not yield an altered session — it yields NO session, and a fresh
// one is minted.
//
// ONE FIELD IS NOT A CONVENIENCE. `triageHold` implements SPEC-4 §1.5 R2: once
// the rail has fired, booking is structurally unreachable ON THIS TURN AND ON
// EVERY LATER TURN IN THE THREAD until an operator releases it. A rail that
// speaks without holding is a rail the next turn walks past, and "never mind,
// I'm fine" is the failure mode with no recovery. Nothing in this file offers a
// way to clear it except minting a brand-new session.
// ============================================================================

import { randomUUID } from "node:crypto";
import { open, seal } from "../_domain/signing";
import { FAYSAL_SESSION_TTL_MS } from "./limits";
import type { DemoNeed, SiteId, SlotView, StoreSnapshot } from "../_domain";

export type Scene =
  | "S1_greeting"
  | "S2_discover"
  | "S3_route"
  | "S4_insurance"
  | "S5_slots"
  | "S6_close"
  | "S7_confirmed"
  | "S9_expand"
  | "S10_escalate"
  | "S11_offhours"
  | "S14_closed";

export interface FaysalSession {
  id: string;
  createdAt: number;
  lastAt: number;
  turns: number;

  scene: Scene;
  /** Rule DEMO-1(b) — fires once per thread, deferred past a rail turn (detail 4b). */
  demoLineSent: boolean;
  greeted: boolean;

  /** SPEC-4 §1.5 R2. Never cleared. */
  triageHold: boolean;
  triageClass: string | null;

  /** What the patient told us, in their own words. Never inferred. */
  need: DemoNeed | null;
  districtAr: string | null;
  carrierAr: string | null;
  payment: "insurance" | "cash" | null;
  /** SPEC-2 §4.6 — set only on an unambiguous signal, then never revisited. */
  addressGender: "m" | "f";
  askedFemaleDoctor: boolean;

  siteId: SiteId | null;
  nearSiteId: SiteId | null;
  forkOffered: boolean;
  askedPayment: boolean;
  quotedPrice: boolean;

  offeredSlots: SlotView[];
  /**
   * `lib/health`'s booking store, carried by the CONVERSATION rather than left in
   * a process-local Map. On Vercel the turn that holds a slot and the turn that
   * confirms it can land on different instances, and `confirmBooking` would throw
   * `hold_unknown` with the patient's chosen time still on their screen. One hold
   * and one appointment per demo conversation, so the payload stays small.
   */
  store: StoreSnapshot | null;
  holdId: string | null;
  heldSlot: SlotView | null;
  bookingRef: string | null;
  /** What was actually booked, in the words the patient read. Answers «موعدي باقي
   *  صح؟» and «خليه» without re-deriving anything, and survives the round trip
   *  through the sealed session envelope. */
  booked: { kind: "slot" | "callback"; slotLabelAr: string; branchShortAr: string; clinicAr: string } | null;
  /** The patient asked for a female clinician at some point. It rides with the
   *  booking (SPEC-2 §9 turn 10) instead of being answered once and forgotten. */
  prefersFemaleDoctor: boolean;
  /** The «طلبك مع دكتورة مسجّل» note is said ONCE, on the first turn that actually
   *  moves the booking — not on every turn, and never as a turn of its own. */
  genderNoteSent: boolean;
  /** «بكرة» / «اليوم» in the patient's own words, so the slot search starts on the
   *  day they asked for instead of on the first day with inventory. */
  preferredDayAr: string | null;
  /** The branch whose recommendation line has already been said. Saying «اللي
   *  يناسبك: …» twice in a row is the loudest tell that nobody is listening. */
  announcedSiteId: SiteId | null;
  /** A red flag fired at the URGENT tier this turn. Set before the spend guard and
   *  read when the reply is composed, so the line survives a guard refusal — a
   *  safety line gated on a billing counter is not a safety line. */
  urgentPending: boolean;
  /** Rule C4-1 — a coarse window in the patient's OWN words, never a clock time. */
  preferredWindowAr: string | null;
  /** The patient chose the contested branch; we are waiting on their own window. */
  awaitingCallbackWindow: boolean;

  patientNameAr: string;
  /** §4.3 budget: at most one of أبشر/تمام/على راسي per message, never two in a row. */
  lastCourtesy: string | null;
  /** §4.4 — one religious courtesy per conversation. */
  blessingUsed: boolean;
  /** §6.4 — one objection handled once; twice declined and he stops selling. */
  objections: Record<string, number>;
  /** §5.3 — the escalation is narrated only after it has actually fired. */
  escalationOffered: boolean;

  history: { role: "user" | "assistant"; content: string }[];
}

const SESSION_LABEL = "session";

/** Bounds the token. Only the classifier reads history, and it reads the tail. */
const TOKEN_HISTORY_TURNS = 6;
const TOKEN_HISTORY_CHARS = 200;

export function newSession(): FaysalSession {
  const now = Date.now();
  return {
    id: `fs_${randomUUID()}`,
    createdAt: now,
    lastAt: now,
    turns: 0,
    scene: "S1_greeting",
    demoLineSent: false,
    greeted: false,
    triageHold: false,
    triageClass: null,
    need: null,
    districtAr: null,
    carrierAr: null,
    payment: null,
    addressGender: "m",
    askedFemaleDoctor: false,
    siteId: null,
    nearSiteId: null,
    forkOffered: false,
    askedPayment: false,
    quotedPrice: false,
    offeredSlots: [],
    store: null,
    holdId: null,
    booked: null,
    prefersFemaleDoctor: false,
    genderNoteSent: false,
    preferredDayAr: null,
    announcedSiteId: null,
    urgentPending: false,
    heldSlot: null,
    bookingRef: null,
    preferredWindowAr: null,
    awaitingCallbackWindow: false,
    // SPEC-2 §9 turn 13: the name is taken from the WhatsApp profile and verified at
    // the confirmation, not asked for before the slot is held. On the demo surface
    // there is no profile, so this is the demo's stand-in and the confirmation
    // message invites a correction, exactly as turn 13 does.
    patientNameAr: "ضيف العرض التجريبي",
    lastCourtesy: null,
    blessingUsed: false,
    objections: {},
    escalationOffered: false,
    history: [],
  };
}

/** Seal the session for the round trip. History is trimmed to bound the token. */
export function encodeSession(s: FaysalSession): string {
  const trimmed: FaysalSession = {
    ...s,
    lastAt: Date.now(),
    history: s.history.slice(-TOKEN_HISTORY_TURNS).map((m) => ({
      role: m.role,
      content: m.content.slice(0, TOKEN_HISTORY_CHARS),
    })),
    // Only the two offered slots are ever picked from; carrying more is payload.
    offeredSlots: s.offeredSlots.slice(0, 2),
  };
  return seal(SESSION_LABEL, trimmed);
}

/**
 * Resolve a client-supplied token. It comes from a public page, so it is NEVER
 * trusted: a bad tag, a malformed payload or an expired session all mint a fresh
 * one, and the visitor never learns which.
 *
 * `triageHold` is the field this signature exists to protect. SPEC-4 §1.5 R2 makes
 * the rail's verdict non-revisable for the life of the thread; an unsigned session
 * would have let a visitor edit `triageHold: false` and walk out of an emergency
 * into a booking flow.
 */
export function resolveSession(raw: unknown): FaysalSession {
  const parsed = open<Partial<FaysalSession>>(SESSION_LABEL, raw);
  if (!parsed || typeof parsed.id !== "string") return newSession();
  if (typeof parsed.lastAt !== "number" || Date.now() - parsed.lastAt > FAYSAL_SESSION_TTL_MS) return newSession();
  // Merge onto a fresh session so a token minted by an older deploy — one missing a
  // field this build reads — cannot produce an `undefined` where a boolean belongs.
  return { ...newSession(), ...parsed, id: parsed.id } as FaysalSession;
}

export function pushHistory(s: FaysalSession, role: "user" | "assistant", content: string): void {
  s.history.push({ role, content });
  if (s.history.length > 24) s.history = s.history.slice(-24);
}

/** §4.3 budget helper — returns the courtesy if it is spendable, else null. */
export function spendCourtesy(s: FaysalSession, word: string): string | null {
  if (s.lastCourtesy) return null; // never in two consecutive messages
  s.lastCourtesy = word;
  return word;
}

export function resetCourtesy(s: FaysalSession): void {
  s.lastCourtesy = null;
}
