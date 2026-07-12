// WO-LIVE4-F1 — RED-FIRST: the "can't read location pin" instruction must be gated on
// delivery_geo_routing. Live P0 (order #1004, conv 1c551e6d): the pin WAS routed (a
// zone_misses row was written) but Karim still replied «معلش، مش بقدر أقرا اللوكيشن» —
// the unconditional prompt.ts INCOMING-MEDIA clause overrode the per-turn geoDirective.
// With geo ON the system reads pins, so that instruction must NOT render; with geo OFF
// it is unchanged. The image clause is untouched in both.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-pin-prompt-geo.test.ts
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

const CANT_READ = "مش بقدر أقرا اللوكيشن";
const geoOn = buildCustomerAgentSystemPrompt(ctx({ geoRouting: true }) as never);
const geoOff = buildCustomerAgentSystemPrompt(ctx({ geoRouting: false }) as never);

// ── THE FIX (red→green): geo ON → the pin "can't read / ask in writing" is GONE ──
ok("geo ON: prompt does NOT contain «مش بقدر أقرا اللوكيشن»", !geoOn.includes(CANT_READ));
ok("geo ON: prompt tells Karim the system READS the pin + follow the directive",
  /system READS the customer'?s WhatsApp \*\*location pin\*\*/.test(geoOn) && /FOLLOW that directive/.test(geoOn));
ok("geo ON: still instructs pickup / area-by-name on a miss",
  /offer PICKUP/.test(geoOn) && /area BY NAME/.test(geoOn));

// ── FLAG-OFF behavior unchanged: geo OFF → the pin instruction is still present ──
ok("geo OFF: prompt STILL contains «مش بقدر أقرا اللوكيشن» (pin behavior unchanged)", geoOff.includes(CANT_READ));
ok("geo OFF: still asks for the written address", geoOff.includes("اكتبلي العنوان"));

// ── Image clause UNTOUCHED in BOTH (still can't read images; scoped to media_turn_trigger) ──
ok("geo ON: image clause present (can't open image/photo/screenshot)",
  /image\/photo\/screenshot/.test(geoOn) && /ask them to TYPE/.test(geoOn));
ok("geo OFF: image clause present", /image\/photo\/screenshot/.test(geoOff) && /ask them to TYPE/.test(geoOff));

console.log(`\n${fail === 0 ? "✅" : "❌"} pin-prompt-geo: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
