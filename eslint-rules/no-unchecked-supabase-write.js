// ============================================================================
// MaitreAI — local ESLint rule: flag bare awaited Supabase writes in server/money
// code. Supabase mutations resolve to { data, error }; they do not throw. A bare
// `await db.from(...).update/insert/delete/upsert(...)` can therefore report
// success even when the DB rejected the write.
//
// Heuristic, intentionally narrow for the first sweep:
//   - only lib/db/** and app/api/**
//   - only direct expression statements (`await ...;`)
//   - mutation chain must include `.from(...)` plus insert/update/delete/upsert
// Captured/destructured results and mustWrite/mustSucceed wrappers are not flagged.
// ============================================================================

"use strict";

const MUTATIONS = new Set(["insert", "update", "delete", "upsert"]);

function propName(prop) {
  if (!prop) return null;
  if (prop.type === "Identifier") return prop.name;
  if (prop.type === "Literal") return String(prop.value);
  return null;
}

function unwrap(node) {
  let current = node;
  while (current && (
    current.type === "ChainExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression"
  )) {
    current = current.expression;
  }
  return current;
}

function isScopedFile(filename) {
  const normalized = filename.replace(/\\/g, "/");
  return normalized.includes("/lib/db/") || normalized.includes("/app/api/");
}

function isSupabaseWriteChain(node) {
  let current = unwrap(node);
  let hasFrom = false;
  let hasMutation = false;

  while (current) {
    current = unwrap(current);

    if (current.type === "CallExpression") {
      const callee = unwrap(current.callee);
      if (!callee || callee.type !== "MemberExpression") break;

      const name = propName(callee.property);
      if (name === "from") hasFrom = true;
      if (MUTATIONS.has(name)) hasMutation = true;
      current = callee.object;
      continue;
    }

    if (current.type === "MemberExpression") {
      current = current.object;
      continue;
    }

    break;
  }

  return hasFrom && hasMutation;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Warn on bare awaited Supabase writes whose { error } result is not checked.",
      recommended: false,
    },
    schema: [],
    messages: {
      unchecked:
        "Supabase writes return { error } instead of throwing. Check the result or wrap this mutation in mustWrite/mustSucceed.",
    },
  },
  create(context) {
    if (!isScopedFile(context.getFilename())) return {};

    return {
      AwaitExpression(node) {
        if (!node.parent || node.parent.type !== "ExpressionStatement") return;
        if (isSupabaseWriteChain(node.argument)) {
          context.report({ node, messageId: "unchecked" });
        }
      },
    };
  },
};
