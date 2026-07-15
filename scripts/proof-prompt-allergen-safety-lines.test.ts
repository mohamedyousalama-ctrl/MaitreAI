// KVO-002 proof: menu prompt carries deterministic allergen caution lines.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-prompt-allergen-safety-lines.test.ts

import { readFileSync } from "node:fs";
import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";
import { ALLERGEN_ESCALATION_MARKER_AR } from "../lib/ai/allergen-prep-vocab.ts";
import type { MenuItem } from "../lib/types.ts";

const SAFETY_WARNING =
  "⚠️ تحذير سلامة: لا تؤكد أبداً خلو هذا الصنف من أي مادة مسببة للحساسية. لو سأل العميل عن حساسية، قل إنك تحتاج تتأكد مع المطبخ واعرض توصيله بموظف.";

let pass = 0;
let fail = 0;
function ok(name: string, condition: boolean): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }

  fail += 1;
  console.error(`FAIL ${name}`);
}

function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "item-1",
    name: "بيتزا عادية",
    category: "بيتزا",
    price: 42,
    available: true,
    description: "صوص طماطم وجبنة",
    imageUrl: "",
    modifierIds: [],
    ingredients: [],
    allergens: ["ألبان"],
    crossContactRisks: [],
    preparationNotes: null,
    ...overrides,
  } as MenuItem;
}

function promptFor(menuItems: MenuItem[]): string {
  return buildCustomerAgentSystemPrompt({
    profile: { name: "مطعم الاختبار", currency: "ر.س", timezone: "Asia/Riyadh", businessType: "restaurant" },
    dialect: "saudi",
    menuItems,
    modifiers: [],
    branches: [],
    deliveryAreas: [],
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [],
    aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live",
    isOpen: true,
    autoAccept: false,
    personaName: "خالد",
  } as any);
}

function itemBlock(prompt: string, name: string): string {
  const lines = prompt.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`- ${name} —`));
  if (start < 0) return "";
  const out: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (i > start && (line.startsWith("- ") || line.startsWith("### ") || line.trim() === "")) break;
    if (i > start && !line.startsWith("  ")) break;
    out.push(line);
  }
  return out.join("\n");
}

const nonFlagged = item();
const nonFlaggedBlock = itemBlock(promptFor([nonFlagged]), nonFlagged.name);
const expectedNonFlaggedBlock = [
  "- بيتزا عادية — 42 ر.س",
  "  صوص طماطم وجبنة",
  "  photo: not available",
  "  allergens: ألبان",
].join("\n");

ok("non-flagged item block is byte-identical to pre-change serialization", nonFlaggedBlock === expectedNonFlaggedBlock);
ok("non-flagged item block has no safety warning", !nonFlaggedBlock.includes(SAFETY_WARNING));
ok("non-flagged item block has no cross-contact line", !nonFlaggedBlock.includes("تلامس محتمل:"));

const flagged = item({
  name: "بيتزا باربكيو",
  preparationNotes: `⚠️ ${ALLERGEN_ESCALATION_MARKER_AR}: صوص الباربكيو يحتاج تأكيد بخصوص البيض`,
});
const flaggedBlock = itemBlock(promptFor([flagged]), flagged.name);
ok("flagged item block contains deterministic safety warning", flaggedBlock.includes(`  ${SAFETY_WARNING}`));
ok("flagged item warning tells model to verify with kitchen", flaggedBlock.includes("تتأكد مع المطبخ"));
ok("flagged item warning offers staff handoff", flaggedBlock.includes("توصيله بموظف"));

const crossContact = item({
  name: "دجاج مشوي",
  allergens: [],
  crossContactRisks: ["shared_oil", "بيض"],
});
const crossContactBlock = itemBlock(promptFor([crossContact]), crossContact.name);
ok("cross-contact item block contains factual cross-contact line", crossContactBlock.includes("  تلامس محتمل: زيت مشترك، بيض"));
ok("cross-contact line does not create a safety warning by itself", !crossContactBlock.includes(SAFETY_WARNING));

const promptSource = readFileSync("lib/ai/prompt.ts", "utf8");
const mapperSource = readFileSync("lib/ai/dish-allergen-data.ts", "utf8");
ok("prompt imports shared escalation predicate", /hasAllergenEscalationMarker/.test(promptSource));
ok("prompt does not hardcode the Arabic escalation marker", !promptSource.includes(ALLERGEN_ESCALATION_MARKER_AR));
ok("mapper uses shared escalation predicate", /hasAllergenEscalationMarker\(item\.preparationNotes\)/.test(mapperSource));
ok("mapper no longer hardcodes the Arabic escalation marker", !mapperSource.includes(ALLERGEN_ESCALATION_MARKER_AR));

console.log(`\nPROMPT-ALLERGEN-SAFETY-LINES PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
