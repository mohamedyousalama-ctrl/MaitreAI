// ============================================================================
// console_v2 (PR 1) — activates the project's local ESLint rules. The plugin
// `eslint-plugin-local-rules` resolves rules from this file at the repo root and
// exposes them under the `local-rules/*` namespace (see .eslintrc.json). We simply
// re-export the rule map that Item 12 shipped in eslint-rules/index.js, so there is
// still ONE source for the rule implementation.
// ============================================================================

"use strict";

module.exports = require("./eslint-rules/index.js").rules;
