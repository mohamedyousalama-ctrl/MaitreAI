// ============================================================================
// MaitreAI — Allergy-Companion FLOW decisions + authored replies (spec §1, §5,
// §6, §1e) — PURE, no I/O. Consulted ONLY when allergy_companion_mode is ON
// (flag-OFF → never imported into the live path; behavior byte-identical).
//
// The deterministic SPINE of companion mode. Given a customer message (and the
// running session allergy-note union) it decides the ONE path:
//
//   • EMERGENCY (§5) — an ACTIVE present-tense reaction. ALWAYS escalates to a
//     SYSTEM_HOLD, marked emergency-class (NEVER customer-resumable, §1e·d), and
//     answers with the fixed §5 line (staff alerted, never reassurance).
//   • MENTION (§1a) — a plain allergy statement. In companion mode this NO LONGER
//     forces a handoff: Kivo acknowledges, keeps talking (escalate:false), stamps
//     the monotonic kitchen note, offers the human ONCE (§1a.4), and audits it.
//
// It also owns every DETERMINISTIC authored text companion mode ever sends —
// emergency (§5), handoff-recovery (§1e), and the confirmation checkpoint recap
// (§6). Every one of these is scanned clean of the §0 banned vocabulary by the
// module's own unit test (the authored texts can NEVER assert food safety).
// ============================================================================

import { detectAllergenEmergency } from "./allergen-emergency";
import { detectAllergenAvoidance } from "./allergen-gate";
import { mergeAllergyNote, scanBannedAllergyPhrases, type DishTruthState } from "./allergen-companion";

// A stable, human-readable marker embedded in the escalation_reason of an
// EMERGENCY-class SYSTEM_HOLD. §1e·d: emergency holds are NEVER customer-resumable,
// so the recovery path (respond-and-send) must recognize them WITHOUT a new DB
// column (0080 stays prepare-only). isEmergencyClassHold() below is the reader.
export const EMERGENCY_HOLD_MARKER = "«طوارئ-حساسية»";

export type CompanionPath = "emergency" | "mention";

export interface CompanionDecision {
  /** Which companion path this customer message takes. */
  path: CompanionPath;
  /** The specific allergen label acknowledged this turn (or null → generic). */
  term: string | null;
  /** The monotonic session note AFTER merging this turn's allergen (§1a.2). NEVER
   *  drops an allergen named earlier in the session. */
  note: string;
  /** Does this turn escalate to a human hold? (mention → false; emergency → true) */
  escalate: boolean;
  /** SYSTEM_HOLD (safety hold, never auto-returns) vs Kivo stays active. */
  systemHold: boolean;
  /** Emergency-class hold — a HARD branch that is NEVER customer-resumable (§1e·d). */
  emergencyClass: boolean;
  /** Offer the human ONCE, softly (§1a.4) — mention path only. */
  offerHuman: boolean;
  /** Structured audit event kind for this turn. */
  auditKind: "mention" | "emergency";
  /** Emergency short label for the audit row (present only on the emergency path). */
  emergencyLabel: string | null;
}

/**
 * Decide the companion path for one customer message. Pure + deterministic.
 * Emergency (§5) is checked FIRST and WINS — an active reaction always escalates,
 * even if the same message also reads as a plain mention. Otherwise it's a §1a
 * mention: acknowledge, keep talking, stamp the note, offer human once.
 */
export function decideCompanionAction(
  userMessage: string,
  existingNote: string | null | undefined,
  opts: { term?: string | null; terms?: string[] } = {}
): CompanionDecision {
  const emergency = detectAllergenEmergency(userMessage);
  const avoidance = detectAllergenAvoidance(userMessage);
  // The allergen label for this turn: a caller-supplied hint (the gate that fired —
  // symptom/phonetic may name a term avoidance doesn't) wins, else the avoidance term.
  const term = opts.term ?? avoidance.term;
  const terms = opts.terms?.length ? opts.terms : (term ? [term] : []);
  // Merge the NAMED allergen into the monotonic union. If nothing was named AND the
  // session note is still empty, add the generic «حساسية» label so the kitchen always
  // gets a note. But an emergency phrase that names nothing NEVER dilutes an existing
  // specific note («⚠️ حساسية: مكسرات» stays as-is).
  let note = mergeAllergyNote(existingNote, terms);
  if (!note) note = mergeAllergyNote(existingNote, [null]);

  if (emergency.fired) {
    return {
      path: "emergency",
      term,
      note,
      escalate: true,
      systemHold: true,
      emergencyClass: true,
      offerHuman: false,
      auditKind: "emergency",
      emergencyLabel: emergency.label,
    };
  }

  return {
    path: "mention",
    term,
    note,
    escalate: false,
    systemHold: false,
    emergencyClass: false,
    offerHuman: true,
    auditKind: "mention",
    emergencyLabel: null,
  };
}

// ---------------------------------------------------------------------------
// §5 EMERGENCY reply — the fixed line. Staff alerted, NEVER reassurance
// («كل شيء بيكون تمام» is banned by spec §5). Never certifies safety.
// ---------------------------------------------------------------------------
export function emergencyReply(dialect: string): string {
  return dialect === "egyptian"
    ? "بلّغت الفريق فوراً 🚨 لو فيه صعوبة في التنفس أو تورم أو أعراض قوية، اتصل بالإسعاف/الطوارئ دلوقتي. أنا معاك."
    : "بلّغت الفريق فوراً 🚨 إذا فيه صعوبة في التنفس أو تورم أو أعراض قوية، تواصل مع الإسعاف/الطوارئ الآن. أنا معك.";
}

// §0 rewrite — the safe reply that REPLACES any companion output caught asserting
// food safety (a banned §0 phrase). Itself banned-phrase-clean; never certifies,
// hands to the kitchen/team. (The legacy respond.ts safeAllergenReply uses «آمن»
// negated, which the companion scanner would itself flag — so companion mode needs
// this clean variant.)
export function companionBannedRewriteReply(dialect: string): string {
  return dialect === "egyptian"
    ? "صحتك تهمّنا 🙏 ما أقدرش أجزم عن سلامة الأصناف من غير ما المطبخ يتأكد — أوصلك بفريق المطعم يساعدوك تختاروا براحة."
    : "صحتك تهمّنا 🙏 ما أقدر أجزم عن سلامة الأصناف بدون ما المطبخ يتأكد — أوصلك بفريق المطعم يساعدونك تختارون براحة.";
}

// ---------------------------------------------------------------------------
// WO-SAFETY-MODEL-V2 (§0) — the founder's out-loud abolition of the hold/freeze:
// a §0 banned-phrase trip NEVER holds and NEVER forces escalation. Instead the draft
// is REPAIRED deterministically (strip the offending assurance sentence, splice in the
// neutral honest line) and the reply SENDS — the conversation always flows. Escalation
// is reserved for a human request or a §6 checkpoint decline; «إيقاف للسلامة» stays a
// manual staff action; §5 emergency is unaffected (an active reaction is not a §0 trip).
// ---------------------------------------------------------------------------

// The RATIFIED neutral repair line (founder ruling — "Option A"), dialect-adapted; the
// Khalid/KSA variant mirrors the same swap. Itself §0 banned-clean — «مناسب لحساسيتك»
// deliberately avoids the «يناسب الحساسية» ban (ة→ه normalization → line-82 match), so
// it is a SAFE terminal for the double-lock below (asserted by this module's unit test).
export function companionNeutralRepairLine(dialect: string): string {
  return dialect === "egyptian"
    ? "صحتك تهمنا 🙏 ماقدرش أأكد من نفسي إن الصنف مناسب لحساسيتك — الملاحظة واصلة للمطبخ وبيتأكدوا منها. نكمل؟"
    : "صحتك تهمنا 🙏 ما أقدر أأكد من نفسي إن الصنف مناسب لحساسيتك — الملاحظة واصلة للمطبخ ويتأكدون منها. نكمل؟";
}

/**
 * DETERMINISTIC draft repair — replaces the hold/freeze. SENTENCE-LEVEL (ruling 1):
 * strip every sentence that trips the §0 scanner and splice the neutral line in place
 * of the FIRST one, so the rest of the reply (menu, prices, the follow-up question)
 * survives and the conversation keeps flowing.
 *
 * DOUBLE-LOCK (ruling 1, the second lock): after reassembly RE-SCAN the final reply in
 * code — if ANYTHING still trips, collapse to the neutral line ALONE. The neutral line
 * is itself banned-clean, so this terminal is guaranteed safe (never an infinite trip).
 *
 * Pure. Sentences split on TERMINAL punctuation only (؟ ? . ! newline) — the SAME
 * delimiter set the §0 scanner uses for its «عادي» per-sentence menu exemption, so a
 * comma-separated flavor list stays one sentence and keeps that exemption intact.
 */
export function repairBannedAllergyReply(text: string, dialect: string): string {
  const neutral = companionNeutralRepairLine(dialect);
  const raw = String(text ?? "");
  if (!raw.trim()) return neutral;
  // Keep the terminators (captured group) so surviving sentences read naturally.
  const parts = raw.split(/([؟?.!\n]+)/);
  const out: string[] = [];
  let neutralInserted = false;
  let anyStripped = false;
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? "";
    const delim = parts[i + 1] ?? "";
    if (!sentence.trim()) continue;
    if (scanBannedAllergyPhrases(sentence).length > 0) {
      anyStripped = true;
      // Replace the FIRST offending sentence in place with the neutral line; drop the rest.
      if (!neutralInserted) {
        out.push(neutral);
        neutralInserted = true;
      }
      continue;
    }
    out.push((sentence.trim() + delim).trim());
  }
  // Defensive: the caller only invokes on a real hit, but if nothing stripped, keep as-is.
  if (!anyStripped) return raw;
  const assembled = out.join(" ").replace(/[ \t]+/g, " ").trim();
  // DOUBLE-LOCK: the assembled reply must be banned-clean; else collapse to neutral alone.
  if (!assembled || scanBannedAllergyPhrases(assembled).length > 0) return neutral;
  return assembled;
}

// ---------------------------------------------------------------------------
// §1e HANDOFF-RECOVERY reply — no purgatory, EVER. When a pending-human thread
// gets a new customer message, Kivo ALWAYS replies (never silence). Asks whether
// the team reached them, and offers BOTH choices: re-alert the team, and continue
// with Kivo. Never certifies safety.
// ---------------------------------------------------------------------------
export function recoveryReply(dialect: string): string {
  return dialect === "egyptian"
    ? "آسف على تأخّر الفريق 🙏 وصلك حد من الفريق؟ لو لسه ما وصلكش، أقدر أنبّه الفريق تاني الحين، وأقدر أكمّل معاك أنا لو تحب — تحب أعمل إيه؟"
    : "آسف على تأخّر الفريق 🙏 وصلك أحد من الفريق؟ إذا لسا ما وصلك، أقدر أنبّه الفريق مرة ثانية الحين، وأقدر أكمّل معك أنا لو تحب — وش تفضّل؟";
}

// The two recovery choices, offered as tappable buttons alongside recoveryReply().
export const RECOVERY_CHOICE_REALERT = "allergy_recovery_realert";
export const RECOVERY_CHOICE_CONTINUE = "allergy_recovery_continue";
export function recoveryChoiceTitles(dialect: string): { realert: string; continue: string } {
  return dialect === "egyptian"
    ? { realert: "نبّه الفريق تاني", continue: "كمّل مع كيفو" }
    : { realert: "نبّه الفريق مرة ثانية", continue: "أكمل مع كيفو" };
}

// ---------------------------------------------------------------------------
// §6 CONFIRMATION CHECKPOINT recap — before final confirmation whenever ANY
// allergy exists in the session. Recap the allergens, state the honest per-dish
// data status (two-axis), confirm the kitchen note, offer the human if ANY
// uncertainty remains, and REQUIRE an explicit acknowledgement. Never certifies
// safety — with no W2 data every dish is "unknown", so the recap says so honestly.
// ---------------------------------------------------------------------------

/** Human-readable, honest data-status phrase for one dish truth-state. Never a
 *  guarantee — always a statement ABOUT DATA (§0). */
export function truthStatePhrase(state: DishTruthState, dialect: string): string {
  const eg = dialect === "egyptian";
  switch (state) {
    case "escalation_required":
      return eg ? "محتاج أتأكد مع المطبخ قبل ما نكمل — تحب أوصلك بموظف؟" : "محتاج أتأكد مع المطبخ قبل ما نكمل — تحب أوصلك بموظف؟";
    case "contains":
      return eg ? "بياناتها المعتمدة بتبيّن إنها تحتوي المادة — الأفضل نستبعدها" : "بياناتها المعتمدة تبيّن إنها تحتوي المادة — الأفضل نستبعدها";
    case "clear_verified":
      return eg ? "بيانات المكونات والتحضير المعتمدة ما يظهر فيها المادة" : "بيانات المكونات والتحضير المعتمدة ما يظهر فيها المادة";
    case "clear_prep_unknown":
      return eg ? "المكونات واضحة، لكن التحضير/التلامس مش مأكد عندي" : "المكونات واضحة، لكن التحضير/التلامس غير مؤكد عندي";
    case "severe_shared_risk":
      return eg ? "حساسية شديدة ومطبخ مشترك — لازم موظف يتأكد قبل ما نكمل" : "حساسية شديدة ومطبخ مشترك — لازم موظف يتأكد قبل ما نكمل";
    case "unknown":
    default:
      return eg ? "ما عندي بيانات مؤكدة عن مكوناتها وتحضيرها" : "ما عندي بيانات مؤكدة عن مكوناتها وتحضيرها";
  }
}

export interface CheckpointDish {
  name: string;
  state: DishTruthState;
}

/**
 * Build the §6 checkpoint recap. `allergens` are the kitchen-readable labels from
 * the session note; `dishes` are the chosen dishes with their honest two-axis
 * truth-state. Always ends by REQUIRING an explicit acknowledgement (§6.5).
 */
export function buildCheckpointRecap(
  allergens: string[],
  dishes: CheckpointDish[],
  dialect: string
): string {
  const eg = dialect === "egyptian";
  const list = allergens.filter(Boolean).join("، ") || (eg ? "الحساسية المسجّلة" : "الحساسية المسجّلة");
  const head = eg
    ? `قبل ما أأكد الطلب ⚠️ — مسجّل حساسية من ${list}.`
    : `قبل لا أأكد الطلب ⚠️ — مسجّل حساسية من ${list}.`;
  const perDish = dishes.length
    ? dishes.map((d) => `• ${d.name}: ${truthStatePhrase(d.state, dialect)}`).join("\n")
    : eg
      ? "• حسب البيانات المتوفرة حالياً ما أقدر أجزم عن مكونات وتحضير كل الأصناف المختارة."
      : "• حسب البيانات المتوفرة حالياً ما أقدر أجزم عن مكونات وتحضير كل الأصناف المختارة.";
  const tail = eg
    ? "الملاحظة واضحة للمطبخ على طلبك. تحب أوصلك بموظف يتأكد لك، ولا نكمل مع التنبيه؟ لو تحب نكمل، اكتب لي تأكيدك."
    : "الملاحظة واضحة للمطبخ على طلبك. تحب أوصلك بموظف يتأكد لك، ولا نكمل مع التنبيه؟ لو تبي نكمل، اكتب لي تأكيدك.";
  return `${head}\n${perDish}\n${tail}`;
}

// ---------------------------------------------------------------------------
// §1e·d — EMERGENCY-class hold reader. True iff an escalation reason carries the
// emergency marker → the hold is NEVER customer-resumable. Pure.
// ---------------------------------------------------------------------------
export function isEmergencyClassHold(escalationReason: string | null | undefined): boolean {
  return typeof escalationReason === "string" && escalationReason.includes(EMERGENCY_HOLD_MARKER);
}

/** Build the escalation reason for an emergency-class hold (carries the marker so
 *  the §1e recovery path recognizes it as non-resumable). */
export function emergencyEscalationReason(label: string | null): string {
  return `${EMERGENCY_HOLD_MARKER} طوارئ حساسية نشطة${label ? ` (${label})` : ""} — بُلّغ الفريق فوراً؛ لا يُستأنف من العميل`;
}

// ---------------------------------------------------------------------------
// §1e·a — the customer's answer to the recovery question. CONSERVATIVE by design:
// a resume happens ONLY on an EXPLICIT, unambiguous affirmative to "continue with
// Kivo", NEVER inferred. Anything ambiguous → NOT a resume (stays held, re-alert).
// ---------------------------------------------------------------------------

/** True iff the message is an explicit, unambiguous "continue with Kivo" choice
 *  (§1e·b path). A tap on the continue button is resolved upstream to a canonical
 *  phrase; typed text must clearly say "keep going with you / continue". */
export function isExplicitContinueChoice(message: string): boolean {
  const s = String(message ?? "").trim();
  if (!s) return false;
  // A negation anywhere disqualifies (never resume on "no, don't continue").
  if (/(?:لا|لأ|مش|ما)\s*(?:تكمل|أكمل|اكمل|نكمل|تستمر|كمّل)/u.test(s)) return false;
  return (
    /(?:كمّل|كمل|أكمل|اكمل|نكمل|كملي|استمر|تابع)\s*مع\s*(?:كيفو|كي?فو|كريم|خالد)/u.test(s) ||
    /(?:كمّل|كمل|أكمل|اكمل|نكمل|كملي)\s*(?:معي|معك|معاك|معاي)/u.test(s) ||
    /continue\s*with\s*(?:kivo|you)|keep\s*going\s*with\s*you/iu.test(s)
  );
}

/** True iff the message is an explicit "re-alert the team" choice (§1e·b path). */
export function isExplicitRealertChoice(message: string): boolean {
  const s = String(message ?? "").trim();
  if (!s) return false;
  return (
    /نبّه\s*الفريق|نبه\s*الفريق|بلّغ\s*الفريق|بلغ\s*الفريق|كلّم\s*الفريق|كلم\s*الفريق|موظف|أحد\s*من\s*الفريق|حد\s*من\s*الفريق/u.test(s) ||
    /re-?alert|call\s*the\s*team|notify\s*the\s*team/iu.test(s)
  );
}

// ---------------------------------------------------------------------------
// §1e — the RECOVERY decision (pure). No purgatory, ever: a pending-human thread
// that stalls (idle) or an explicit answer to the recovery question drives the ONE
// next action. Emergency-class holds are NEVER customer-resumable (§1e·d) — a
// hard branch that can only re-alert, never resume.
// ---------------------------------------------------------------------------
export type RecoveryAction =
  | "none"            // fresh, actively-handled human thread → leave alone (no change)
  | "send_question"   // stalled / ambiguous answer → ask «وصلك أحد من الفريق؟» (+ choices)
  | "resume_continue" // explicit affirmative on a NON-emergency hold → resume with Kivo
  | "realert"         // explicit "re-alert the team" → re-fire staff alert, stay held
  | "emergency_held"; // explicit affirmative on an EMERGENCY hold → NEVER resume, re-alert

export interface RecoveryInput {
  /** conversations.ownership_state (SYSTEM_HOLD / HUMAN_ACTIVE / …). */
  ownershipState: string | null;
  /** conversations.escalation_reason (carries the emergency marker when emergency-class). */
  escalationReason: string | null;
  /** Thread has genuinely stalled — the customer is waiting with no human tending. An
   *  actively-chatting human keeps updated_at fresh, so this is false for live handling. */
  isIdle: boolean;
  /** The last OUTBOUND turn was the recovery question (so this inbound is its answer). */
  recoveryPending: boolean;
  /** The customer's message text this turn. */
  messageText: string;
  /** A tap on a recovery choice button, resolved by the interactive router. */
  interactiveId?: string | null;
}

/**
 * Decide the §1e recovery action for a pending-human thread. Pure + deterministic.
 * §1e·a: a resume happens ONLY on an EXPLICIT affirmative, never inferred. §1e·d:
 * an emergency-class hold is a HARD non-resumable branch.
 */
export function decideRecoveryAction(inp: RecoveryInput): RecoveryAction {
  const emergency = isEmergencyClassHold(inp.escalationReason);
  const continueChoice =
    inp.interactiveId === RECOVERY_CHOICE_CONTINUE || isExplicitContinueChoice(inp.messageText);
  const realertChoice =
    inp.interactiveId === RECOVERY_CHOICE_REALERT || isExplicitRealertChoice(inp.messageText);

  // Answering a PENDING recovery question — honored even inside the idle window (we
  // just bumped updated_at by asking), so a fast answer is never missed.
  if (inp.recoveryPending) {
    if (continueChoice) return emergency ? "emergency_held" : "resume_continue";
    if (realertChoice) return "realert";
    // Ambiguous answer → re-ask. NEVER infer a resume (§1e·a).
    return "send_question";
  }

  // Not answered yet: intervene ONLY on genuine purgatory (idle). A fresh, actively-
  // handled human thread is left alone → "none" (existing behavior, no interruption).
  if (inp.isIdle) return "send_question";
  return "none";
}
