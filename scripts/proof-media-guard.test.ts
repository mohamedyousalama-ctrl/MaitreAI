// WO-MEDIA-GUARD — unit tests for the deterministic outbound media disposer (pure).
// Run: node --experimental-strip-types scripts/proof-media-guard.test.ts
import {
  decideMediaSend,
  MAX_IMAGES_PER_MESSAGE,
  CONVERSATION_MEDIA_BUDGET,
} from "../lib/messaging/media-guard.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const eqd = (n: string, got: unknown, want: unknown) =>
  ok(`${n} (got ${JSON.stringify(got)} want ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want));

// Sanity on the constants (the ruled caps).
ok("cap = 3 images / message", MAX_IMAGES_PER_MESSAGE === 3);
ok("budget = 6 images / conversation", CONVERSATION_MEDIA_BUDGET === 6);

// ── HARD ZERO (fail-closed) — the safety-zero case + complaint + payment ──
eqd("safety-held → ZERO, no link",
  decideMediaSend({ requested: 3, imagesAlreadySent: 0, hardZero: true, hardZeroReason: "safety_hold" }),
  { allowed: 0, fallbackToMenuLink: false, reason: "safety_hold" });
eqd("complaint-open → ZERO, no link",
  decideMediaSend({ requested: 2, imagesAlreadySent: 0, hardZero: true, hardZeroReason: "complaint_open" }),
  { allowed: 0, fallbackToMenuLink: false, reason: "complaint_open" });
eqd("payment-pending → ZERO, no link",
  decideMediaSend({ requested: 4, imagesAlreadySent: 0, hardZero: true, hardZeroReason: "payment_pending" }),
  { allowed: 0, fallbackToMenuLink: false, reason: "payment_pending" });
// Hard-zero WINS even when budget is fully available and reason is unset.
eqd("hard-zero beats an empty budget, default reason safety_hold",
  decideMediaSend({ requested: 3, imagesAlreadySent: 0, hardZero: true }),
  { allowed: 0, fallbackToMenuLink: false, reason: "safety_hold" });

// ── Per-message cap (3) ──
eqd("requested 5, fresh convo → 3 (per-message cap)",
  decideMediaSend({ requested: 5, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 3, fallbackToMenuLink: false, reason: "capped_per_message" });
eqd("requested 3, fresh convo → 3 (exactly at cap, ok)",
  decideMediaSend({ requested: 3, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 3, fallbackToMenuLink: false, reason: "ok" });
eqd("requested 2, fresh convo → 2 (under cap, ok)",
  decideMediaSend({ requested: 2, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 2, fallbackToMenuLink: false, reason: "ok" });

// ── Conversation budget (6) ──
eqd("already 4, wants 3 → only 2 left in budget",
  decideMediaSend({ requested: 3, imagesAlreadySent: 4, hardZero: false }),
  { allowed: 2, fallbackToMenuLink: false, reason: "budget_capped" });
eqd("already 5, wants 3 → 1 left",
  decideMediaSend({ requested: 3, imagesAlreadySent: 5, hardZero: false }),
  { allowed: 1, fallbackToMenuLink: false, reason: "budget_capped" });
eqd("already 6 (budget spent), wants 3 → 0 + menu link",
  decideMediaSend({ requested: 3, imagesAlreadySent: 6, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: true, reason: "budget_exhausted" });
eqd("already 7 (over budget), wants 2 → 0 + menu link",
  decideMediaSend({ requested: 2, imagesAlreadySent: 7, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: true, reason: "budget_exhausted" });
eqd("budget spent but agent wanted 0 → 0, NO link (nothing to fall back to)",
  decideMediaSend({ requested: 0, imagesAlreadySent: 6, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: false, reason: "budget_exhausted" });
eqd("already 3, wants 3 → 3 (exactly fits remaining, ok)",
  decideMediaSend({ requested: 3, imagesAlreadySent: 3, hardZero: false }),
  { allowed: 3, fallbackToMenuLink: false, reason: "ok" });

// ── requested 0 / degenerate & hostile inputs (clamped) ──
eqd("requested 0, fresh → 0, no link",
  decideMediaSend({ requested: 0, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: false, reason: "ok" });
eqd("negative requested → clamped to 0",
  decideMediaSend({ requested: -5, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: false, reason: "ok" });
eqd("NaN already → treated as 0 (full budget)",
  decideMediaSend({ requested: 5, imagesAlreadySent: NaN, hardZero: false }),
  { allowed: 3, fallbackToMenuLink: false, reason: "capped_per_message" });
eqd("float requested 2.9 → floor 2",
  decideMediaSend({ requested: 2.9, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 2, fallbackToMenuLink: false, reason: "ok" });

// Invariant sweep: allowed is ALWAYS within [0, min(3, remaining)] and never > requested.
for (let already = 0; already <= 8; already++) {
  for (let req = 0; req <= 8; req++) {
    const d = decideMediaSend({ requested: req, imagesAlreadySent: already, hardZero: false });
    const remaining = Math.max(0, CONVERSATION_MEDIA_BUDGET - already);
    ok(`invariant already=${already} req=${req}: 0≤allowed≤min(3,remaining) & ≤req`,
      d.allowed >= 0 && d.allowed <= Math.min(MAX_IMAGES_PER_MESSAGE, remaining) && d.allowed <= req);
  }
}
// Invariant: hardZero ALWAYS yields zero, for every requested/already combination.
for (let already = 0; already <= 8; already++) {
  for (const reason of ["safety_hold", "complaint_open", "payment_pending"] as const) {
    const d = decideMediaSend({ requested: 3, imagesAlreadySent: already, hardZero: true, hardZeroReason: reason });
    ok(`safety-zero invariant already=${already} reason=${reason}: allowed=0 & no link`,
      d.allowed === 0 && d.fallbackToMenuLink === false && d.reason === reason);
  }
}

console.log(`\nMEDIA-GUARD UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
