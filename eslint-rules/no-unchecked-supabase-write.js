// ============================================================================
// MaitreAI — local ESLint rule: flag bare awaited Supabase writes in server/money
// code. Supabase mutations resolve to { data, error }; they do not throw. A bare
// `await db.from(...).update/insert/delete/upsert(...)` can therefore report
// success even when the DB rejected the write.
//
// Heuristic, intentionally narrow for the first sweep:
//   - only lib/db/** and app/api/**
//   - direct expression statements (`await ...;`)
//   - destructured `{ error } = await ...` writes that discard returned rows
//   - mutation chain must include `.from(...)` plus insert/update/delete/upsert
// Capturing `{ data }` or `{ count }` is treated as row-count-aware; checked
// helper wrappers are not flagged.
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

function objectPatternKeys(pattern) {
  const keys = new Set();
  if (!pattern || pattern.type !== "ObjectPattern") return keys;

  for (const property of pattern.properties) {
    if (property.type !== "Property") continue;
    const name = propName(property.key);
    if (name) keys.add(name);
  }

  return keys;
}

function destructuresErrorWithoutRows(node) {
  const parent = node.parent;
  if (!parent || parent.type !== "VariableDeclarator") return false;
  if (!parent.id || parent.id.type !== "ObjectPattern") return false;

  const keys = objectPatternKeys(parent.id);
  return keys.has("error") && !keys.has("data") && !keys.has("count");
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
      uncheckedErrorOnly:
        "Supabase write result destructures { error } but not the affected rows — a zero-row write passes silently. Capture { data } and check the row count, or use mustWrite({ exactRows }).",
    },
  },
  create(context) {
    if (!isScopedFile(context.getFilename())) return {};

    return {
      AwaitExpression(node) {
        if (!isSupabaseWriteChain(node.argument)) return;

        if (node.parent && node.parent.type === "ExpressionStatement") {
          context.report({ node, messageId: "unchecked" });
          return;
        }

        if (destructuresErrorWithoutRows(node)) {
          context.report({ node, messageId: "uncheckedErrorOnly" });
        }
      },
    };
  },
};
