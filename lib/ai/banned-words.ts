// ============================================================================
// MaitreAI — WO-V1.0-GOAL-LOGIC (Slice 1): the waiter-language banned-word SCRUBBER.
//
// PURE (no I/O). The prompt (prompt.ts:326) forbids machine-jargon words to the customer —
// «السيستم/النظام»، «أبني الطلب/بناء الطلب»، «الداتا»، «قاعدة البيانات»، «الباك إند»،
// «الذكاء الاصطناعي/AI/بوت» — but the ban was PROMPT-ONLY, and our OWN post-hoc fallbacks
// (safeMoneyReply/safeConfirmReply, dialect few-shots) EMIT «من السيستم» + «أبني الطلب»,
// seeding an anchoring loop the anti-anchoring rule (prompt.ts:322) can't stop. This is the
// deterministic end-of-turn net (the Final Validator's banned-word lock): it rewrites the
// jargon to waiter language on EVERY outbound regardless of source (model, a guard, a legacy
// string), so a banned word can NEVER reach the customer.
//
// Rewrite, don't blank: preserve the sentence's meaning in host voice («من السيستم» → dropped,
// «أبني الطلب» → «أرتّب الطلب»). Conservative + high-confidence only (never touches «البيانات»
// as a bare word — too ambiguous — only clear jargon collocations).
// ============================================================================

interface Rewrite {
  re: RegExp;
  to: string;
  label: string;
}

// Order matters: multi-word collocations first, then standalone jargon. All global+unicode.
const REWRITES: Rewrite[] = [
  // «من السيستم» / «من النظام» — the exact leak in safeMoneyReply/safeConfirmReply. Drop it;
  // «أحسبهولك بدقة من السيستم» → «أحسبهولك بدقة».
  { re: /\s*من\s+(?:ال)?سيستم/gu, to: "", label: "من السيستم" },
  { re: /\s*من\s+النظام/gu, to: "", label: "من النظام" },
  // «أبني الطلب» / «أبنيه» / «بناء الطلب» → waiter «أرتّب».
  { re: /أبني\s+الطلب/gu, to: "أرتّب الطلب", label: "أبني الطلب" },
  { re: /بناء\s+الطلب/gu, to: "ترتيب الطلب", label: "بناء الطلب" },
  { re: /أبنيه(?![ء-ي])/gu, to: "أرتّبه", label: "أبنيه" },
  { re: /نبني\s+الطلب/gu, to: "نرتّب الطلب", label: "نبني الطلب" },
  // «قاعدة البيانات» / «الباك إند» / «الداتا» — pure jargon, drop.
  { re: /\s*(?:من\s+)?قاعدة\s+البيانات/gu, to: "", label: "قاعدة البيانات" },
  { re: /\s*(?:ال)?باك\s?إند/gu, to: "", label: "الباك إند" },
  { re: /\s*(?:ال)?داتا(?![ء-ي])/gu, to: "", label: "الداتا" },
  // «الذكاء الاصطناعي» / «AI» / «بوت» (about self) → drop.
  { re: /\s*الذكاء\s+الاصطناع[يى]/gu, to: "", label: "الذكاء الاصطناعي" },
  { re: /(?<![A-Za-z])AI(?![A-Za-z])/g, to: "", label: "AI" },
  { re: /(?<![ء-ي])بوت(?![ء-ي])/gu, to: "", label: "بوت" },
  // Standalone «السيستم» / «النظام» (as "the system") — waiter has no system; drop the token.
  { re: /(?<![ء-ي])(?:ال)?سيستم(?![ء-ي])/gu, to: "", label: "السيستم" },
  { re: /(?<![ء-ي])النظام(?![ء-ي])/gu, to: "", label: "النظام" },
];

export interface ScrubResult {
  text: string;
  /** Which banned tokens were rewritten (labels), for the Final-Validator signal. */
  scrubbed: string[];
}

/** Tidy stray whitespace/punctuation a drop can leave («بدقة . » → «بدقة.»). */
function tidy(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([،.!؟?])/g, "$1")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n");
}

/**
 * Rewrite every waiter-jargon banned word to host language. Returns the cleaned text plus the
 * labels rewritten. Deterministic; safe to run on every outbound (a reply with no banned word
 * is returned byte-identical, scrubbed = []).
 */
export function scrubBannedWords(text: string): ScrubResult {
  if (!text) return { text, scrubbed: [] };
  let out = text;
  const scrubbed: string[] = [];
  for (const r of REWRITES) {
    if (r.re.test(out)) {
      scrubbed.push(r.label);
      out = out.replace(r.re, r.to);
    }
    r.re.lastIndex = 0;
  }
  if (!scrubbed.length) return { text, scrubbed: [] };
  return { text: tidy(out), scrubbed };
}

/** True iff `text` still contains any banned waiter-jargon word (post-scrub double-lock). */
export function hasBannedWord(text: string): boolean {
  return REWRITES.some((r) => {
    const hit = r.re.test(text);
    r.re.lastIndex = 0;
    return hit;
  });
}
