// ============================================================================
// Kivo (KSA) — PDPL consent: the PURE enforcement + capture-detection helpers.
//
// The law, in three rules (see 0073_pdpl_consent.sql):
//   1. In-conversation ALLERGEN SAFETY needs NO consent (vital interest). These
//      helpers NEVER touch the deterministic gate — the hold always works.
//   2. PERSISTING allergy/health info to customer_memory requires
//      consent_health_notes = true.
//   3. Marketing/campaign sends require consent_marketing = true.
//
// Kept import-free (pure) so it is node strip-types-testable and can be a
// blocking CI gate. The DB writer (record-consent.ts) and the operator route
// compose these.
// ============================================================================

/** Where a consent record came from. Mirrors the CHECK constraint in 0073. */
export type ConsentSource = "conversation" | "operator" | "import";
export const CONSENT_SOURCES: readonly ConsentSource[] = ["conversation", "operator", "import"];
export function isValidConsentSource(s: unknown): s is ConsentSource {
  return typeof s === "string" && (CONSENT_SOURCES as readonly string[]).includes(s);
}

/** The two independent consents a customer can grant. */
export type ConsentKind = "marketing" | "health_notes";
export const CONSENT_KINDS: readonly ConsentKind[] = ["marketing", "health_notes"];
export function isValidConsentKind(k: unknown): k is ConsentKind {
  return typeof k === "string" && (CONSENT_KINDS as readonly string[]).includes(k);
}

/** The consent-bearing subset of a customer row (only what enforcement reads). */
export interface CustomerConsent {
  consent_marketing?: boolean | null;
  consent_health_notes?: boolean | null;
}

/** RULE 3: may we send this customer a marketing/campaign message? Strict true. */
export function canSendMarketing(c: CustomerConsent | null | undefined): boolean {
  return c?.consent_marketing === true;
}

/** RULE 2: may we PERSIST allergy/health notes to this customer's memory? Strict
 *  true. (Safety-time processing does NOT call this — see rule 1.) */
export function canPersistHealthNotes(c: CustomerConsent | null | undefined): boolean {
  return c?.consent_health_notes === true;
}

/**
 * RULE 2 applied to the memory write: return the allergy_notes that may be
 * persisted. WITHOUT consent_health_notes, health content is dropped (empty),
 * so a memory row is never written with health data the customer didn't consent
 * to store. WITH consent, the notes pass through unchanged.
 */
export function gateHealthNotesForMemory(
  notes: string[] | null | undefined,
  c: CustomerConsent | null | undefined,
): string[] {
  if (!canPersistHealthNotes(c)) return [];
  return Array.isArray(notes) ? notes : [];
}

// ── Conversational capture detector ─────────────────────────────────────────
// A CONSERVATIVE detector for an EXPLICIT marketing opt-in/opt-out reply. It is
// intentionally narrow (explicit phrases only) to avoid false-positive consent —
// consent must be unambiguous. It is meant to run in the context of a consent
// PROMPT (the opt-in ask); wiring it into that flow is a thin follow-up once the
// campaigns/opt-in prompt lands. Returns 'grant' | 'deny' | null (no signal).
// NB: JS \b is ASCII-only, so it never sits cleanly beside Arabic letters — the
// Arabic patterns use plain substrings/anchors; \b is reserved for the English
// alternation where it works. DENY runs first (privacy-preserving), so a loose
// grant like /أوافق/ is safe: "لا أوافق" is caught by the deny rule above it.
const GRANT_PATTERNS: RegExp[] = [
  /أوافق/, // "I agree"
  /نعم.*(العروض|الرسائل|التسويق|النشرة)/,
  /(اشترك|اشتركني|سجلني).*(العروض|النشرة|الرسائل)/,
  /\b(yes|agree|opt[\s-]?in|subscribe)\b.*\b(offers?|marketing|updates?|messages?|newsletter)\b/i,
];
const DENY_PATTERNS: RegExp[] = [
  /(لا|ما)\s*أوافق/,
  /(لا|ما)\s*(أبغى|أبي|أريد|ابغى)\s*(العروض|الرسائل|التسويق)/,
  /(ألغ(ِ|ي)?|أوقف|إيقاف|توقف|وقف)\s*.*(العروض|الرسائل|الاشتراك|التسويق)/,
  /\b(stop|unsubscribe|opt[\s-]?out)\b/i,
  /\bno\b.*\b(offers?|marketing|messages?)\b/i,
];

export function detectMarketingConsentReply(text: string | null | undefined): "grant" | "deny" | null {
  const t = (text ?? "").toString().trim();
  if (!t) return null;
  // Deny takes precedence — a mixed message defaults to the privacy-preserving read.
  if (DENY_PATTERNS.some((re) => re.test(t))) return "deny";
  if (GRANT_PATTERNS.some((re) => re.test(t))) return "grant";
  return null;
}
