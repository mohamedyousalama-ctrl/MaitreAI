// ============================================================================
// WO-CALLBACK — «اطلب مكالمة» deterministic trigger + capture helpers (PURE, no I/O).
//
// A customer who wants a phone conversation gets a HUMAN callback. Khalid NEVER
// calls anyone (voice = V2); he offers to route the request to the team, captures a
// preferred time window, and confirms honestly. This module holds the deterministic
// pieces (detection, window parse, honest confirm, staff-alert text, status machine)
// so they are exhaustively unit-testable; the DB + send wiring is in
// lib/db/callback-requests.ts, gated on the callback_requests flag.
// ============================================================================

/** Normalize Arabic for robust matching (tashkeel/tatweel, alef/ya/ta-marbuta, spacing). */
export function normalizeAr(s: string): string {
  return String(s ?? "")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface CallbackTriggerHit {
  fired: boolean;
  /** The matched intent phrase (for the timeline/debug); null when not fired. */
  phrase: string | null;
}

// Explicit "call me / talk to a human by phone" requests — Egyptian + Gulf + English.
// Each requires a CALL/PHONE verb, not just "human" (a bare «محتاج حد» is handled by the
// normal escalation path, not necessarily a phone callback).
const CALLBACK_INTENT = [
  "كلمني", "كلموني", "كلمني تليفون", "اتصلوا فيني", "اتصلوا بي", "اتصل فيا", "اتصل بي",
  "اتصلوا عليا", "اتصلوا علي", "عايز اتصال", "ابغي اتصال", "ابي اتصال", "محتاج مكالمه",
  "عايز مكالمه", "ابغي مكالمه", "اطلب مكالمه", "ممكن حد يكلمني", "ممكن اتصال",
  "عايز اكلم حد بالتليفون", "ابغي اكلم احد", "ابي اكلم احد", "اكلم حد تليفون",
  "call me", "phone me", "give me a call", "can someone call me", "i want a call",
];

/** Detect an explicit request for a phone callback. Pure + deterministic. */
export function detectCallbackRequest(text: string): CallbackTriggerHit {
  const n = normalizeAr(text);
  if (!n) return { fired: false, phrase: null };
  for (const p of CALLBACK_INTENT) {
    if (n.includes(normalizeAr(p))) return { fired: true, phrase: p };
  }
  return { fired: false, phrase: null };
}

export type PreferredWindow = "now" | "within_hour" | "evening";

const WINDOW_PATTERNS: Array<[PreferredWindow, string[]]> = [
  ["now", ["الحين", "دلوقتي", "حالا", "الان", "توا", "now", "right now", "asap"]],
  ["within_hour", ["خلال ساعه", "بعد ساعه", "خلال الساعه", "بعد شويه", "قريب", "within an hour", "in an hour", "soon"]],
  ["evening", ["بالليل", "بالمسا", "المسا", "مساء", "بعد المغرب", "بعد العشا", "evening", "tonight", "at night"]],
];

/** Parse the customer's preferred window from a short answer. null = unclear (re-ask). */
export function detectPreferredWindow(text: string): PreferredWindow | null {
  const n = normalizeAr(text);
  if (!n) return null;
  for (const [w, pats] of WINDOW_PATTERNS) {
    if (pats.some((p) => n.includes(normalizeAr(p)))) return w;
  }
  return null;
}

/** Arabic label for a window — used in the honest confirm + the staff alert. */
export function windowLabelAr(w: PreferredWindow): string {
  switch (w) {
    case "now": return "في أقرب وقت";
    case "within_hour": return "خلال ساعة";
    case "evening": return "بالمساء";
  }
}

/**
 * Honest customer confirmation (§4). NEVER promises an exact time, NEVER claims the
 * call happened — status truth lives in the table. Just: "your request reached the team".
 */
export function buildCallbackConfirm(w: PreferredWindow): string {
  return `طلبتك وصلت للفريق، بيتصلون فيك ${windowLabelAr(w)} إن شاء الله 📞`;
}

/** Staff WhatsApp alert text (§3a): «📞 طلب مكالمة — [name/phone] — [window] — [reason]». */
export function buildStaffCallbackAlert(input: {
  name?: string | null;
  phone: string;
  window: PreferredWindow;
  reason: string;
}): string {
  const who = input.name && input.name.trim() ? `${input.name.trim()} (${input.phone})` : input.phone;
  return `📞 طلب مكالمة — ${who} — ${windowLabelAr(input.window)} — ${input.reason}`;
}

// ── Status machine (§2) ─────────────────────────────────────────────────────
export type CallbackStatus = "open" | "called" | "no_answer" | "cancelled";
export const CALLBACK_STATUSES: readonly CallbackStatus[] = ["open", "called", "no_answer", "cancelled"];

const LEGAL: Record<CallbackStatus, readonly CallbackStatus[]> = {
  open: ["called", "no_answer", "cancelled"],
  no_answer: ["called", "cancelled"], // a no-answer can be retried → called, or cancelled
  called: [], // terminal
  cancelled: [], // terminal
};

export function isValidCallbackStatus(s: unknown): s is CallbackStatus {
  return typeof s === "string" && (CALLBACK_STATUSES as readonly string[]).includes(s);
}

/** Is `from → to` a legal status transition? Same-state is a no-op (false — nothing to do). */
export function isLegalCallbackTransition(from: CallbackStatus, to: CallbackStatus): boolean {
  return LEGAL[from]?.includes(to) ?? false;
}
