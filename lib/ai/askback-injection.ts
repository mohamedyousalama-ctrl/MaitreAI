// ============================================================================
// WO-ASKBACK — deterministic ask-back injection.
//
// Production bug (DB-proven): a zone-ambiguous delivery address made the
// set_delivery_address tool (address_flow_v2 path) push a `missing_data` signal
// with reason=address_zone_ambiguous carrying the exact customer question, and
// instruct the model to relay it — but an output guard downstream stripped the
// model's text down to a bare pleasantry («تمام!»). The pending question never
// reached the customer, who stalled.
//
// This module is the FINAL-SETTLE net: given the settled reply text and the
// turn's signals, it recovers the pending deterministic question and — only when
// the reply neither already contains it nor carries real content — APPENDS it (or,
// for a contentless pleasantry-only reply, REPLACES the text with greeting+question).
//
// Pure, deterministic string operations only. No model calls. It only ADDS the
// already-computed required question; it never weakens or removes a guard. Applies
// regardless of which guard stripped the text.
// ============================================================================

import type { ToolSignal } from "./tools";

// `missing_data` reasons whose signal carries a deterministic, customer-facing
// question (string field `question`) that MUST reach the customer this turn.
// Extend here as new deterministic ask-back questions are wired.
const DETERMINISTIC_QUESTION_REASONS = new Set<string>(["address_zone_ambiguous"]);

// Bare acknowledgements/pleasantries that carry no real content. A reply made up
// of only these (plus punctuation/emoji) is "contentless" — safe to replace.
const PLEASANTRIES = new Set<string>([
  "تمام",
  "تمم",
  "تماام",
  "تمامم",
  "ممتاز",
  "حاضر",
  "طيب",
  "حلو",
  "ماشي",
  "اوكي",
  "اوك",
  "اوكيه",
  "اكيد",
  "تشرفنا",
  "ok",
  "okay",
  "okey",
  "done",
  "sure",
]);

const CONTENTLESS_MAX_CHARS = 12;
const INJECT_GREETING = "تمام!";

/** Light Arabic-aware normalizer for containment / token comparison: strips
 *  diacritics + tatweel, folds alef/ya/ta-marbuta variants, collapses whitespace,
 *  lowercases. Deliberately preserves letters so containment stays meaningful. */
function normalize(input: string): string {
  // WO-STATE-TRUTH (PART B) — strip markdown emphasis (*bold* / _italic_) BEFORE folding so
  // the containment check catches the model's formatted relay of the pending question. The
  // DB-proven double-ask: the model bolded the question, the raw-string check missed the
  // asterisks, and the injector appended it a second time. Emphasis carries no content.
  return input
    .normalize("NFKD")
    .replace(/[*_]/g, "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The trimmed customer-facing content of a reply after dropping pleasantry tokens
 *  and any surrounding punctuation/emoji. Used to measure whether a reply is
 *  contentless. Each surviving token is reduced to its letters/digits. */
export function contentAfterPleasantries(text: string): string {
  return normalize(text)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((token) => token.length > 0 && !PLEASANTRIES.has(token))
    .join(" ")
    .trim();
}

/** A reply is contentless when, after trimming pleasantries and punctuation/emoji,
 *  fewer than CONTENTLESS_MAX_CHARS characters of real content remain (bare «تمام!»,
 *  «ممتاز 👍», «حاضر يا فندم» …). Empty/whitespace replies are contentless too. */
export function isContentless(text: string): boolean {
  return contentAfterPleasantries(text).length < CONTENTLESS_MAX_CHARS;
}

/** True when the reply already carries the pending question (verbatim relay, allowing
 *  whitespace/diacritic/alef-form variance). Prevents double-asking a question the
 *  model did surface. */
export function replyContainsQuestion(reply: string, question: string): boolean {
  const q = normalize(question);
  if (!q) return false;
  return normalize(reply).includes(q);
}

/** Recover the pending deterministic question from this turn's signals, if any.
 *  Latest matching signal wins (a later tool call supersedes an earlier one). */
export function pendingDeterministicQuestion(signals: ToolSignal[]): string | null {
  for (let i = signals.length - 1; i >= 0; i--) {
    const s = signals[i];
    if (s.type !== "missing_data") continue;
    const reason = typeof s.detail?.reason === "string" ? (s.detail.reason as string) : "";
    if (!DETERMINISTIC_QUESTION_REASONS.has(reason)) continue;
    const q = s.detail?.question;
    if (typeof q === "string" && q.trim()) return q.trim();
  }
  return null;
}

export type AskbackMode = "unchanged" | "appended" | "replaced";

export interface AskbackResult {
  text: string;
  mode: AskbackMode;
}

// WO-SIMPLIFY (PART C) — askback HEAD-match containment. The first ~12 chars of a question's
// CORE (its leading clause, before any «—»/«؟» separator) — e.g. «قريب من إيه». When the model
// already wrote a PARTIAL version of the same ask (it contains this head but not the full
// question), we REPLACE that partial sentence with the full deterministic question instead of
// APPENDING it — killing the duplicate «قريب من إيه» the DB showed.
const QUESTION_HEAD_LEN = 12;
const HEAD_MIN_LEN = 6;

/** The normalized head of the question's leading clause (up to the first «—/–/-/؟/?»). */
export function questionHead(question: string): string {
  const core = normalize(question).split(/[—–\-؟?]/)[0]?.trim() ?? "";
  return core.slice(0, QUESTION_HEAD_LEN).trim();
}

/** A tolerant regex for the (already folded) head, matched against ORIGINAL text — each folded
 *  alef/ya/ta-marbuta expands back to its variant class so «قريب من إيه» matches «قريب من ايه». */
function headMatcher(head: string): RegExp | null {
  const tokens = head.split(" ").filter(Boolean);
  if (!tokens.length) return null;
  const pattern = tokens
    .map((t) =>
      t
        .split("")
        .map((ch) => {
          if (ch === "ا") return "[اأإآ]";
          if (ch === "ي") return "[يىئ]";
          if (ch === "ه") return "[هة]";
          if (ch === "و") return "[وؤ]";
          return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("[ًٌٍَُِّْـ]*")
    )
    .join("\\s*");
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

/** If a line already carries the question's head (a partial ask), rewrite that line so the FULL
 *  question replaces everything from the head onward — preserving any real prefix on the line
 *  («تمام، قريب من إيه؟» → «تمام، <full question>»). Returns the repaired reply, or null when
 *  the head is absent (the caller then appends). Sentence-granularity, deterministic, no model. */
function repairPartialQuestionHead(reply: string, question: string): string | null {
  const head = questionHead(question);
  if (head.length < HEAD_MIN_LEN) return null;
  const matcher = headMatcher(head);
  if (!matcher) return null;
  const lines = String(reply ?? "").split("\n");
  let changed = false;
  const out = lines.map((line) => {
    if (changed) return line; // repair only the FIRST partial-ask line
    const m = matcher.exec(line);
    if (!m) return line;
    changed = true;
    const prefix = line.slice(0, m.index).replace(/[\s،؛-]*$/u, "").trim();
    return prefix ? `${prefix}، ${question}` : question;
  });
  return changed ? out.join("\n").trim() : null;
}

/** The core deterministic settle: ensure `question` reaches the customer.
 *  - already present            → unchanged
 *  - contentless (pleasantry)   → replace with greeting+question
 *  - partial ask (head present) → REPLACE that sentence with the full question (no duplicate)
 *  - has other content          → append question on its own line */
export function injectPendingQuestion(reply: string, question: string): AskbackResult {
  const q = question.trim();
  if (!q) return { text: reply, mode: "unchanged" };
  if (replyContainsQuestion(reply, q)) return { text: reply, mode: "unchanged" };
  if (isContentless(reply)) return { text: `${INJECT_GREETING} ${q}`.trim(), mode: "replaced" };
  const headRepaired = repairPartialQuestionHead(reply, q);
  if (headRepaired) return { text: headRepaired, mode: "replaced" };
  return { text: `${reply.trim()}\n${q}`, mode: "appended" };
}
