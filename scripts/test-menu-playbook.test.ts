// Unit tests for the smart-menu conversation playbook (pure, no LLM, no I/O).
// Run: node --experimental-strip-types scripts/test-menu-playbook.test.ts
//
// Asserts (1) the photo-request JUDGMENT classifier (specific=1 / category=3 /
// full-menu=0-first / more=+3→link) and the media-pause states, and (2) the overlay
// contract: all six intent behaviours + the media rules are present, the allergy flow
// pauses selling AND media, diet answers carry the health caution, and the layer defers
// to the engine's hard caps. Persona-agnostic (both dialects). Does NOT grade prose.
import {
  buildMenuPlaybook,
  classifyPhotoRequest,
  mediaPaused,
  MENU_PLAYBOOK_FLAG,
  MEDIA_PAUSED_STATES,
} from "../lib/ai/menu-playbook.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── flag ────────────────────────────────────────────────────────────────────
ok("flag reserved name", MENU_PLAYBOOK_FLAG === "menu_playbook");

// ── photo-request classifier (the media judgment) ───────────────────────────
const specific = classifyPhotoRequest("ابغى صورة البرجر");
ok("specific → 1 photo", specific.kind === "specific" && specific.plannedPhotos === 1);
ok("specific → next-action appended", specific.appendNextAction === true);

const category = classifyPhotoRequest("ورّيني صور العروض");
ok("category/offers → 3", category.kind === "category" && category.plannedPhotos === 3);

const fullSa = classifyPhotoRequest("ابعتلي صور المنيو كامل");
ok("full-menu → 0 photos first", fullSa.kind === "full_menu" && fullSa.plannedPhotos === 0);
ok("full-menu → category-ask-or-link, no bare next-action", fullSa.needsCategoryAskOrLink === true && fullSa.appendNextAction === false);

const fullEg = classifyPhotoRequest("ممكن المنيو كله بالصور");
ok("full-menu (egyptian phrasing) detected", fullEg.kind === "full_menu");

const more = classifyPhotoRequest("كمان صور", true);
ok("more → next batch of 3 + web-menu link", more.kind === "more" && more.plannedPhotos === 3 && more.offerWebMenuLink === true);
const bareMoreAfter = classifyPhotoRequest("كمان", true);
ok("bare «كمان» after a batch → more", bareMoreAfter.kind === "more");

const none = classifyPhotoRequest("ابغى كبسة دجاج");
ok("no photo intent → none/0", none.kind === "none" && none.plannedPhotos === 0);
ok("plain order does NOT append a photo next-action", none.appendNextAction === false);

// ── media-pause states (safety/complaint/payment) ───────────────────────────
ok("media paused during safety", mediaPaused("safety"));
ok("media paused during allergy", mediaPaused("allergy"));
ok("media paused during complaint", mediaPaused("complaint"));
ok("media paused during payment", mediaPaused("payment"));
ok("media NOT paused while browsing", mediaPaused("browsing") === false);
ok("MEDIA_PAUSED_STATES covers the four", MEDIA_PAUSED_STATES.length === 4);

// ── overlay contract (both dialects) ─────────────────────────────────────────
for (const dialect of ["saudi", "egyptian"] as const) {
  const p = buildMenuPlaybook({ dialect });
  ok(`[${dialect}] intent router: all six intents present`,
    /intent router/i.test(p) && /BROWSE/.test(p) && /RECOMMEND/.test(p) && /CONSTRAINT/.test(p) && /COMPARE/.test(p) && /AVAILABILITY/.test(p) && /ALLERGY/.test(p));
  ok(`[${dialect}] browse → narrowing, not a 60-item dump`, /do NOT dump 60 items/.test(p) && /narrowing question/.test(p));
  ok(`[${dialect}] recommend → 2–3 ranked + one question`, /2[–-]3 RANKED picks|2–3 RANKED/.test(p));
  ok(`[${dialect}] constraint → filtered + health caution (mandatory)`, /filtered picks/.test(p) && /caution/.test(p));
  ok(`[${dialect}] availability → engine truth only`, /ENGINE TRUTH ONLY/.test(p));
  ok(`[${dialect}] allergy pauses selling AND media`, /ALL selling and ALL media PAUSE/.test(p));
  ok(`[${dialect}] media rules: specific/category/full/more/after/never-during/no-good-photo`,
    /SPECIFIC item/.test(p) && /CATEGORY/.test(p) && /FULL MENU/.test(p) && /MORE/.test(p) && /AFTER ANY PHOTOS/.test(p) && /NEVER send media during/.test(p) && /NO GOOD PHOTO/.test(p));
  ok(`[${dialect}] defers to the engine's hard caps`, /HARD CAPS/.test(p) && /judgment/i.test(p) && /engine is the\s*\n?\s*enforcer|defer to the engine/.test(p));
  ok(`[${dialect}] never asserts medical suitability`, /Never assert medical suitability/.test(p));
}
ok("dialect anchors differ (saudi vs egyptian)", buildMenuPlaybook({ dialect: "saudi" }) !== buildMenuPlaybook({ dialect: "egyptian" }));
ok("unknown dialect defaults to saudi", buildMenuPlaybook({ dialect: "cairo" }) === buildMenuPlaybook({ dialect: "saudi" }));

console.log(`\nMENU-PLAYBOOK UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
