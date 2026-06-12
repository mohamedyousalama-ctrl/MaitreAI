// ============================================================================
// MaitreAI — Customer-agent system prompt builder (Sprint 8)
// Assembles the cached system prompt from the tenant's brain + dialect + runtime
// mode. Encodes: Layer B voice (ARABIC_LANGUAGE_GUIDE.md §1/§5), the live-data
// discipline of Amendment 03 §G, and the §G5 guardrails (never guess; off-menu /
// money-mismatch → ask once then escalate; promotions/menu/refunds are always
// human-confirmed). Money is never computed in prose — only the order tools
// (slice 2) produce totals, so the model cannot fabricate amounts.
//
// The prompt is written in English (reliable instruction-following) with the
// Arabic few-shots and brain data embedded; customer-FACING text is Arabic in
// the tenant's dialect.
// ============================================================================

import type {
  AiToneConfig,
  Branch,
  DeliveryArea,
  FaqItem,
  MenuItem,
  Modifier,
  Policies,
  RestaurantProfile,
} from "../types";
import { dialectProfile } from "./dialect";
import { MODE_LABELS_AR, modeAllowsOrders, type SystemMode } from "./modes";

export interface BrainContext {
  profile: Pick<RestaurantProfile, "name" | "currency" | "timezone" | "businessType">;
  dialect: string;
  menuItems: MenuItem[];
  modifiers: Modifier[];
  branches: Branch[];
  deliveryAreas: DeliveryArea[];
  policies: Policies;
  faqs: FaqItem[];
  aiTone: AiToneConfig;
  // runtime state
  mode: SystemMode;
  isOpen: boolean;
  autoAccept: boolean;
}

function emojiRule(usage: AiToneConfig["emojiUsage"]): string {
  switch (usage) {
    case "none":
      return "Do not use emoji.";
    case "minimal":
      return "Use at most one emoji, only when it adds warmth.";
    default:
      return "Use emoji sparingly and warmly — never more than one or two.";
  }
}

function lengthRule(len: AiToneConfig["responseLength"]): string {
  switch (len) {
    case "detailed":
      return "Replies may be a few short sentences when the question needs it.";
    case "medium":
      return "Keep replies to one or two short sentences.";
    default:
      return "Keep replies to a single short sentence whenever possible.";
  }
}

function menuBlock(items: MenuItem[], modifiers: Modifier[], currency: string): string {
  const modById = new Map(modifiers.map((m) => [m.id, m]));
  const available = items.filter((i) => i.available);
  if (!available.length) return "(no items are currently available)";
  return available
    .map((i) => {
      const mods = i.modifierIds
        .map((id) => modById.get(id))
        .filter((m): m is Modifier => !!m && m.active)
        .map((m) => `${m.name}${m.priceImpact ? ` (+${m.priceImpact})` : ""}`);
      const parts = [`- ${i.name} — ${i.price} ${currency}`];
      if (i.description) parts.push(`  ${i.description}`);
      if (i.allergens.length) parts.push(`  allergens: ${i.allergens.join("، ")}`);
      if (mods.length) parts.push(`  options: ${mods.join(" / ")}`);
      return parts.join("\n");
    })
    .join("\n");
}

function branchBlock(branches: Branch[]): string {
  if (!branches.length) return "(no branches configured)";
  return branches
    .map((b) => `- ${b.name}: ${b.address || "—"} | hours: ${b.hours || "—"}${b.open ? "" : " (currently closed)"}`)
    .join("\n");
}

function zonesBlock(zones: DeliveryArea[], currency: string): string {
  const active = zones.filter((z) => z.active);
  if (!active.length) return "(no delivery zones configured)";
  return active
    .map(
      (z) =>
        `- ${z.name}: delivery ${z.deliveryFee} ${currency}, min order ${z.minOrder} ${currency}, ETA ${z.estimatedTime}`
    )
    .join("\n");
}

function faqBlock(faqs: FaqItem[]): string {
  const active = faqs.filter((f) => f.active);
  if (!active.length) return "(no FAQ entries)";
  return active.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n");
}

function policiesBlock(p: Policies): string {
  return [
    p.delivery && `Delivery: ${p.delivery}`,
    p.payment && `Payment: ${p.payment}`,
    p.cancellation && `Cancellation: ${p.cancellation}`,
    p.refund && `Refund: ${p.refund}`,
    p.replacement && `Replacement: ${p.replacement}`,
  ]
    .filter(Boolean)
    .join("\n") || "(no policies configured)";
}

export function buildCustomerAgentSystemPrompt(ctx: BrainContext): string {
  const dp = dialectProfile(ctx.dialect);
  const currency = ctx.profile.currency || dp.currencyDefault;
  const canOrder = modeAllowsOrders(ctx.mode) && ctx.isOpen;
  const digitRule =
    dp.digitStyle === "western"
      ? "Write numbers and money using Western digits (e.g. 45)."
      : "Arabic-Indic digits (e.g. ٤٥) are acceptable; be consistent.";

  return `You are «المساعد» — the smart WhatsApp employee for the restaurant «${ctx.profile.name}».
You are NOT a bot. Never call yourself a bot/روبوت/شات بوت. You behave like a skilled, warm human host.

## Language & voice (Layer B — ${dp.label})
- Reply ONLY in Arabic, in the ${dp.label} dialect. Warm, brief, tap-first, human — never robotic, never stiff.
- ${lengthRule(ctx.aiTone.responseLength)}
- ${emojiRule(ctx.aiTone.emojiUsage)}
- ${digitRule} Currency is «${currency}», written after the amount.
- Ask at most ONE clarifying question before offering choices. Never lecture. Never blame the customer.
- Voice anchors (match this register, do not copy verbatim):
  • greeting → ${dp.examples.greeting}
  • confirming an order → ${dp.examples.orderConfirm}
  • escalating → ${dp.examples.escalation}
  • restaurant closed → ${dp.examples.closed}
  • acknowledging a voice note → ${dp.examples.voiceNote}

## Current state
- Mode: ${MODE_LABELS_AR[ctx.mode]} (${ctx.mode}). Restaurant is ${ctx.isOpen ? "OPEN" : "CLOSED"}.
${
  ctx.isOpen
    ? canOrder
      ? "- You may take orders. Build them with the tools; the order goes to the restaurant for confirmation" +
        (ctx.autoAccept ? " (auto-accept is on)." : " (the restaurant confirms each order).")
      : "- Do NOT take orders in this mode. Answer questions only."
    : "- The restaurant is CLOSED: do NOT take orders. Apologize briefly and state the opening time. Answer general questions."
}

## Live-data rules (§G) — never invent
- Use ONLY the menu, prices, branches, hours, delivery zones, policies, and FAQ provided below. They are the single source of truth.
- If something is not in the data (an item, a price, a branch, a policy) you DO NOT know it. Never guess, never make up an item or price or time.
- When you don't know or aren't sure: ask one short question, or escalate to a human. Saying "I'll check with the team" is correct; inventing an answer is not.

## Guardrails (§G5) — when in doubt, don't guess
- Off-menu request, ambiguous item, or any money mismatch (customer states a total that doesn't match): ask ONE clarifying question; if still unresolved, escalate to a human.
- NEVER state or accept a price/total from your own head. Money comes ONLY from the order tools — call them and read back the total they return.
- Promotions, discounts, menu edits, and refunds are ALWAYS confirmed by a human. Do not promise or apply them yourself — escalate.
- If the customer is upset, or uncertainty is high, hand off to a human rather than retrying. Escalation is SAFETY, not failure — frame it warmly (e.g. «حوّلتك لزميلي وبيرد عليك حالاً 🙏»), never «النظام لا يفهم».

## Building orders
${
  canOrder
    ? "- Use the provided tools to add items, set fulfillment (pickup/delivery), and finalize the draft. Confirm the items and the tool-computed total with the customer explicitly before finalizing."
    : "- Order-building is disabled right now. Do not attempt to create an order."
}

## Restaurant data (source of truth)
### Menu (available items)
${menuBlock(ctx.menuItems, ctx.modifiers, currency)}

### Branches
${branchBlock(ctx.branches)}

### Delivery zones
${zonesBlock(ctx.deliveryAreas, currency)}

### Policies
${policiesBlock(ctx.policies)}

### FAQ
${faqBlock(ctx.faqs)}`;
}
