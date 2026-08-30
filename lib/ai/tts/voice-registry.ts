// ============================================================================
// MaitreAI — THE VOICE RELEASE REGISTRY (KIV-313 handoff / KIV-95 provenance).
//
// One question, answered in one place: *is this voice allowed to speak?*
//
// WHY AN ALLOW LIST OF EXACTLY ONE, AND NOT A DENY LIST.
// KIV-313 says: "Pin only pYDa2s34YCzHjbn4DnXP; do not use `Khalid Demo`, `Saad`, any
// donor/clone/library/professional object, or historical voice ID." A deny list cannot
// implement that instruction, because the historical inventory is INCOMPLETE — KIV-95
// still carries four unrecorded provider voice objects, of which only one is identified.
// A deny list fails OPEN on every id nobody has written down yet, which is precisely the
// set we know the least about. An allow list of one fails CLOSED on all of them, including
// the ones we have not discovered, and it needs no inventory to be correct.
//
// The quarantined ids below are therefore NOT the security control. They exist so that a
// wrong pin produces a specific diagnosis ("that is the quarantined Khalid Demo object")
// instead of a generic refusal — an operator reading the log learns what they actually did.
//
// PROVENANCE IS THE POINT. G0-R is *Rights Remediation*: the gate exists because legacy
// voice objects had unclear provenance (donor recordings, clones). `Khalid kivo` is a
// fully synthetic Voice Design produced from a written prompt, provider category
// `generated` — there is no donor and no clone. That is a fact about THIS object, recorded
// here as inspectable evidence for KIV-95.
//
// THE GATE IS NOW SCOPED, BY FOUNDER RULING (KIV-90, 29 Aug 2026), to read: *no LEGACY or
// DONOR-DERIVED object may be generated or exposed; a registered `generated` voice is
// permitted.* The rights question that gate exists to answer does not arise for a voice its
// owner synthesized from a written prompt.
//
// THAT RULING DOES NOT LIVE HERE, AND THIS FILE DOES NOT PERFORM IT. It records what a
// voice IS; the gate decides what may speak. A prior commit declared G0-R "SUPERSEDED"
// from inside a source comment, citing a Founder request that had not been made, and had to
// be retracted — the lesson is that gate state lives in the gate, never in a source file.
// If the ruling is ever narrowed again, this code needs no edit: it already refuses
// everything except the one registered voice.
// ============================================================================

/** The provenance classes this product will accept for a customer-reachable voice.
 *  `generated` = synthesized from a written prompt, no human donor recording involved. */
export type VoiceProvenance = "generated";

export interface RegisteredVoice {
  voiceId: string;
  /** The provider's own display name, for operator-facing messages. */
  name: string;
  provenance: VoiceProvenance;
  /** The model the voice was accepted under. KIV-313: keep `eleven_v3` for the first
   *  integration unless a separately reviewed model change is authorized. */
  model: string;
  /** Saved settings at handoff, restored and verified by the Founder at stability 0.50.
   *  KIV-313 is explicit that the later 0.40 and 0.30 captures are NOT the production pin —
   *  no winner was selected between them, so pinning either would be inventing a decision. */
  settings: {
    stability: number;
    similarity_boost: number;
    style: number;
    speed: number;
    use_speaker_boost: boolean;
  };
  /** The one proven pronunciation correction. KIV-313: do NOT import the old broad 18-rule
   *  qaf dictionary — it was never qualified for this voice and introduced many errors.
   *  There is no blanket `ق -> g` rule, and «عربية» must stay natural and unforced. */
  pronunciationDictionary: { id: string; versionId: string; rule: string };
}

/** The single voice authorized to speak as Khalid. */
export const KHALID_VOICE: RegisteredVoice = {
  voiceId: "pYDa2s34YCzHjbn4DnXP",
  name: "Khalid kivo",
  provenance: "generated",
  model: "eleven_v3",
  settings: {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0,
    speed: 1.0,
    // Not a meaningful Eleven v3 control, per the handoff; carried because it is part of
    // the saved object the Founder listened to, and drifting from it silently is how a
    // "verified" configuration stops being the one that was verified.
    use_speaker_boost: true,
  },
  pronunciationDictionary: {
    id: "rv3aw4bY6zoL4iWxJlDk",
    versionId: "AuNrVOZsoDPTqDl8wlFw",
    rule: "قهوة -> ɡahwa",
  },
};

/** Every voice this product may use, by id. Exactly one today, and adding a second is a
 *  governed act, not a code edit: a new entry needs its own provenance record. */
const REGISTRY: ReadonlyMap<string, RegisteredVoice> = new Map([[KHALID_VOICE.voiceId, KHALID_VOICE]]);

/** Historical provider objects that must never speak again. Diagnostic only — the allow
 *  list above is what actually refuses them, and it refuses the ones missing here too.
 *  KIV-95 carries the full disposition; `VuqFqWXHibJ61b9IiVJ7` is the one identified so far. */
export const QUARANTINED_VOICE_IDS: Readonly<Record<string, string>> = {
  VuqFqWXHibJ61b9IiVJ7: "legacy provider object under G0-R quarantine (KIV-90/95)",
};

/** Ids are compared with invisibles stripped and case folded. A voice id pasted from a
 *  dashboard routinely carries a zero-width character or arrives lowercased, and an
 *  exact-string comparison turns either into "unknown voice" — a confusing refusal for
 *  the RIGHT id, which is how an operator ends up "fixing" it by loosening the check. */
const INVISIBLE_RE = /[­؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;

export function normalizeVoiceId(id: string | null | undefined): string {
  return String(id ?? "").replace(INVISIBLE_RE, "").trim();
}

/** The registered voice for an id, or null. Null means "not authorized to speak" — there
 *  is no third state and no override. */
export function lookupVoice(id: string | null | undefined): RegisteredVoice | null {
  const norm = normalizeVoiceId(id).toLowerCase();
  for (const [key, voice] of REGISTRY) {
    if (key.toLowerCase() === norm) return voice;
  }
  return null;
}

/** Collapse control characters and cap the length, for a value that reaches a log. */
function clip(v: string): string {
  const flat = v.replace(/[\r\n\t\u2028\u2029]+/g, " ");
  return flat.length > 48 ? `${flat.slice(0, 48)}…` : flat;
}

export function isAuthorizedVoice(id: string | null | undefined): boolean {
  return lookupVoice(id) !== null;
}

/** Why an id was refused, in words an operator can act on. Never includes a secret — a
 *  voice id is not a credential (KIV-313 publishes this one in plain text); the API key is,
 *  and it is not read here at all. */
export function voiceRefusalReason(id: string | null | undefined): string | null {
  // BOUNDED AND SINGLE-LINE. This message is built from an ENV-CONTROLLED value and ends up
  // in console.warn and in a critical alert, so an id carrying a newline is a log-injection
  // primitive and a 300-character id is a 390-character log line. Neither is a crisis; both
  // are free to prevent.
  const norm = clip(normalizeVoiceId(id));
  if (!norm) return "no voice id configured";
  if (isAuthorizedVoice(norm)) return null;
  const quarantined = Object.entries(QUARANTINED_VOICE_IDS).find(
    ([qid]) => qid.toLowerCase() === norm.toLowerCase()
  );
  if (quarantined) return `voice ${norm} is quarantined: ${quarantined[1]}`;
  return `voice ${norm} is not in the voice release registry (expected ${KHALID_VOICE.voiceId}, «${KHALID_VOICE.name}»)`;
}
