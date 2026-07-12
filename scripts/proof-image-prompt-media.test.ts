// WO-LIVE4-F1b — RED-FIRST: the "can't see the picture" instruction must be gated on
// media_turn_trigger. Same contradiction as F1's pin half: buildImageDirective
// (image-turn.ts) tells the model «شفت الصورة 👀» (it READ the image via the vision
// descriptor) while the base prompt unconditionally commanded NEVER-say-you-can-see-a-
// picture. With media_turn_trigger ON the system reads images, so the blindness claim
// must NOT render; with it OFF the honest can't-see text is unchanged. The pin half
// (geoRouting) is independent and untouched.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-image-prompt-media.test.ts
import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

function ctx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: { name: "وصاية", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
    dialect: "egyptian",
    menuItems: [], modifiers: [], branches: [], deliveryAreas: [],
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [],
    aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live", isOpen: true, autoAccept: false,
    ...overrides,
  };
}

const CANT_VIEW = "ask them to TYPE what they need"; // the OFF image-blindness fallback
const mediaOn = buildCustomerAgentSystemPrompt(ctx({ geoRouting: false, mediaTurnTrigger: true }) as never);
const mediaOff = buildCustomerAgentSystemPrompt(ctx({ geoRouting: false, mediaTurnTrigger: false }) as never);

// ── THE FIX (red→green): media ON → the image "can't see / ask to TYPE" is GONE ──
ok("media ON: image blindness fallback «ask them to TYPE» is NOT present", !mediaOn.includes(CANT_VIEW));
ok("media ON: prompt tells the model the system READS the image + follow the directive",
  /system READS a customer-sent \*\*image\/photo\/screenshot\*\*/.test(mediaOn) && /FOLLOW it/.test(mediaOn));
ok("media ON: keeps the never-invent guard (no invented price/item)",
  /NEVER invent a price or an item/.test(mediaOn));
ok("media ON: never claims blindness about the picture",
  /NEVER tell the customer you can't see the picture/.test(mediaOn));

// ── FLAG-OFF byte-identical: media OFF → the honest can't-see text is present verbatim ──
ok("media OFF: image blindness fallback «ask them to TYPE» IS present (unchanged)", mediaOff.includes(CANT_VIEW));
ok("media OFF: honest can't-open-image text present", mediaOff.includes("cannot see its contents"));

// ── INDEPENDENCE: the pin half (geoRouting) is unaffected by the media gate ──
ok("pin half unchanged: geo OFF → «مش بقدر أقرا اللوكيشن» still present in BOTH media states",
  mediaOn.includes("مش بقدر أقرا اللوكيشن") && mediaOff.includes("مش بقدر أقرا اللوكيشن"));
const geoOnMediaOn = buildCustomerAgentSystemPrompt(ctx({ geoRouting: true, mediaTurnTrigger: true }) as never);
ok("geo ON + media ON: neither blindness claim renders (both halves gated)",
  !geoOnMediaOn.includes("مش بقدر أقرا اللوكيشن") && !geoOnMediaOn.includes(CANT_VIEW));

console.log(`\n${fail === 0 ? "✅" : "❌"} image-prompt-media: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
