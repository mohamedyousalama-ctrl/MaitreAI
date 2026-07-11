// WO-LIVE-3 §3/§5 — RED-FIRST: pure customer media-intent detectors.
// asksForMorePhotos raises the per-message photo cap 2→3; asksForMenuLink legitimises
// an intentional web-menu-link send. Both must be high-precision — a plain order or a
// passing mention must NOT fire.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/test-media-intent.test.ts
import { asksForMorePhotos, asksForMenuLink } from "../lib/ai/media-intent.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── asksForMorePhotos: FIRES on an explicit more/all-photos ask ──
ok("«ورّيني كل الأصناف بالصور»", asksForMorePhotos("ورّيني كل الأصناف بالصور"));
ok("«عايز اشوف صور اكتر»", asksForMorePhotos("عايز اشوف صور اكتر"));
ok("«ابعتلي باقي الصور»", asksForMorePhotos("ابعتلي باقي الصور"));
ok("«وريني المزيد من الاصناف»", asksForMorePhotos("وريني المزيد من الاصناف"));
ok("«كمان صور من فضلك»", asksForMorePhotos("كمان صور من فضلك"));
// ── asksForMorePhotos: does NOT fire on a plain order / no show-context ──
ok("plain order → no", !asksForMorePhotos("عايز اتنين بروست وعصير"));
ok("«اكتر من كده غالي» (more, no media) → no", !asksForMorePhotos("ده اكتر من كده غالي"));
ok("empty → no", !asksForMorePhotos(""));
ok("«تمام» → no", !asksForMorePhotos("تمام"));

// ── asksForMenuLink: FIRES on an explicit menu/link ask ──
ok("«ابعتلي المنيو»", asksForMenuLink("ابعتلي المنيو"));
ok("«ممكن القائمة؟»", asksForMenuLink("ممكن القائمة؟"));
ok("«عندكم لينك المنيو؟»", asksForMenuLink("عندكم لينك المنيو؟"));
ok("«ابغى الرابط»", asksForMenuLink("ابغى الرابط"));
ok("«send me the menu link»", asksForMenuLink("send me the menu link"));
ok("«عايز اشوف المنيو»", asksForMenuLink("عايز اشوف المنيو"));
// ── asksForMenuLink: does NOT fire on a passing mention without a request ──
ok("«المنيو حلو» (praise, no ask) → no", !asksForMenuLink("المنيو حلو مرة"));
ok("plain order → no", !asksForMenuLink("عايز اتنين بروست"));
ok("empty → no", !asksForMenuLink(""));

console.log(`\n${fail === 0 ? "✅" : "❌"} media-intent: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
