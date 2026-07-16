// ============================================================================
// MaitreAI — Item 12: local ESLint plugin exposing the project's custom rules.
// Wire in eslint config as a plugin (e.g. via eslint-plugin-local-rules, or a
// flat-config inline plugin) then enable:
//   "local-rules/no-arabic-name-number-interpolation": "warn"
// Shipped as "warn" guidance so it never breaks CI on pre-existing code; tighten
// to "error" once the surface is clean.
// ============================================================================

module.exports = {
  rules: {
    "no-arabic-name-number-interpolation": require("./no-arabic-name-number-interpolation.js"),
    "no-unchecked-supabase-write": require("./no-unchecked-supabase-write.js"),
  },
};
