// ============================================================================
// MaitreAI — WO-V1.0-GOAL-LOGIC (Slice 1): the CLARIFICATION POLICY — grounded questions.
//
// PURE (no I/O). When the Goal Interpreter returns AMBIGUOUS, we ask ONE real, context-grounded
// clarifying question naming the actual candidates from state — NEVER a canned deflection
// («أقدر أحسبهولك من السيستم…») and never the evasive «اختار من القائمة». This is the
// doctrine's robustness test in its referent/intent form: ask only because the answer
// materially changes what we'd do. Persona-routed (Karim/Khalid) like the other authored
// replies; banned-word-clean by construction (the Final Validator scrubs anyway).
// ============================================================================

import type { ClarifyKind } from "./goal-interpreter";

const isSaudi = (d: string) => d === "saudi";

/**
 * Build the one grounded clarifying question for an ambiguous turn. `candidates` are the real
 * antecedents (offer/item names) when the ambiguity is a referent; empty otherwise.
 */
export function buildClarifyingQuestion(args: { kind: ClarifyKind; candidates: string[]; dialect: string }): string {
  const { kind, candidates, dialect } = args;
  const sa = isSaudi(dialect);

  switch (kind) {
    case "bare_number":
      // «1000» — no slot binds a bare number: ask what it means.
      return sa
        ? "تقصد الرقم هذا كـ عدد قطع، ولا مبلغ ميزانية، ولا شي ثاني؟ وضّح لي وأجهّز لك 🙏"
        : "تقصد الرقم ده عدد قطع، ولا مبلغ ميزانية، ولا حاجة تانية؟ وضّحلي وأظبطلك 🙏";

    case "referent": {
      if (candidates.length >= 2) {
        const list = candidates.slice(0, 4).join("، ");
        return sa
          ? `عندنا أكثر من خيار: ${list} — أيهم تقصد؟`
          : `عندنا أكتر من واحد: ${list} — أي واحد تقصد؟`;
      }
      // Referent with no concrete antecedent. This is reachable ONLY for a SIZE referent
      // («الكبير» with no item chosen yet) — goal-interpreter.ts returns null rather than
      // an empty list for every other referent, precisely so this size-specific sentence
      // can never be handed to someone who asked about something else. It used to answer
      // «العروض» with it.
      return sa
        ? "تقصد الكبير لأي صنف بالضبط؟ اختر لي الصنف وأضبط لك الحجم."
        : "تقصد الكبير لأنهي صنف بالظبط؟ قوللي الصنف وأظبطلك الحجم.";
    }

    case "bare_assent":
      // «ماشي/تمام» off a confirmation point — agree to what?
      return sa
        ? "تمام على أي شي بالضبط؟ تحب تطلب، ولا عندك سؤال أقدر أساعدك فيه؟"
        : "تمام على إيه بالظبط؟ تحب تطلب حاجة، ولا في استفسار أقدر أساعدك فيه؟";

    case "headcount":
      // A headcount/feast ask — Slice 2 planner isn't built: ask honestly, never fabricate a plan.
      return sa
        ? "أبشر — عشان أرشّح لك صح، تحب أكل من أي نوع (دجاج/بيتزا/مشويات)؟ وكم ميزانيتك تقريباً؟"
        : "تمام — عشان أرشّحلك صح، تحب أكل نوعه إيه (فراخ/بيتزا/مشويات)؟ وميزانيتك تقريباً كام؟";

    case "unclear":
    default:
      return sa
        ? "ودّي أساعدك صح — توضّح لي أكثر وش تحب بالضبط؟ تطلب، تسأل عن صنف، ولا عن الأسعار؟"
        : "نفسي أساعدك صح — توضّحلي أكتر تحب إيه بالظبط؟ تطلب، تسأل عن صنف، ولا عن الأسعار؟";
  }
}
