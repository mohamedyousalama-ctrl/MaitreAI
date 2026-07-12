// WO-LIVE4-F2 — RED-FIRST: per-conversation inbound coalescing (merge, never drop).
// Meta delivers each inbound message as its OWN webhook, so the bridge answered only the
// newest customer row → a burst of rapid messages became N Brain turns = N replies (live
// #1004 double reply), and any burst message that ISN'T last never reached the gated
// userMessage — so a safety word (allergy) sitting anywhere but last BYPASSED the
// deterministic allergen INPUT gate. coalesceInbound merges the unanswered burst into ONE
// gated turn, answers once, and (via the caller's watermark) makes the burst's second
// webhook silent while never dropping a message that lands mid-turn.
// Run: node --experimental-strip-types scripts/proof-inbound-coalescing-f2.test.ts
import { coalesceInbound, type CoalesceRow } from "../lib/messaging/inbound-coalescing.ts";

let pass = 0, fail = 0;
const eq = (n: string, actual: unknown, expected: unknown) => {
  if (actual === expected) pass++;
  else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
};
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// created_at helper — fixed epoch base (no Date.now(): strip-only test determinism).
const T0 = Date.parse("2026-07-12T04:00:00.000Z");
const at = (secOffset: number) => new Date(T0 + secOffset * 1000).toISOString();
const cust = (text: string | null, sec: number, meta: Record<string, unknown> | null = null): CoalesceRow =>
  ({ sender: "customer", text, created_at: at(sec), meta });
const ai = (text: string, sec: number): CoalesceRow => ({ sender: "ai", text, created_at: at(sec), meta: null });

// ── 1. DOUBLE-REPLY FIX: two rapid messages, no watermark, no prior reply → ONE turn ──
{
  const rows = [cust("عايز فراخ", 1), cust("وبطاطس كمان", 2)];
  const c = coalesceInbound(rows, { enabled: true, watermarkMs: null })!;
  ok("burst of 2 → coalesced (not null)", !!c);
  eq("burst count = 2", c.count, 2);
  ok("merged text contains BOTH messages", c.mergedText.includes("عايز فراخ") && c.mergedText.includes("وبطاطس كمان"));
  eq("watermark to persist = newest created_at", c.maxCreatedAtMs, Date.parse(at(2)));
  eq("anchor is the newest row", c.anchor.created_at, at(2));
}

// ── 2. SAFETY HEADLINE: allergy is NOT the last message → its text still reaches the gate ──
{
  const rows = [cust("عندي حساسية فول سوداني", 1), cust("وعايز اضيف بطاطس", 2)];
  const c = coalesceInbound(rows, { enabled: true, watermarkMs: null })!;
  ok("allergy-not-last: merged gated text INCLUDES the allergy sentence",
    c.mergedText.includes("حساسية فول سوداني"));
  // Contrast — the legacy single-message path (enabled:false) drops it from the gated input.
  const legacy = coalesceInbound(rows, { enabled: false, watermarkMs: null })!;
  ok("legacy (flag OFF) gated text is ONLY the last message (the bug this fixes)",
    !legacy.mergedText.includes("حساسية فول سوداني") && legacy.mergedText.includes("اضيف بطاطس"));
}

// ── 3. SECOND WEBHOOK SILENT: watermark = newest of the just-answered burst → null ──
{
  const rows = [cust("عايز فراخ", 1), cust("وبطاطس كمان", 2)];
  const c = coalesceInbound(rows, { enabled: true, watermarkMs: Date.parse(at(2)) });
  ok("watermark at newest → empty burst → null (no double reply)", c === null);
}

// ── 4. NEVER DROP under the race: a message that landed AFTER the watermark gets its turn ──
{
  // Turn A answered msg1 (@1) and stamped watermark=@1. msg2 (@2) landed mid-compute.
  const rows = [cust("رسالة ١", 1), cust("رسالة ٢", 2)];
  const c = coalesceInbound(rows, { enabled: true, watermarkMs: Date.parse(at(1)) })!;
  eq("post-watermark straggler → its own turn (count 1)", c.count, 1);
  ok("straggler answered (not dropped)", c.mergedText.includes("رسالة ٢") && !c.mergedText.includes("رسالة ١"));
}

// ── 5. FLAG OFF byte-identical: a 2-message burst collapses to the newest only ──
{
  const rows = [cust("أولى", 1), cust("ثانية", 2)];
  const c = coalesceInbound(rows, { enabled: false, watermarkMs: null })!;
  eq("flag off: count = 1 (legacy single-message)", c.count, 1);
  eq("flag off: gated text = newest message only", c.mergedText, "ثانية");
  eq("flag off: anchor = newest", c.anchor.created_at, at(2));
}

// ── 6. COLD START: watermark NULL but a prior reply exists → only the UNanswered tail ──
{
  const rows = [cust("سؤال قديم", 1), ai("رد قديم", 2), cust("جديد ١", 3), cust("جديد ٢", 4)];
  const c = coalesceInbound(rows, { enabled: true, watermarkMs: null })!;
  eq("cold start: burst = the 2 messages AFTER the last reply", c.count, 2);
  ok("cold start: does NOT re-gather the already-answered old message",
    !c.mergedText.includes("سؤال قديم") && c.mergedText.includes("جديد ١") && c.mergedText.includes("جديد ٢"));
}

// ── 7. PIN honored ANYWHERE in the burst (pin-then-text) ──────────────────────
{
  const pinMeta = { location: { lat: 30.0, lng: 31.2, name: "بيت" } };
  const rows = [cust("📍", 1, pinMeta), cust("وعايز اطلب", 2)];
  const c = coalesceInbound(rows, { enabled: true, watermarkMs: null })!;
  ok("pin row selected even though the newest message is text", c.pinRow?.created_at === at(1));
  eq("anchor is still the newest (text) row", c.anchor.created_at, at(2));
  ok("merged text carries the later request", c.mergedText.includes("وعايز اطلب"));
}

// ── 8. IMAGE honored anywhere in the burst ────────────────────────────────────
{
  const imgMeta = { image: { caption: "العرض", description: "منيو" } };
  const rows = [cust("العرض", 1, imgMeta), cust("كام سعره؟", 2)];
  const c = coalesceInbound(rows, { enabled: true, watermarkMs: null })!;
  ok("image row selected from the burst", c.imageRow?.created_at === at(1));
}

// ── 9. NO customer message at all → null (caller skips) ───────────────────────
{
  const c = coalesceInbound([ai("مرحبا", 1)], { enabled: true, watermarkMs: null });
  ok("no customer row → null", c === null);
}

// ── 10. Brand-new conversation (no reply yet, wm null) → answer the whole tail ─
{
  const rows = [cust("أ", 1), cust("ب", 2), cust("ج", 3)];
  const c = coalesceInbound(rows, { enabled: true, watermarkMs: null })!;
  eq("brand-new: whole unanswered tail coalesced", c.count, 3);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} inbound-coalescing-f2: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
