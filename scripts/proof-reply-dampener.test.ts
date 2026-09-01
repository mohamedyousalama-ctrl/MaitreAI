// WO-LIVE6-REPLY-DAMPENER — RED-FIRST: a burst of unclear fragments must not draw an endless
// «مش فاهم» pile-up. Live (conv 68966859, 15:18–15:19): single letters «د/سا/ب/ست/ا»,
// punctuation «:(:$», emoji «😁🇮🇷💔😞✨/😊🤡🙏😂🥶» — each got a reply, 4+ «مش فاهم» in seconds.
// Fix: after 2 answered unclear replies within a 5-min window, a 3rd+ unclear fragment is
// SILENCED — but the allergen net + human-request detector run FIRST and always win, and any
// meaningful message resets. CRITICAL live proof: the burst was immediately followed by a human
// request (15:22) and a severe-allergy disclosure (15:24) — both meaningful, both answered.
// Run: node --conditions=react-server --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-reply-dampener.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import { isUnclearFragment, trailingUnclearStreak, shouldDampenReply, DAMPEN_WINDOW_MS } from "../lib/ai/reply-dampener.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── A — the detector (skip-on-doubt): unmistakably non-actionable = unclear; everything else meaningful ──
for (const t of ["د", "ا", "ب", ":(:$", "😁🇮🇷💔😞✨", "😊🤡🙏😂🥶", "", "   "]) ok(`A: «${t}» → unclear`, isUnclearFragment(t) === true);
for (const t of ["سا", "ست", "تياسز", "حسرط بزخ", "اه", "لا", "تمام", "١٥٠", "5", "رز", "شاي", "عايز بيتزا", "عاوز اتكلم مع موظف", "عند حساسية شديدة من البيض"])
  ok(`A: «${t}» → meaningful (never silenced)`, isUnclearFragment(t) === false);

// ── B — the streak + dampen on the LIVE sequence (nowMs = the 15:19:06 emoji fragment) ──
const NOW = Date.parse("2026-07-12T15:19:06.000Z");
const prior = [
  { text: "😁🇮🇷💔😞✨", createdAtMs: Date.parse("2026-07-12T15:19:04Z") }, // unclear
  { text: ":(:$", createdAtMs: Date.parse("2026-07-12T15:19:00Z") },       // unclear
  { text: "ا", createdAtMs: Date.parse("2026-07-12T15:18:59Z") },          // unclear
  { text: "ست", createdAtMs: Date.parse("2026-07-12T15:18:58Z") },         // meaningful → STOP
  { text: "ب", createdAtMs: Date.parse("2026-07-12T15:18:56Z") },
];
ok("B: trailing unclear streak = 3 (stops at the meaningful «ست»)", trailingUnclearStreak(prior, NOW) === 3);
ok("B: the LIVE 4th emoji fragment «😊🤡🙏😂🥶» IS dampened (streak ≥ 2)", shouldDampenReply("😊🤡🙏😂🥶", prior, NOW) === true);

// ── C — SAFETY-FIRST: a human request / a real message is NEVER dampened even mid-burst ──
ok("C: «عاوز اتكلم مع موظف» (human request, 15:22) → NEVER dampened", shouldDampenReply("عاوز اتكلم مع موظف", prior, NOW) === false);
ok("C: «عند حساسية شديدة من البيض» (allergy, 15:24) → NEVER dampened", shouldDampenReply("عند حساسية شديدة من البيض", prior, NOW) === false);
ok("C: a meaningful message intervening RESETS the streak (next unclear is answered)",
  shouldDampenReply("😊", [{ text: "عايز بيتزا", createdAtMs: Date.parse("2026-07-12T15:19:05Z") }, ...prior], NOW) === false);

// ── D — window + threshold ──
ok("D: only 1 trailing unclear (streak < 2) → NOT dampened (2 replies are fair warning)",
  shouldDampenReply("😊", [prior[0], { text: "عايز حاجة", createdAtMs: Date.parse("2026-07-12T15:19:03Z") }], NOW) === false);
ok("D: a stale streak (older than the 5-min window) does NOT dampen",
  shouldDampenReply("😊", [
    { text: "د", createdAtMs: NOW - DAMPEN_WINDOW_MS - 1000 },
    { text: "ا", createdAtMs: NOW - DAMPEN_WINDOW_MS - 2000 },
  ], NOW) === false);

// ── E — source wiring: flag-gated, SAFETY-FIRST, before the Brain, releases the claim, silent ──
const rs = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");
ok("E: the dampener is gated on the reply_dampener flag",
  /isFeatureExplicitlyEnabled\("reply_dampener", convFlags\)/.test(rs));
// The phonetic near-miss net was a fourth term in this predicate and is gone by Founder
// ruling (lib/ai/phonetic-safety-net.ts). What this assertion is FOR is unchanged: a safety
// message or a request for a human must never be swallowed by the dampener, so the exact
// detectors and the human door are all still required to bail before it.
ok("E: SAFETY-FIRST — allergen avoidance/symptom/emergency + human-request all bail before dampening",
  /const safetyOrHuman =[\s\S]{0,400}?detectAllergenAvoidance\(userMessage\)[\s\S]{0,200}?detectAllergenSymptom\(userMessage\)[\s\S]{0,200}?detectAllergenEmergency\(userMessage\)[\s\S]{0,120}?isExplicitHumanRequest\(userMessage\)/.test(rs) &&
  /if \(!safetyOrHuman\)/.test(rs));
ok("E: …and the dampener does not consult the retired near-miss net",
  !/detectPhoneticSafetyNet\(/.test(rs));
ok("E: the dampen check runs BEFORE the Brain turn (runCustomerTurn)",
  rs.indexOf("shouldDampenReply(userMessage") < rs.indexOf("outcome = await runCustomerTurn(") &&
  rs.indexOf("shouldDampenReply(userMessage") > 0);
ok("E: on dampen it releases the turn claim and returns a SILENT status (no reply sent)",
  /shouldDampenReply\(userMessage, priorCustomer, Date\.now\(\)\)\)\s*\{[\s\S]{0,260}?turnClaimDeployed\) await releaseTurn[\s\S]{0,120}?return \{ status: "dampened" \}/.test(rs));
ok("E: the streak is derived from the recent messages (no migration) — prior CUSTOMER rows only",
  /rows\s*\.slice\(0, lastCustomerIdx\)[\s\S]{0,200}?m\.sender === "customer"[\s\S]{0,200}?shouldDampenReply/.test(rs));

console.log(`\n${fail === 0 ? "✅" : "❌"} reply-dampener: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
