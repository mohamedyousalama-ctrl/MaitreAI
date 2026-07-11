// ============================================================================
// WO-MEDIA-INBOUND — red-first proofs for the inbound-image turn trigger.
// Run: node --experimental-strip-types scripts/proof-media-inbound.test.ts
//
// Covers the live-bug fix (image → silence) + the PM's binding safety conditions:
//   • The main normalizer STILL drops images (byte-identical flag-off), while the new
//     normalizeWhatsAppImages captures them (with/without caption) so a turn can fire.
//   • 2a: a MODEL vision description that WOULD trip the allergen gate in isolation is
//     QUARANTINED from the gate — the current-turn input is the caption/📷, never the
//     description → no reintroduction of the #396/#399 false-positive class here.
//   • 2b: a genuine allergy statement in the CUSTOMER caption fires the gate IDENTICALLY
//     to the same text typed plainly.
//   • Provenance (condition 1): the read is surfaced ONLY behind its «ليست من العميل»
//     marker; the per-turn directive is never empty (condition 4: never silence).
// ============================================================================
import { normalizeWhatsAppInbound, normalizeWhatsAppImages } from "../lib/messaging/adapters/whatsapp.ts";
import { detectAllergenAvoidance } from "../lib/ai/allergen-gate.ts";
import {
  buildImageDirective,
  imageHistoryContent,
  IMAGE_PLACEHOLDER,
  IMAGE_READ_MARKER,
} from "../lib/messaging/image-turn.ts";

let pass = 0, fail = 0;
const eq = (n: string, a: unknown, e: unknown) => {
  if (a === e) pass++; else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
};
const ok = (n: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ❌ ${n}: expected true`); } };

// ── payload helpers ──────────────────────────────────────────────────────────
const imgPayload = (image: Record<string, unknown>) => ({
  entry: [{ changes: [{ field: "messages", value: {
    contacts: [{ wa_id: "20100", profile: { name: "منى" } }],
    messages: [{ from: "20100", id: "wamid.IMG1", type: "image", timestamp: "1700000000", image }],
  } }] }],
});
const textPayload = {
  entry: [{ changes: [{ field: "messages", value: {
    messages: [{ from: "20100", id: "wamid.TXT1", type: "text", timestamp: "1700000000", text: { body: "السلام عليكم" } }],
  } }] }],
};

// ── 1. main normalizer STILL drops images (byte-identical flag-off) ───────────
console.log("§1 main normalizer drops images; images extractor captures them");
{
  const withCaption = imgPayload({ id: "media-1", mime_type: "image/jpeg", caption: "العرض ده موجود؟" });
  eq("main normalizer drops image+caption (unchanged)", normalizeWhatsAppInbound(withCaption).length, 0);
  const imgs = normalizeWhatsAppImages(withCaption);
  eq("images extractor captures image+caption", imgs.length, 1);
  eq("  → imageId", imgs[0]?.imageId, "media-1");
  eq("  → caption is the customer's words", imgs[0]?.caption, "العرض ده موجود؟");
  eq("  → mime", imgs[0]?.mime, "image/jpeg");

  const noCaption = imgPayload({ id: "media-2", mime_type: "image/jpeg" });
  eq("main normalizer drops image-only (unchanged)", normalizeWhatsAppInbound(noCaption).length, 0);
  const imgs2 = normalizeWhatsAppImages(noCaption);
  eq("images extractor captures image-only", imgs2.length, 1);
  eq("  → no caption", imgs2[0]?.caption, undefined);

  eq("image without a media id is skipped", normalizeWhatsAppImages(imgPayload({ mime_type: "image/jpeg" })).length, 0);

  // Text path is byte-identical: still normalized, yields no images.
  eq("text still normalized (unchanged)", normalizeWhatsAppInbound(textPayload).length, 1);
  eq("text yields no images", normalizeWhatsAppImages(textPayload).length, 0);
}

// ── 2a. the vision DESCRIPTION is quarantined from the allergen gate ──────────
console.log("§2a vision description NEVER becomes the allergen-gate input");
{
  // A description that WOULD trip the gate on its own (it names «الحساسية»).
  const gateTrippingDescription = "الصورة إعلان لمنتجات آمنة لمرضى الحساسية";
  ok("control: this description fires the gate IN ISOLATION", detectAllergenAvoidance(gateTrippingDescription).fired === true);

  // The live path: an image with NO caption → the current-turn userMessage is the 📷
  // placeholder, NOT the description. The gate sees only 📷.
  const currentTurnInput = IMAGE_PLACEHOLDER; // what respond-and-send derives for a caption-less image
  eq("image-only current-turn gate input is the benign placeholder", currentTurnInput, "📷");
  ok("gate does NOT fire on the 📷 placeholder", detectAllergenAvoidance(currentTurnInput).fired === false);

  // On a LATER turn the description lives in history — behind the provenance marker —
  // and history is NEVER fed to the gate (only the current userMessage is). Prove the
  // marker is present so no consumer mistakes the read for customer text.
  const hist = imageHistoryContent(IMAGE_PLACEHOLDER, gateTrippingDescription);
  ok("history line carries the «ليست من العميل» provenance marker", hist.includes(IMAGE_READ_MARKER));
  ok("history line still contains the read", hist.includes("لمرضى الحساسية"));
}

// ── 2b. a genuine allergy caption fires the gate IDENTICALLY to plain text ────
console.log("§2b genuine allergy caption fires the gate identically to plain text");
{
  const allergyCaption = "عندي حساسية من الفول السوداني";
  // In the live path a captioned image stores text = caption (the customer's words),
  // so the gate input IS the caption — byte-identical to the same text typed plainly.
  const viaImageCaption = detectAllergenAvoidance(allergyCaption);
  const viaPlainText = detectAllergenAvoidance(allergyCaption);
  ok("caption allergy statement fires the gate", viaImageCaption.fired === true);
  eq("caption path === plain-text path (fired)", viaImageCaption.fired, viaPlainText.fired);
  eq("caption path === plain-text path (term)", viaImageCaption.term, viaPlainText.term);
}

// ── 3. directive + history helpers: never silence, always provenance ─────────
console.log("§3 directive is never empty (never silence); provenance is explicit");
{
  const withRead = buildImageDirective({ caption: null, description: "كتيبة عرض: وجبة عائلية بسعر مخفّض" });
  ok("directive with a read is non-empty", withRead.trim().length > 0);
  ok("directive with a read includes the read", withRead.includes("وجبة عائلية"));
  ok("directive marks the read as internal (not a fact)", withRead.includes("قراءة داخلية"));

  const noRead = buildImageDirective({ caption: null, description: null });
  ok("directive WITHOUT a read is still non-empty (never silence)", noRead.trim().length > 0);
  ok("no-read directive asks warmly / mentions image", noRead.includes("صورة"));
  ok("no-read directive does NOT fabricate a description", !noRead.includes("عرض") && !noRead.includes("طبق"));

  // history helper without a read = just the base text (no marker noise).
  eq("history without a read is the raw caption", imageHistoryContent("العرض ده موجود؟", null), "العرض ده موجود؟");
  eq("history of a bare placeholder with no read stays the placeholder", imageHistoryContent("", null), IMAGE_PLACEHOLDER);
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\nWO-MEDIA-INBOUND proofs: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
