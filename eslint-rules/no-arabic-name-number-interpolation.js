// ============================================================================
// MaitreAI — Item 12: ESLint rule — no template-literal interpolation into
// Arabic strings. Interpolating a runtime name / number / phone into an Arabic
// (RTL) template string is a bidi footgun: `«${name} 6m · ${phone}»` reorders
// the Latin/number/phone fragments under RTL and reads wrong. The fix is to
// COMPOSE the string in JSX with the <Bdi>/<Num>/<Phone> isolating primitives
// (components/kivo) instead of building it by interpolation.
//
// Heuristic (intentionally conservative): flag a TemplateLiteral that BOTH has at
// least one `${...}` expression AND contains Arabic characters in a static quasi.
// A pure-Latin template or an Arabic string with no interpolation is fine.
// ============================================================================

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow interpolating values into an Arabic template-literal string; compose with Bdi/Num/Phone instead.",
      recommended: false,
    },
    schema: [],
    messages: {
      noInterp:
        "Do not interpolate ${...} into an Arabic string — a name/number/phone reorders under RTL. Compose it in JSX with <Bdi>/<Num>/<Phone> (components/kivo) instead.",
    },
  },
  create(context) {
    const ARABIC = /[؀-ۿݐ-ݿ]/;
    return {
      TemplateLiteral(node) {
        if (!node.expressions || node.expressions.length === 0) return;
        const hasArabicStatic = node.quasis.some((q) => ARABIC.test(q.value.raw));
        if (hasArabicStatic) context.report({ node, messageId: "noInterp" });
      },
    };
  },
};
