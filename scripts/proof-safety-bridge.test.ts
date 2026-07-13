// WO-SAFETY-BRIDGE — RED-FIRST (FR-012 residual): a SAFETY-CLASS inbound arriving while a
// conversation is HUMAN_ACTIVE with an ABSENT operator must never sit unacknowledged. The
// takeover branch otherwise bails silently (respond-and-send.ts skipped_takeover). Fix: when the
// wait clock (updated_at, reset only by operator replies) is stale past a short window AND the
// latest inbound is safety-class → send a caution ACK (persona-routed, never-assert-safety) +
// fire a LOUD re-alert. BINDING: ownership stays human (no setOwnershipState) and the wait clock
// is NOT bumped (an automated ack is not operator activity).
// Run: node --conditions=react-server --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-safety-bridge.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import { isSafetyClassInbound, safetyBridgeAck, SAFETY_BRIDGE_WINDOW_MINUTES } from "../lib/ai/safety-bridge.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── A — the safety-class classifier (union of the deterministic detectors) ───────────────
for (const t of ["عندي حساسية من المكسرات", "انا بتحسس من الفول السوداني", "حلقي بيقفل لما اكل بيض", "ممكن اكل ده وانا عندي حساسية؟"])
  ok(`A: «${t}» → SAFETY-CLASS`, isSafetyClassInbound(t) === true);
for (const t of ["عايز بيتزا", "تأكيد الطلب", "تمام", "عايز اطلب", "شكرا", "", "   "])
  ok(`A: «${t}» → not safety (benign)`, isSafetyClassInbound(t) === false);

// ── B — the ACK copy: caution, never reassurance; persona-routed; asserts no safety ──────
{
  const eg = safetyBridgeAck("egyptian");
  const sa = safetyBridgeAck("saudi");
  ok("B: Egyptian ack acknowledges + says team alerted + tells them to HOLD",
    eg.includes("صحتك تهمّنا") && eg.includes("نبّهت فريق المطعم") && eg.includes("ما تكمّلش الطلب"));
  ok("B: Saudi ack is the Khalid variant (معك / لين)", sa.includes("يراجع معك") && sa.includes("لين"));
  ok("B: personas differ (routed by dialect)", eg !== sa);
  ok("B: NEVER asserts safety — no «آمن» / «مفيهوش» / «مضمون» / no ETA «دقيقة»",
    ![eg, sa].some((s) => /آمن|مفيهوش|مضمون|دقيقة|دقايق/.test(s)));
}

// ── C — the window constant is short + independent of the 15-min idle default ────────────
ok("C: SAFETY_BRIDGE_WINDOW_MINUTES is a short window (≤ 5 min, < the 15-min idle default)",
  SAFETY_BRIDGE_WINDOW_MINUTES > 0 && SAFETY_BRIDGE_WINDOW_MINUTES <= 5);

// ── D — source wiring: flag-gated, presence-proxied, safety-classified, dedup'd, LOUD ─────
const rs = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");
const fl = readFileSync(resolve(process.cwd(), "lib/tenant/tier.ts"), "utf8");
const al = readFileSync(resolve(process.cwd(), "lib/alerts/record.ts"), "utf8");

// Isolate the bridge block: from its flag gate to the safety_bridged return.
const gateIdx = rs.indexOf('isFeatureExplicitlyEnabled("safety_bridge", features)');
const retIdx = rs.indexOf('return { status: "safety_bridged"');
const block = gateIdx >= 0 && retIdx > gateIdx ? rs.slice(gateIdx, retIdx + 80) : "";

ok("D: the bridge is gated on the safety_bridge flag", gateIdx >= 0);
ok("D: presence proxy = updated_at stale past SAFETY_BRIDGE_WINDOW_MINUTES (the wait clock)",
  /isIdleBeyond\(conv\.updated_at[\s\S]{0,40}?SAFETY_BRIDGE_WINDOW_MINUTES\)/.test(rs));
ok("D: it classifies the latest inbound via isSafetyClassInbound", /isSafetyClassInbound\(inboundText\)/.test(block));
ok("D: the customer ACK is persona-routed (safetyBridgeAck) and sent", /safetyBridgeAck\(ackDialect\)/.test(block) && /sendWhatsAppText\(\{ to: phone, text: ackText/.test(block));
ok("D: a LOUD re-alert fires — recordCriticalAlert type safety_unattended_handoff",
  /recordCriticalAlert\(admin, \{[\s\S]{0,120}?type: "safety_unattended_handoff"/.test(block));
ok("D: deduped ≤1 per window via a safety_bridge_ack system-note marker",
  /kind === "safety_bridge_ack"/.test(rs) && /alreadyBridged\) return \{ status: "skipped_takeover" \}/.test(rs));
ok("D: returns the safety_bridged status", retIdx > 0);

// ── E — BINDING: ownership UNCHANGED + wait clock NOT bumped inside the bridge block ──────
ok("E: the bridge block NEVER calls setOwnershipState (ownership stays human)",
  block.length > 0 && !/setOwnershipState\s*\(/.test(block));
ok("E: the bridge block NEVER bumps updated_at (an automated ack is not operator activity)",
  block.length > 0 && !/update\(\{[^}]*updated_at/.test(block) && !block.includes("updated_at: new Date"));

// ── F — registration ─────────────────────────────────────────────────────────────────────
ok("F: safety_bridge is registered in the ProFeature union", /"safety_bridge"/.test(fl));
ok("F: safety_unattended_handoff is a CriticalAlertType", /"safety_unattended_handoff"/.test(al) || /safety_unattended_handoff/.test(al));

console.log(`\n${fail === 0 ? "✅" : "❌"} safety-bridge: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
