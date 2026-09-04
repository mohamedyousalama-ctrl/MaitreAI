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
  /** The dialect this voice was DESIGNED to speak. A voice may only read its own dialect:
   *  «Khalid kivo» is a Najdi Saudi male, and pointing it at an Egyptian tenant produces a
   *  Saudi accent reading Cairene text to that restaurant's customers. There is exactly one
   *  global ELEVENLABS_VOICE_ID and no per-tenant column, so a mismatched tenant has only
   *  two possible outcomes — the wrong voice, or silence. Silence is the correct one. */
  dialect: "saudi" | "egyptian";
  /** The provider's own display name, for operator-facing messages. */
  name: string;
  provenance: VoiceProvenance;
  /** The model the voice was accepted under. KIV-313 pinned `eleven_v3` "unless a
   *  separately reviewed model change is authorized" — that review happened (2 Sep 2026)
   *  and authorized `eleven_multilingual_v2`. See KHALID_VOICE.model for the evidence. */
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
  dialect: "saudi",
  provenance: "generated",
  // CHANGED FROM `eleven_v3` ON 2 SEP 2026, BY THE REVIEW KIV-313 REQUIRED.
  //
  // eleven_v3 could not speak a long reply at all. It is the expressive model, and its
  // time-to-first-byte scales hard with length: measured on this exact voice and these
  // exact settings, 2224ms at 38 characters and 12175ms at 190. The call screen bounds
  // silence at 7000ms (DemoPhone.tsx), so a 190-character reply — a menu, a recap, a
  // total — was abandoned before its first byte arrived. Not marginal: five seconds past
  // the cutoff. Khalid went MUTE on exactly the replies that sell the product, and short
  // answers kept working, which is why it read as "the voice lags" rather than as a fault.
  //
  // Measured the same way, eleven_multilingual_v2 answers the same 190-character line in
  // 1878ms — 6.5x faster, with five seconds of headroom — and 905ms on the greeting.
  // Same published rate ($0.10/1K), so nothing about spend changes. The faster realtime
  // models (turbo_v2_5 at 523ms, flash_v2_5 at 761ms) were measured too and were NOT
  // chosen: the Founder listened to all four on the same lines and picked this one. Speed
  // was never the deciding question — it only ruled v3 out.
  model: "eleven_multilingual_v2",
  settings: {
    stability: 0.5,
    similarity_boost: 0.75,
    // STYLE AND SPEAKER BOOST NOW DO SOMETHING, AND THE VALUES DELIBERATELY DID NOT MOVE.
    //
    // The note here used to say `use_speaker_boost` was "not a meaningful Eleven v3
    // control" — true then, false now: both it and `style` are real controls on
    // multilingual_v2, so the same numbers have gone from inert to load-bearing. They are
    // unchanged anyway, and that is the point rather than an oversight: the samples the
    // Founder approved were synthesized through THIS model at THESE values, so this pair
    // is what was actually accepted. Changing either now would mean shipping a sound
    // nobody has heard.
    style: 0,
    speed: 1.0,
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
 *
 *  READ-ONLY ACCOUNT INVENTORY, 4 Sep 2026 — and it corrected this list in both directions.
 *  KIV-95 recorded four unidentified objects and named `VuqFqWXHibJ61b9IiVJ7` as the one
 *  pinned down. A full read of the live account (29 voices) found the opposite of what this
 *  block assumed:
 *
 *    • `VuqFqWXHibJ61b9IiVJ7` IS NOT IN THE ACCOUNT. A direct read returns no voice. It is
 *      kept below anyway — an id that cannot resolve costs nothing to refuse, and removing
 *      it would delete the only written trace of a KIV-95 object if it ever reappears.
 *
 *    • `3vR1KVyyNDhdkucpugQI` («Saad») IS, and it is the object this gate exists for:
 *      category `professional`, `is_owner = false`, sharing status `copied`, and MULTIPLE
 *      UPLOADED AUDIO SAMPLES — a licensed clone of a real person, copied into this account
 *      from the shared library. KIV-313 forbids it by name and now the reason is visible
 *      rather than assumed. It was missing from this list entirely, so a wrong pin to Saad
 *      would have produced the generic "not in the registry" refusal instead of naming the
 *      rights problem.
 *
 *  BOTH KHALID OBJECTS CAME BACK CLEAN, which is the other half of the finding and the
 *  reason neither is listed here. «Khalid Demo» (`2LxxA31DwRtErSthUZxF`, created 12 hours
 *  before the registered voice) is `generated`, `is_owner = true`, sourced from
 *  `generated_audio.mp3`, with no donor recording — structurally identical in provenance to
 *  the pinned voice. The blanket suspicion in KIV-313 was precautionary, from a time when
 *  provenance was unknown; for that object it is now known and it is synthetic. The pin
 *  stays on «Khalid kivo» because ONE voice may speak as Khalid, not because the other one
 *  is tainted — its prompt is the specific Najdi restaurant-employee brief, where Khalid
 *  Demo's is a generic English "high-end hospitality" one. */
export const QUARANTINED_VOICE_IDS: Readonly<Record<string, string>> = {
  VuqFqWXHibJ61b9IiVJ7: "legacy provider object under G0-R quarantine (KIV-90/95) — not present in the account as of 4 Sep 2026",
  "3vR1KVyyNDhdkucpugQI":
    "«Saad» — professional voice CLONED FROM A REAL PERSON'S RECORDINGS, copied from the shared " +
    "library and NOT owned by this account (is_owner=false). Forbidden by name in KIV-313; the " +
    "G0-R rights question applies to it in full.",
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

/** May the registered voice read this tenant's replies?
 *
 *  THE CASE THIS EXISTS FOR IS LIVE. «وصاية» is an Egyptian tenant, `agent_mode: live`, with
 *  `voice_notes` enabled and 20 conversations. `ELEVENLABS_VOICE_ID` is a single GLOBAL
 *  setting, so the moment a key is provisioned that restaurant's real customers begin
 *  receiving Egyptian Arabic spoken in a synthetic SAUDI voice — and because there is no
 *  per-tenant voice column, no configuration exists that would make it correct.
 *
 *  Text is not a degraded outcome here. The reply is always composed and sent as text
 *  first; withholding the audio costs that tenant nothing it had yesterday, while speaking
 *  in the wrong country's accent is a quality failure their customers hear immediately. */
export function voiceMayReadDialect(voice: RegisteredVoice | null, tenantDialect: string | null | undefined): boolean {
  if (!voice) return false;
  return String(tenantDialect ?? "").trim().toLowerCase() === voice.dialect;
}

export function isAuthorizedVoice(id: string | null | undefined): boolean {
  return lookupVoice(id) !== null;
}

/** Why an id was refused, in words an operator can act on. Never includes a secret — a
 *  voice id is not a credential (KIV-313 publishes this one in plain text); the API key is,
 *  and it is not read here at all. */
/** Does the synthesis we got back actually come from the provider AND the voice we pinned?
 *  Takes the result rather than reading env, so a proof can hand it a lying adapter. */
export function voiceMatchesPin(
  result: { adapter?: string | null; voiceId?: string | null },
  pinnedVoiceId: string
): boolean {
  if (result.adapter !== "elevenlabs") return false;
  // AN EMPTY PIN MATCHES NOTHING. Without this, a caller passing "" — which is what
  // `lookupVoice(...)?.voiceId ?? ""` yields for an UNREGISTERED voice — was answered
  // `true` by a result whose own voiceId was null or absent, so "we could not identify the
  // voice" and "the voice is the registered one" became the same answer. Unreachable today
  // (both callers establish a registered voice before getting here), and left that way on
  // purpose: this is the comparison the whole guarantee rests on, and it must fail closed
  // on its own, not because of what some other function happens to check first.
  if (!pinnedVoiceId) return false;
  return (result.voiceId ?? "") === pinnedVoiceId;
}


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
