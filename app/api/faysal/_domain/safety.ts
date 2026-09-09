// ============================================================================
// فيصل / Faysal — THE RED-FLAG BRIDGE.  ⚠ TEMPORARY — DELETE WHEN lib/health/safety LANDS.
//
// SPEC-4-SAFETY.md owns this. It is 2,493 lines of driven lexicon across nine
// classes, and NOTHING here replaces it. This file exists for one reason: the
// demo surface must not be shippable with the safety rail unwired, and a route
// that imports a module that does not yet exist does not compile.
//
// So this is a REDUCED detector built to SPEC-4's own shape, not a different one:
//
//   · §1.1 — total function, and the caller treats any throw as `emergency`.
//   · §1.2 — boundary-aware matching, `(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?TERM(?![ء-ي])`.
//            No bare `includes`. «بيض» sits inside «الأبيض»; that bug shipped here once.
//   · §1.2 — exclusions are CLAUSE-scoped, never message-scoped. «زمان، مو قادر
//            أتنفس» is a past word and a present airway in two clauses.
//   · §1.2 — the hypothetical veto applies to every class, including HARD.
//   · §2.1 — class A (cardiac) is transcribed COMPLETE from SPEC-4's rule block,
//            because it is the class the demo script drives and a half-copied
//            emergency detector is worse than an obviously reduced one.
//   · Classes B–I carry a compact, correctly-SHAPED rule each. They are a floor.
//
// WHAT IS DELIBERATELY MISSING, and must arrive with `lib/health/safety`:
// the full §2.2–§2.9 vocabularies, the §3 false-positive corpus and its measured
// budget, the STT/voice net, `openTriageHold()`'s durable write and `pageHuman()`.
// The thread-level hold IS implemented, in the session (§1.5 R2) — a rail that
// speaks without holding is a rail the next turn walks past.
//
// THE RAIL COPY BELOW IS SPEC-4 §4.2, BYTE-EXACT. It is asserted byte-exact by
// SPEC-4 §11.3 and this document does not get to edit it. Note for whoever wires
// §4.3's output assertion: §4.2's own branch B contains «موعد» and branch C
// contains «حجز», both of which §4.3 lists as banned tokens. §4.2 + §11.3 win;
// §4.3's token list needs scoping to the composed reply, not the rail.
// ============================================================================

import type { RedFlagClass, RedFlagHit, RedFlagTier, RedFlagVerdict } from "./contract";

// ── normalization (SPEC-4 §1.1) ─────────────────────────────────────────────
// Arabic-Indic and Eastern-Arabic digits fold to ASCII BEFORE any temperature or
// age match, because «حرارته ٣٩» and «حرارته 39» are the same sentence.

const AR_INDIC = /[٠-٩۰-۹]/g;

export function normalizeArabic(raw: string): string {
  return String(raw)
    .replace(AR_INDIC, (d) => String(((d.codePointAt(0) ?? 0) - (d.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660))))
    .replace(/[ً-ٰٟـ]/g, "") // tashkeel + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** §1.2 — clause split. `بس` / `لكن` / `مع إن` are clause boundaries, not words. */
function clauses(normalized: string): string[] {
  return normalized
    .split(/[.،,؛!؟\n]|\sبس\s|\sلكن\s|\sمع ان\s/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** §1.2 — Arabic has no `\b` in JS regex. This is the only matcher in the file. */
function hasTerm(clause: string, term: string): boolean {
  const t = normalizeArabic(term);
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/^[a-z0-9 '\-]+$/.test(t)) {
    // Latin arm: ordinary word boundaries are correct and available here.
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(clause);
  }
  return new RegExp(`(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?${escaped}(?![ء-ي])`).test(clause);
}

function anyTerm(clause: string, terms: readonly string[]): string | null {
  for (const t of terms) if (hasTerm(clause, t)) return t;
  return null;
}

/** §1.5 R1 — the hypothetical veto applies to EVERY class, HARD included. */
const HYPOTHETICAL = /(?:^|\s)(?:لو|اذا صار|اذا جا|في حال|افتراض|يعني لو|بفرض)(?:\s|$)/;

// ── the classes ─────────────────────────────────────────────────────────────

interface ClassRule {
  cls: RedFlagClass;
  tier: RedFlagTier;
  /** Fires alone. */
  standalone: readonly string[];
  /** Fires only with a predicate present IN THE SAME CLAUSE. */
  terms: readonly string[];
  predicates: readonly string[];
  /** Clause-scoped vetoes. Class A carries none — §2.1's EXCLUSION set is empty. */
  vetoes?: readonly string[];
}

/**
 * §2.1 A — Cardiac (HARD). Transcribed complete from SPEC-4's rule block.
 * Bare `صدر` and bare `قلب` are NEVER terms — «صدر التقرير أمس؟» and
 * «صدر الدجاج مسموح؟» are whole words that a bare term WOULD fire on.
 */
const CARDIAC: ClassRule = {
  cls: "cardiac",
  tier: "emergency",
  standalone: [
    "جلطه قلب", "جلطه بالقلب", "جلطه في القلب", "ذبحه صدريه", "احتشاء",
    "ازمه قلبيه", "سكته قلبيه",
    "chest pain", "heart attack", "pressure in my chest", "sadri ye3awerni",
  ],
  terms: [
    "صدري", "صدره", "صدرها", "بصدري", "بصدره", "بصدرها", "فصدري",
    "الصدر", "بالصدر", "قلبي", "قلبه", "قلبها",
  ],
  predicates: [
    "يعورني", "يعوره", "يعورها", "يعور", "تعورني",
    "يوجعني", "يوجعه", "يوجعها", "يوجع", "توجعني", "يالمني",
    "وجع", "الم", "وجعان", "موجع",
    "ضغط", "ثقل", "شي قاعد", "ضاغط",
    "ضيق", "ضايق",
    "حرقه", "حرقان", "حارق", "نار",
    "عرق بارد", "تعرق بارد", "اتعرق", "دايخ", "غثيان",
    "ينزل لدراعي", "يضرب لذراعي", "يشد علي فكي", "بين كتافي",
  ],
};

const STROKE: ClassRule = {
  cls: "stroke",
  tier: "emergency",
  standalone: [
    "جلطه دماغيه", "جلطه بالمخ", "سكته دماغيه", "شلل نصفي",
    "stroke", "face drooping", "slurred speech",
  ],
  terms: ["وجهي", "وجهه", "وجهها", "فمي", "فمه", "لساني", "لسانه", "نص جسمي", "نص جسمه", "يدي", "يده", "رجلي", "كلامي", "كلامه"],
  predicates: ["معوج", "مايل", "ثقيل", "ما يتحرك", "ما اقدر احركه", "خدران", "مخدر", "متلخبط", "ما اقدر اتكلم", "ما يقدر يتكلم", "ثقل"],
};

const HEMORRHAGE: ClassRule = {
  cls: "hemorrhage",
  tier: "emergency",
  standalone: ["نزيف حاد", "نزيف شديد", "اتقطع شريان", "severe bleeding", "bleeding heavily", "hemorrhage"],
  terms: ["نزيف", "دم", "الدم", "ينزف"],
  predicates: ["ما يوقف", "ماوقف", "غزير", "شديد", "كثير", "واجد", "مستمر", "ما وقف"],
};

const AIRWAY: ClassRule = {
  cls: "airway",
  tier: "emergency",
  standalone: [
    "ما اقدر اتنفس", "مو قادر اتنفس", "ما يقدر يتنفس", "مو قادره تتنفس",
    "ضيق تنفس", "ضيق في التنفس", "نفسي مقطوع", "حلقي يقفل", "حلقه يقفل",
    "حساسيه شديده", "صدمه تحسسيه",
    "cant breathe", "can not breathe", "cannot breathe", "difficulty breathing", "anaphylaxis",
  ],
  terms: ["لساني", "لسانه", "حلقي", "حلقه", "شفايفه", "شفايفي", "وجهه", "وجهي"],
  predicates: ["منتفخ", "يتورم", "متورم", "زرقا", "ازرق", "زرقاء"],
};

const OBSTETRIC: ClassRule = {
  cls: "obstetric",
  tier: "emergency",
  standalone: ["ماي الجنين نزل", "كيس الماي انفجر"],
  terms: ["حامل", "حبلي", "الجنين"],
  predicates: ["نزيف", "دم", "ما احس فيه", "ما يتحرك", "تشنج", "تشنجات", "الم شديد", "وجع شديد", "طلق مبكر"],
};

const INFANT_FEVER: ClassRule = {
  cls: "infant_fever",
  tier: "emergency",
  standalone: ["تشنج", "تشنجات", "متشنج"],
  terms: ["رضيع", "الرضيع", "مولود", "المولود", "بيبي"],
  predicates: ["حراره", "سخونه", "سخن", "ما يرضع", "خامل", "ما يصحي", "لونه ازرق", "طفح"],
};

const POISONING: ClassRule = {
  cls: "poisoning",
  tier: "emergency",
  standalone: ["جرعه زايده", "جرعه زياده", "بلع بطاريه", "شرب كلور", "شرب منظف", "overdose", "swallowed battery", "poisoning"],
  terms: ["بلع", "بلعت", "شرب", "شربت", "اكل", "اكلت"],
  predicates: ["سم", "مبيد", "كلور", "منظف", "بطاريه", "حبوب كثير", "دواء كثير", "بنزين"],
};

const TRAUMA: ClassRule = {
  cls: "trauma",
  tier: "emergency",
  standalone: ["حادث سياره", "حادث مروري", "كسر مفتوح", "حرق كبير", "طاح من الدرج", "طاح من مكان عالي"],
  terms: ["راسه", "راسي", "ضربه بالراس", "ضربه براسه"],
  predicates: ["استفرغ", "يستفرغ", "اغماء", "غاب عن الوعي", "ما يصحي", "تقيا"],
};

/**
 * §2.9 I — self_harm. HARD, but EXACT-MATCH ONLY, no fuzzy, no STT net. It is the
 * one class whose over-fire cost is itself a safety cost: a grieving or joking
 * patient handed a crisis rail is harmed by the interaction and learns to stop
 * talking to us. So: an explicit first-person intent/act frame, plus a
 * bereavement/idiom veto.
 */
const SELF_HARM_EXACT: readonly string[] = [
  "ابي اموت", "ودي اموت", "ابغي اموت", "نفسي اموت",
  "بانتحر", "ابي انتحر", "ابغي انتحر", "راح انتحر", "فكرت انتحر",
  "ما ودي اعيش", "ما ابي اعيش", "تعبت من الحياه وابي اخلص",
  "راح اذي نفسي", "ابي اذي نفسي", "اذيت نفسي",
  "i want to die", "kill myself", "killing myself", "end my life", "suicide", "suicidal",
];
const SELF_HARM_VETO = /(?:الله يرحم|توفي|توفت|مات ابوي|مات امي|فقدت|جنازه|ميت من الجوع|ميت من الضحك|قاتلني|موتني|يموتون على)/;

const RULES: readonly ClassRule[] = [CARDIAC, STROKE, HEMORRHAGE, AIRWAY, OBSTETRIC, INFANT_FEVER, POISONING, TRAUMA];

// ── detectRedFlag ───────────────────────────────────────────────────────────

/**
 * SPEC-4 §1.1 — PURE. No I/O, no model, no DB, no clock. Written not to throw;
 * `readRedFlag()` wraps it anyway and treats any throw as `emergency`.
 */
export function detectRedFlag(text: string): RedFlagHit | null {
  const normalized = normalizeArabic(text);
  if (!normalized) return null;

  for (const clause of clauses(normalized)) {
    if (HYPOTHETICAL.test(` ${clause} `)) continue; // §1.5 R1 — applies to HARD too.

    // Class I first: exact-match only, and its veto is its own.
    if (!SELF_HARM_VETO.test(clause)) {
      const exact = SELF_HARM_EXACT.find((p) => clause.includes(normalizeArabic(p)));
      if (exact) {
        return { fired: true, class: "self_harm", cls: "self_harm", tier: "emergency", termAr: exact, ruleId: "I.self_harm.exact", label: "إيذاء النفس" };
      }
    }

    for (const rule of RULES) {
      if (rule.vetoes && anyTerm(clause, rule.vetoes)) continue;

      const standalone = anyTerm(clause, rule.standalone);
      if (standalone) {
        return { fired: true, class: rule.cls, cls: rule.cls, tier: rule.tier, termAr: standalone, ruleId: `${rule.cls}.standalone`, label: rule.cls };
      }

      const term = anyTerm(clause, rule.terms);
      if (!term) continue;
      const predicate = anyTerm(clause, rule.predicates);
      if (!predicate) continue;
      return { fired: true, class: rule.cls, cls: rule.cls, tier: rule.tier, termAr: `${term} + ${predicate}`, ruleId: `${rule.cls}.term_predicate`, label: rule.cls };
    }
  }
  return null;
}

/**
 * The composed reader every surface calls. §1.5 R3: on any throw, timeout or
 * non-conforming return it synthesises `emergency` — NEVER `urgent`, because
 * `urgent` leaves booking reachable and a detector that could not run is not a
 * detector that found nothing.
 */
export function readRedFlag(text: string): RedFlagVerdict {
  try {
    const hit = detectRedFlag(text);
    if (!hit || !hit.fired) return { fired: false, cls: null, tier: null, ruleId: "none", label: null };
    const cls = (hit.cls ?? hit.class ?? null) as RedFlagClass | null;
    const tier = hit.tier === "urgent" ? "urgent" : "emergency";
    return { fired: true, cls, tier, ruleId: hit.ruleId ?? "unknown", label: hit.label ?? null };
  } catch {
    return { fired: true, cls: null, tier: "emergency", ruleId: "detector_exception", label: "تعذّر الفحص" };
  }
}

// ── the rail (SPEC-4 §4.2 — VERBATIM, byte-exact) ───────────────────────────

/**
 * Branch A needs a site that `erSites({ now })` confirms open AT THIS INSTANT, on
 * this weekday, with `hours_verified_at` inside 30 days and a named verifier.
 * Nothing in this build can produce that: SPEC-1 records Complex 1's 24-hour
 * claim as `conflicted` and Shoaa's as `medium`/`low`, and no site carries a
 * `ClientConfirmation`. So this bridge renders **branch B, always** — which is
 * §4.4's explicit instruction: branch B "must be the default the code reaches
 * when anything is uncertain", and is "not a degraded fallback to be avoided."
 * Wiring branch A is `lib/health/safety`'s job, with the roster behind it.
 */
export const RAIL_A = (siteName: string, siteAddress: string): string =>
  `🚨 اتصل بالإسعاف 997 الحين.
اللي وصفته يحتاج كشف عاجل، وما ينتظر موعد.
أقرب طوارئ مفتوحة الحين: ${siteName} — ${siteAddress}
لا تسوق بنفسك. لو زاد الوضع أو صار إغماء، 997 قبل أي شي.
سلامتك أهم، وما أقدر أشخّص من الشات.`;

export const RAIL_B = `🚨 اتصل بالإسعاف 997 الحين.
اللي وصفته يحتاج كشف عاجل، وما ينتظر موعد.
ما أقدر أأكد لك فرع مفتوح هالحين، فلا تعتمد عليّ في هذا — 997 أسرع وأضمن.
سلامتك أهم، وما أقدر أشخّص من الشات.`;

/**
 * Branch C — class I. `{SUPPORT_LINE_SENTENCE}` is a BLANK SLOT that renders as
 * NOTHING until the group's medical director confirms the national mental-health
 * support number and its hours in writing (SPEC-4 §4.2, §12). The precedent is
 * `lib/ai/allergen-companion-flow.ts`, which shipped the Egyptian branch with no
 * ambulance number rather than the Saudi one: "a wrong number is worse than none,
 * because it is dialled and it fails."
 */
export const RAIL_C = `كلامك وصلني وآخذه على محمل الجد 🙏
إذا فيه خطر على حياتك الحين، اتصل 997 أو روح أقرب طوارئ.
ما راح أكمل أي حجز الحين. تبي أوصلك بأحد من فريقنا يكلمك؟`;

/** The rail's whole reply. No greeting, no name, no courtesy, no slot, no question. */
export function emergencyRail(verdict: RedFlagVerdict): string {
  return verdict.cls === "self_harm" ? RAIL_C : RAIL_B;
}

/** SPEC-4 §4.1 — the rail's stop reason, on every branch A, B and C. */
export const RAIL_STOP_REASON = "faysal_redflag_emergency";
