// ============================================================================
// WO-IMAGE-BINDING — RED-FIRST: imports imageAvailabilityGuard / isDeicticImageReference /
// hasResolvedImageCandidate (absent on the pre-WO tree → ESM link fails → red). The
// deterministic image→menu binding + availability guard, anchored on FR-011's three live
// fails (conv b41988eb): promo ad → no false «موجود»; off-menu shrimp pizza → honest
// "not on menu" not «موجودة»; products photo → deictic «ده» binds. Reuses the voice
// candidate matcher; the allergen HARD LAW carries over (a «جمبري» image is never a candidate).
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-image-binding.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  imageAvailabilityGuard, isDeicticImageReference, asksImageAvailability, affirmsAvailability,
  hasResolvedImageCandidate, resolveImageMenuCandidates,
} from "../lib/ai/image-binding.ts";
import { buildImageDirective } from "../lib/messaging/image-turn.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

const MENU = ["أرز","إضافة كاتشب","برجر لحم","بطاطس","بيتزا باربكيو","بيتزا ببروني","بيتزا تشيكن رانش","بيتزا خضار","بيتزا دجاج","بيتزا سماش لحم","بيتزا سوبر رانش","بيتزا سوبر كرانشي","بيتزا كرانشي سموك","بيتزا كيري بسطرمة","بيتزا ميكس جبن","بيتزا هوت دوج","تويستر","ريزو","ريزو دبل شيدر","زنجر","ستربس ١٥ قطعة","ستربس ٣ قطع","ستربس ٥ قطع","ستربس ٧ قطع","سناك بلس","سوبر دينر","سوبر وصاية","عرض ٢ بيتزا وسط","عرض ٦ قطع","عرض ٨ قطع بروست","عرض أكيل","عرض الكتيبة","عرض دبل","عرض شير بوكس","عرض كاديا","عرض ميجا ميل","فيليه سوبريم","قطعة بروست","قطعة ستربس","كول سلو","مياه معدنية","ميسي زنجر","هالبينو","وجبة أطفال","وجبة دينر","وجبة سناك","وجبة وصاية العائلية"];
// The three FR-011 vision descriptions (conv b41988eb).
const D_PROMO = "صورة إعلانية/ترويجية لمطعم ويسايا (WESAYA) توضح طبق دجاج مقلي مع بطاطس مقلية، وشخص يصب صلصة صفراء عليه من زجاجة. الصورة تحتوي على رقم الهاتف وروابط التطبيق للطلب.";
const D_SHRIMP = "صورة بيتزا دائرية عليها جمبري (أو روبيان)، زيتون أسود، وفلفل أخضر على صلصة بندورة وجبنة.";
const D_PRODUCTS = "الصورة تعرض أصناف من مطعم (يظهر الشعار الأحمر): بطاطس مقلية في علبة حمراء، قطع دجاج مقلي في علبة بيضاء، خبز مستدير، وكأس صلصة (كول سلو أو مايونيز). دي صورة منتجات/قائمة أسعار، وليست صورة طلب فعلي.";

// ══ LEG 1 — FR-011 fail 1 (promo ad, «موجود؟» → «آه موجود»): guard fires, no false موجود ══
{
  const g = imageAvailabilityGuard({ customerMessage: "موجود؟", replyText: "آه، موجود 😊 تحب تطلب إيه؟", description: D_PROMO, menuItemNames: MENU, dialect: "egyptian" });
  ok("LEG1: the promo-ad affirmation is REWRITTEN (a generic ad resolves to no specific item)", !!g.rewritten);
  ok("LEG1: the rewrite does NOT affirm availability (says مش موجود)", !!g.rewritten && /مش موجود/.test(g.rewritten!));
  ok("LEG1: the signal records the wrong affirmation for measurement",
    g.signal?.affirmed_wrongly === true && g.signal?.image_desc === D_PROMO);
}

// ══ LEG 2 — FR-011 fail 2 (shrimp pizza): honest "not on menu", allergen HARD LAW holds ══
{
  const g = imageAvailabilityGuard({ customerMessage: "موجود دي طيب", replyText: "آه موجودة 😊 تحب أي وجبة منهم؟", description: D_SHRIMP, menuItemNames: MENU, dialect: "egyptian" });
  ok("LEG2: the shrimp-pizza «موجودة» is rewritten to an honest no-match", !!g.rewritten && /مش موجود/.test(g.rewritten!));
  // HARD LAW: an allergen token from a description is NEVER a candidate — a pure-shrimp image yields none.
  ok("LEG2: allergen HARD LAW — a «جمبري» (shellfish) image resolves to NO candidate",
    resolveImageMenuCandidates("صورة جمبري وروبيان", MENU).length === 0);
}

// ══ LEG 3 — FR-011 fail 3 (products photo): deictic «ده» binds; guard does NOT overfire ══
{
  ok("LEG3: «موجود ده؟» is a deictic image reference", isDeicticImageReference("موجود ده؟") === true);
  ok("LEG3: the directive binds the deictic to THIS image (no «تقصد إيه»)",
    /إشارة مباشرة للصورة دي/.test(buildImageDirective({ caption: "موجود ده؟", description: D_PRODUCTS }, { deictic: true })));
  // A products photo of the tenant's OWN items resolves (distinctive «كول سلو») → a real
  // affirmation is left to stand (the good 21:06:18 «ده يشبه عرض كاديا» style).
  const g = imageAvailabilityGuard({ customerMessage: "موجود ده؟", replyText: "آه موجود ده يشبه عرض كاديا", description: D_PRODUCTS, menuItemNames: MENU, dialect: "egyptian" });
  ok("LEG3: a resolved products photo is NOT rewritten (no overfire on legit items)", g.rewritten === null && g.signal === null);
}

// ══ LEG 4 — detectors ════════════════════════════════════════════════════════
{
  ok("LEG4: asksImageAvailability", asksImageAvailability("موجود؟") && asksImageAvailability("ده متوفر عندكم؟") && !asksImageAvailability("عايز اتنين"));
  ok("LEG4: affirmsAvailability — positive fires, a «مش موجود» negation does NOT",
    affirmsAvailability("آه موجودة") === true && affirmsAvailability("للأسف ما عندناش بيتزا جمبري") === false && affirmsAvailability("مش موجود") === false);
  ok("LEG4: isDeicticImageReference — «ده/دي/الصورة» yes, a plain word no",
    isDeicticImageReference("عايز دي") && isDeicticImageReference("اللي في الصورة") && !isDeicticImageReference("عايز برجر"));
}

// ══ LEG 5 — distinctive resolution: generic ingredient tokens don't confidently resolve ══
{
  ok("LEG5: a distinctive item («كول سلو») resolves", hasResolvedImageCandidate("فيه كول سلو", MENU) === true);
  ok("LEG5: a bare generic ingredient («بيتزا»/«دجاج»/«بطاطس») does NOT confidently resolve",
    hasResolvedImageCandidate("صورة بيتزا", MENU) === false && hasResolvedImageCandidate("دجاج مقلي مع بطاطس", MENU) === false);
}

// ══ LEG 6 — no-op when there's no availability question or no affirmation (byte-identical) ══
{
  ok("LEG6: no availability question → no rewrite",
    imageAvailabilityGuard({ customerMessage: "عايز اتنين", replyText: "آه موجود", description: D_PROMO, menuItemNames: MENU, dialect: "egyptian" }).rewritten === null);
  ok("LEG6: the reply doesn't affirm → no rewrite",
    imageAvailabilityGuard({ customerMessage: "موجود؟", replyText: "تحب تطلب إيه؟", description: D_PROMO, menuItemNames: MENU, dialect: "egyptian" }).rewritten === null);
}

// ══ LEG 7 — WIRING: guard inside media_turn_trigger gate + signal + deictic directive ══
{
  const ct = read("lib/ai/customer-turn.ts");
  ok("WIRE: the guard runs ONLY inside the media_turn_trigger gate (flag-off byte-identical)",
    /if \(input\.imageContext && isFeatureExplicitlyEnabled\("media_turn_trigger", tenantFeatures\)\) \{[\s\S]*?imageAvailabilityGuard\(\{/.test(ct));
  ok("WIRE: a rewrite emits the image_binding_rewrite measurement signal",
    /type: "image_binding_rewrite", detail: \{ \.\.\.imgGuard\.signal \}/.test(ct));
  ok("WIRE: the directive receives the deictic flag",
    /buildImageDirective\(input\.imageContext, \{ deictic: isDeicticImageReference\(input\.imageContext\.caption \?\? ""\) \}\)/.test(ct));
}

console.log(`\nWO-IMAGE-BINDING PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
