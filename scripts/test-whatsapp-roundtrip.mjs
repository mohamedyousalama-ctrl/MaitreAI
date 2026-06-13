// ============================================================================
// MaitreAI — S9-1 WhatsApp webhook round-trip test
// Drives the REAL webhook end-to-end against a running server:
//   1. GET verify handshake (WHATSAPP_VERIFY_TOKEN echoes the challenge)
//   2. POST a synthetic inbound message → persisted + Brain responds
//   3. POST the SAME message id again → deduped, no second response
// WhatsApp send stays in "test mode" here (no access token) so nothing is
// transmitted — this proves the inbound→Brain→persist keystone, not delivery
// (delivery is the owner-driven sandbox proof, see docs/WHATSAPP_GO_LIVE.md).
//
// Run a dev server with AI_ADAPTER=mock first, then:  node scripts/test-whatsapp-roundtrip.mjs
// ============================================================================

const BASE = process.env.BASE || "http://localhost:3000";
const WEBHOOK = `${BASE}/api/whatsapp/webhook`;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";

let failures = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

function payload({ phone, id, text }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ wa_id: phone, profile: { name: "عميل اختبار" } }],
              messages: [
                { from: phone, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function main() {
  console.log(`=== S9-1 WhatsApp webhook round-trip vs ${BASE} ===\n`);

  // 1. GET verify handshake
  if (VERIFY_TOKEN) {
    const challenge = `chal_${Date.now()}`;
    const u = `${WEBHOOK}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=${challenge}`;
    const res = await fetch(u);
    const body = await res.text();
    ok(res.status === 200 && body === challenge, "GET handshake echoes challenge", `status=${res.status}`);

    const bad = await fetch(`${WEBHOOK}?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=x`);
    ok(bad.status === 403, "GET handshake rejects wrong token", `status=${bad.status}`);
  } else {
    console.log("⚠️  WHATSAPP_VERIFY_TOKEN not set — skipping handshake checks");
  }

  // 2. POST a fresh inbound message
  const phone = `2010${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;
  const id = `wamid.test.${Date.now()}`;
  const p = payload({ phone, id, text: "السلام عليكم، حابب اعرف المنيو" });

  const r1 = await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
  const j1 = await r1.json();
  console.log("  first POST →", JSON.stringify(j1));
  ok(r1.status === 200, "POST returns 200 quickly", `status=${r1.status}`);
  ok(j1.received === 1, "received = 1");
  ok(j1.persisted === 1, "persisted = 1 (new message)");
  ok(j1.responded === 1, "Brain responded = 1 (inbound → reply persisted)");

  // 3. Redelivery of the same id → deduped, no second response
  const r2 = await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
  const j2 = await r2.json();
  console.log("  redelivery POST →", JSON.stringify(j2));
  ok(j2.deduped === 1 && j2.persisted === 0, "redelivery deduped (idempotent)", JSON.stringify(j2));
  ok(j2.responded === 0, "no duplicate Brain response on redelivery");

  console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("test error:", e);
  process.exit(1);
});
