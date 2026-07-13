// WO-LIVE5-ANSWER-FIRST — RED-FIRST: every reply first serves the customer's latest
// explicit SEE-request before advancing checkout. Live #1005: «ابعتلي صوره الاكيل»
// (03:59:42) and «ابعتلي صوره العرض» (04:00:28) were both IGNORED while Karim pushed
// checkout. A deterministic detector (asksToSeeMedia) + a per-turn directive force the
// photo tool / present_menu / an honest no-photo reply into the turn. Flag answer_first,
// default OFF, byte-identical off-flag and on non-see-request turns.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-answer-first.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import { asksToSeeMedia, buildAnswerFirstDirective } from "../lib/ai/media-intent.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── A — the detector (the live #1005 signature + precision) ───────────────────
ok("live #1005: «ابعتلي صوره الاكيل» IS a see-request", asksToSeeMedia("ابعتلي صوره الاكيل"));
ok("live #1005: «ابعتلي صوره العرض» IS a see-request", asksToSeeMedia("ابعتلي صوره العرض"));
ok("«عايز اشوف صور الأكل» IS a see-request", asksToSeeMedia("عايز اشوف صور الأكل"));
ok("«ممكن صوره للبرجر» IS a see-request", asksToSeeMedia("ممكن صوره للبرجر"));
ok("«وريني المنيو» IS a see-request", asksToSeeMedia("وريني المنيو"));
// Precision — a plain order / bare mention / confirmation must NOT fire.
ok("«عايز اتنين بروست» (a plain order) is NOT a see-request", !asksToSeeMedia("عايز اتنين بروست"));
ok("«المنيو حلو» (a passing mention, no request verb) is NOT a see-request", !asksToSeeMedia("المنيو حلو"));
ok("«تمام» is NOT a see-request", !asksToSeeMedia("تمام"));
ok("«اكد الطلب» is NOT a see-request", !asksToSeeMedia("اكد الطلب"));

// ── B — the directive (rendered only when flag ON + a see-request) ────────────
{
  const d = buildAnswerFirstDirective({ enabled: true, asked: true });
  ok("directive renders when enabled + asked", !!d);
  ok("directive forces send_item_photos for a named item", !!d && d.includes("send_item_photos"));
  ok("directive offers present_menu for a full-menu ask", !!d && d.includes("present_menu"));
  ok("directive forbids advancing to payment/confirm before serving", !!d && /الدفع|التأكيد/.test(d));
}
ok("directive is null when the flag is OFF (byte-identical)", buildAnswerFirstDirective({ enabled: false, asked: true }) === null);
ok("directive is null when there is no see-request (byte-identical)", buildAnswerFirstDirective({ enabled: true, asked: false }) === null);

// ── C — wiring (the red witness): the directive is gated + threaded + appended ──
const ct = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
const rp = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
ok("C: customer-turn gates the directive on the answer_first flag + asksToSeeMedia",
  /isFeatureExplicitlyEnabled\("answer_first"[\s\S]{0,240}?asksToSeeMedia\(input\.userMessage\)/.test(ct));
ok("C: customer-turn passes answerFirstDirective into respond()",
  /respond\(\{[\s\S]{0,600}?answerFirstDirective/.test(ct));
// WO-COST-1 — the directive now rides the UNCACHED system tail (after the cache
// breakpoint), not inline in the cached static block. Same instruction to the model,
// re-layered so a firing directive no longer forces a full cache write.
ok("C: respond() delivers answerFirstDirective via the uncached system tail",
  /composeSystemTail\(\[[\s\S]{0,240}?input\.answerFirstDirective/.test(rp) && /systemTail: systemTail \|\| undefined/.test(rp));

console.log(`\n${fail === 0 ? "✅" : "❌"} answer-first: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
