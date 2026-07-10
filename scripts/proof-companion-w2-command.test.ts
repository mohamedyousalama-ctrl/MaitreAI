// ============================================================================
// WO-COMPANION-W2 — WhatsApp manager allergen command → GATED proposal. RED-FIRST:
// asserts the parse kind + the allowlist + (source) that the staff handler PROPOSES
// (never direct-writes) and that the ONLY menu write is the approve→apply path. On
// the pre-W2 tree the parse kind + allowlist entries don't exist → RED.
//
// Run: node --experimental-strip-types scripts/proof-companion-w2-command.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseStaffCommand } from "../lib/staff/command-channel.ts";
import { buildPatch } from "../lib/knowledge/change-request.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// ── PARSE — «(كريم،) سجّل إن {dish} فيه {allergen}» ──────────────────────────
{
  const p = parseStaffCommand("سجّل إن الجريش فيه جلوتين");
  ok("parse: bare command → note_allergen", p.kind === "note_allergen");
  ok("parse: captures the dish", p.kind === "note_allergen" && p.item === "الجريش");
  ok("parse: captures the allergen", p.kind === "note_allergen" && p.allergen === "جلوتين");
  const pv = parseStaffCommand("كريم، سجّل إن الجريش فيه جلوتين");
  ok("parse: tolerates the «كريم،» vocative", pv.kind === "note_allergen" && pv.item === "الجريش");
  // Not a false-positive on unrelated text.
  ok("parse: unrelated text is NOT note_allergen", parseStaffCommand("وقف كريم").kind === "pause");
  ok("parse: plain chatter → help", parseStaffCommand("مرحبا").kind === "help");
}

// ── ALLOWLIST — allergens/ingredients are gated fields, validated ───────────
{
  const good = buildPatch("menu_item", "allergens", ["gluten", "egg"]);
  ok("allowlist: allergens[] accepted", good.ok && Array.isArray((good as { patch: { allergens: string[] } }).patch.allergens));
  ok("allowlist: allergens dedups", (() => { const r = buildPatch("menu_item", "allergens", ["egg", "egg"]); return r.ok && (r as { patch: { allergens: string[] } }).patch.allergens.length === 1; })());
  ok("allowlist: ingredients[] accepted", buildPatch("menu_item", "ingredients", ["دجاج", "رز"]).ok);
  ok("allowlist: non-array rejected", !buildPatch("menu_item", "allergens", "gluten").ok);
  ok("allowlist: over-long list rejected", !buildPatch("menu_item", "allergens", Array.from({ length: 41 }, (_, i) => `a${i}`)).ok);
  ok("allowlist: unknown menu field still rejected", !buildPatch("menu_item", "prep_status", "controlled").ok);
}

// ── NEVER DIRECT-WRITE — the staff handler files a proposal, nothing else ────
{
  const cc = read("lib/staff/command-channel.ts");
  ok("handler: note_allergen inserts a knowledge_change_requests proposal",
    /fileAllergenChangeRequest[\s\S]*knowledge_change_requests"\)\.insert\(\{[\s\S]*status: "proposed"/.test(cc));
  ok("handler: the proposal targets menu_item allergens",
    /target_type: "menu_item"[\s\S]*field: "allergens"/.test(cc));
  ok("handler: note_allergen NEVER calls applyAvailability / a direct menu_items update",
    /case "note_allergen": \{[\s\S]*?\n      \}/.test(cc) &&
    !/case "note_allergen": \{[\s\S]*?applyAvailability[\s\S]*?\n      \}/.test(cc) &&
    !/case "note_allergen": \{[\s\S]*?from\("menu_items"\)\.update[\s\S]*?\n      \}/.test(cc));
  // FLAG-GATING — OFF → falls to help (flag-off byte-identical staff lane).
  ok("handler: note_allergen is gated on allergy_companion_mode",
    /case "note_allergen": \{[\s\S]*isFeatureExplicitlyEnabled\("allergy_companion_mode"[\s\S]*if \(!companionOn\)[\s\S]*REPLY\.help/.test(cc));
}

// ── APPLY — the ONLY write path; clears the stamp + array-verifies ──────────
{
  const apply = read("app/api/knowledge/change-requests/[id]/route.ts");
  ok("apply: allergen/ingredient apply routes through saveIngredientAxis (clears stamp)",
    /row\.field === "allergens" \|\| row\.field === "ingredients"[\s\S]*saveIngredientAxis\(/.test(apply));
  ok("apply: verifyApplied compares the array field order-insensitively",
    /field === "allergens" \|\| field === "ingredients"[\s\S]*\.sort\(\)/.test(apply));
  ok("apply: still gated on manager role + approved-state machine (unchanged)",
    /tenant\.role !== "manager"/.test(apply) && /nextStatus\(row\.status, action\)/.test(apply));
}

console.log(`\nWO-COMPANION-W2-COMMAND PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
