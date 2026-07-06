// WO-MEDIA-GUARD — unit tests for the deterministic outbound media disposer (pure).
// Run: node --experimental-strip-types scripts/proof-media-guard.test.ts
import {
  decideMediaSend,
  MAX_IMAGES_PER_MESSAGE,
  CONVERSATION_MEDIA_BUDGET,
  LEGACY_MAX_IMAGES,
} from "../lib/messaging/media-guard.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const eqd = (n: string, got: unknown, want: unknown) =>
  ok(`${n} (got ${JSON.stringify(got)} want ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want));

// Sanity on the constants (the ruled caps).
ok("cap = 3 images / message", MAX_IMAGES_PER_MESSAGE === 3);
ok("budget = 6 images / conversation", CONVERSATION_MEDIA_BUDGET === 6);
ok("legacy cap = 4 (flag-off byte-identical slice(0,4))", LEGACY_MAX_IMAGES === 4);

// ── FLAG OFF (enabled:false) — byte-identical legacy slice(0,4): min(req,4), no
//    budget, and hard-zero IGNORED (the pre-guard behavior, exactly). ──
eqd("OFF: requested 5 → 4 (legacy slice(0,4))",
  decideMediaSend({ enabled: false, requested: 5, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 4, fallbackToMenuLink: false, reason: "disabled" });
eqd("OFF: requested 3 → 3 (under legacy cap)",
  decideMediaSend({ enabled: false, requested: 3, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 3, fallbackToMenuLink: false, reason: "disabled" });
eqd("OFF: requested 2 → 2",
  decideMediaSend({ enabled: false, requested: 2, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 2, fallbackToMenuLink: false, reason: "disabled" });
eqd("OFF: hard-zero IGNORED (safety-hold still sends legacy 4 — hard-zero is a flag-ON behavior)",
  decideMediaSend({ enabled: false, requested: 9, imagesAlreadySent: 0, hardZero: true, hardZeroReason: "safety_hold" }),
  { allowed: 4, fallbackToMenuLink: false, reason: "disabled" });
eqd("OFF: budget IGNORED (already 6 still sends legacy min(req,4), no link)",
  decideMediaSend({ enabled: false, requested: 5, imagesAlreadySent: 6, hardZero: false }),
  { allowed: 4, fallbackToMenuLink: false, reason: "disabled" });
eqd("OFF: requested 0 → 0",
  decideMediaSend({ enabled: false, requested: 0, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: false, reason: "disabled" });

// ── HARD ZERO (fail-closed, flag ON) — the safety-zero case + complaint + payment ──
eqd("safety-held → ZERO, no link",
  decideMediaSend({ enabled: true, requested: 3, imagesAlreadySent: 0, hardZero: true, hardZeroReason: "safety_hold" }),
  { allowed: 0, fallbackToMenuLink: false, reason: "safety_hold" });
eqd("complaint-open → ZERO, no link",
  decideMediaSend({ enabled: true, requested: 2, imagesAlreadySent: 0, hardZero: true, hardZeroReason: "complaint_open" }),
  { allowed: 0, fallbackToMenuLink: false, reason: "complaint_open" });
eqd("payment-pending → ZERO, no link",
  decideMediaSend({ enabled: true, requested: 4, imagesAlreadySent: 0, hardZero: true, hardZeroReason: "payment_pending" }),
  { allowed: 0, fallbackToMenuLink: false, reason: "payment_pending" });
// Hard-zero WINS even when budget is fully available and reason is unset.
eqd("hard-zero beats an empty budget, default reason safety_hold",
  decideMediaSend({ enabled: true, requested: 3, imagesAlreadySent: 0, hardZero: true }),
  { allowed: 0, fallbackToMenuLink: false, reason: "safety_hold" });

// ── Per-message cap (3), flag ON ──
eqd("requested 5, fresh convo → 3 (per-message cap)",
  decideMediaSend({ enabled: true, requested: 5, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 3, fallbackToMenuLink: false, reason: "capped_per_message" });
eqd("requested 3, fresh convo → 3 (exactly at cap, ok)",
  decideMediaSend({ enabled: true, requested: 3, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 3, fallbackToMenuLink: false, reason: "ok" });
eqd("requested 2, fresh convo → 2 (under cap, ok)",
  decideMediaSend({ enabled: true, requested: 2, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 2, fallbackToMenuLink: false, reason: "ok" });

// ── Conversation budget (6), flag ON ──
eqd("already 4, wants 3 → only 2 left in budget",
  decideMediaSend({ enabled: true, requested: 3, imagesAlreadySent: 4, hardZero: false }),
  { allowed: 2, fallbackToMenuLink: false, reason: "budget_capped" });
eqd("already 5, wants 3 → 1 left",
  decideMediaSend({ enabled: true, requested: 3, imagesAlreadySent: 5, hardZero: false }),
  { allowed: 1, fallbackToMenuLink: false, reason: "budget_capped" });
eqd("already 6 (budget spent), wants 3 → 0 + menu link",
  decideMediaSend({ enabled: true, requested: 3, imagesAlreadySent: 6, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: true, reason: "budget_exhausted" });
eqd("already 7 (over budget), wants 2 → 0 + menu link",
  decideMediaSend({ enabled: true, requested: 2, imagesAlreadySent: 7, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: true, reason: "budget_exhausted" });
eqd("budget spent but agent wanted 0 → 0, NO link (nothing to fall back to)",
  decideMediaSend({ enabled: true, requested: 0, imagesAlreadySent: 6, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: false, reason: "budget_exhausted" });
eqd("already 3, wants 3 → 3 (exactly fits remaining, ok)",
  decideMediaSend({ enabled: true, requested: 3, imagesAlreadySent: 3, hardZero: false }),
  { allowed: 3, fallbackToMenuLink: false, reason: "ok" });

// ── requested 0 / degenerate & hostile inputs (clamped), flag ON ──
eqd("requested 0, fresh → 0, no link",
  decideMediaSend({ enabled: true, requested: 0, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: false, reason: "ok" });
eqd("negative requested → clamped to 0",
  decideMediaSend({ enabled: true, requested: -5, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 0, fallbackToMenuLink: false, reason: "ok" });
eqd("NaN already → treated as 0 (full budget)",
  decideMediaSend({ enabled: true, requested: 5, imagesAlreadySent: NaN, hardZero: false }),
  { allowed: 3, fallbackToMenuLink: false, reason: "capped_per_message" });
eqd("float requested 2.9 → floor 2",
  decideMediaSend({ enabled: true, requested: 2.9, imagesAlreadySent: 0, hardZero: false }),
  { allowed: 2, fallbackToMenuLink: false, reason: "ok" });

// Invariant sweep (flag ON): allowed is ALWAYS within [0, min(3, remaining)] and ≤ requested.
for (let already = 0; already <= 8; already++) {
  for (let req = 0; req <= 8; req++) {
    const d = decideMediaSend({ enabled: true, requested: req, imagesAlreadySent: already, hardZero: false });
    const remaining = Math.max(0, CONVERSATION_MEDIA_BUDGET - already);
    ok(`invariant already=${already} req=${req}: 0≤allowed≤min(3,remaining) & ≤req`,
      d.allowed >= 0 && d.allowed <= Math.min(MAX_IMAGES_PER_MESSAGE, remaining) && d.allowed <= req);
  }
}
// Invariant (flag ON): hardZero ALWAYS yields zero, for every requested/already combination.
for (let already = 0; already <= 8; already++) {
  for (const reason of ["safety_hold", "complaint_open", "payment_pending"] as const) {
    const d = decideMediaSend({ enabled: true, requested: 3, imagesAlreadySent: already, hardZero: true, hardZeroReason: reason });
    ok(`safety-zero invariant already=${already} reason=${reason}: allowed=0 & no link`,
      d.allowed === 0 && d.fallbackToMenuLink === false && d.reason === reason);
  }
}
// Invariant (flag OFF): byte-identical legacy — ALWAYS min(req,4), no link, ignores budget & hard-zero.
for (let already = 0; already <= 8; already++) {
  for (let req = 0; req <= 8; req++) {
    for (const hz of [false, true]) {
      const d = decideMediaSend({ enabled: false, requested: req, imagesAlreadySent: already, hardZero: hz, hardZeroReason: "safety_hold" });
      ok(`flag-OFF byte-identical already=${already} req=${req} hz=${hz}: allowed=min(req,4), no link`,
        d.allowed === Math.min(req, LEGACY_MAX_IMAGES) && d.fallbackToMenuLink === false && d.reason === "disabled");
    }
  }
}

console.log(`\nMEDIA-GUARD UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
