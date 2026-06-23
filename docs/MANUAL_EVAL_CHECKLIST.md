# Manual Pre-Merge Eval Checklist

These steps **cannot run in GitHub CI** (they require a live Supabase DB and a
running Next.js server). They are a **required manual gate** before merging any
PR that touches the Brain, allergen gate, confirm/order flow, or safety-hold
ownership logic.

The CI workflow (`agent-eval.yml`) runs the pure unit tests automatically.
This checklist covers the integration proofs that need real infrastructure.

---

## When is this checklist required?

Any PR touching:
- `lib/ai/**` — Brain, prompt, tools, allergen gate, output guard
- `lib/messaging/respond-and-send.ts` — the main Brain dispatch
- `lib/db/ownership.ts` — ownership-state transition enforcement
- `lib/db/conversation-lock.ts` — per-conversation serialization
- `lib/db/orders-create.ts` — order persistence / fingerprint logic
- `app/api/whatsapp/webhook/route.ts` — WhatsApp inbound path

---

## Setup

```bash
set -a; . ./.env.local; set +a   # load NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_ROUTE_SECRET
npm run dev -- -p 3400 &          # start local server
```

---

## Required proofs (must all pass before merge)

| Script | What it proves | Pass criteria |
|--------|---------------|---------------|
| `proof-allergen.mjs` | Deterministic allergen gate end-to-end: `حساسية` fires SYSTEM_HOLD; flag-off is byte-identical; output guard blocks unsafe assertion | All ✅, exit 0 |
| `proof-confirm-flow.mjs` | Confirm flow: with fulfillment → finalizes; without fulfillment → asks pickup/delivery, not the dead generic loop | All ✅, exit 0 |
| `proof-reorder-fingerprint.mjs` | Same draft, different agent-run → two distinct order rows; same agent-run → idempotent no-op | All ✅, exit 0 |
| `proof-conversation-lock.mjs` | Same-conversation serial execution; different-conversation parallelism; stale-lock expiry | All ✅, exit 0 |
| `proof-safety-hold-release.mjs` | Deliberate Return-to-AI resets `is_safety_hold=false`; live hold (owner=human) never auto-clears | All ✅, exit 0 |
| `proof-spine-live.mjs` | SYSTEM_HOLD never auto-returns; #87 guarantee; mismatch canonicalization (#102) | All ✅, exit 0 |

Run each:
```bash
BASE_URL=http://127.0.0.1:3400 node --experimental-strip-types scripts/proof-allergen.mjs
BASE_URL=http://127.0.0.1:3400 node --experimental-strip-types scripts/proof-confirm-flow.mjs
node --experimental-strip-types scripts/proof-reorder-fingerprint.mjs
node --experimental-strip-types scripts/proof-conversation-lock.mjs
node --experimental-strip-types scripts/proof-safety-hold-release.mjs
BASE_URL=http://127.0.0.1:3400 node --experimental-strip-types scripts/proof-spine-live.mjs
```

---

## Sign-off

Before merging, the reviewer confirms in the PR:

```
Manual eval checklist: ✅
- proof-allergen: PASS
- proof-confirm-flow: PASS
- proof-reorder-fingerprint: PASS
- proof-conversation-lock: PASS
- proof-safety-hold-release: PASS
- proof-spine-live: PASS
Tested against: [local / staging] DB, server @ [port]
```
