# MaitreAI — Sprint 9 backlog / carried items

Living list of agreed-but-not-yet-built work surfaced during Sprint 9. Owner-confirmed.

## S9-4.5 — Order persistence from Brain finalize (REQUIRED for pilot)
**Status:** queued — slots after S9-4, before S9-5.
When the Customer Agent calls `finalize_draft` in the WhatsApp webhook flow, the
draft is currently only marked finalized — no `orders` row is created, so the
order never appears in الطلبات and the S9-3 auto-receipt never fires end-to-end.
**Do:** in the webhook/respond-and-send path, on a finalized draft, INSERT a real
order row server-side (items/totals computed by the order tools, never the LLM),
link it to the conversation + customer, set status `pending_confirmation`. This
is the missing link that connects S9-1 (transport) → S9-2 (interactive) → S9-3
(receipt) into the hands-free chain. Not optional for the pilot.

## S9-5 — Printer width matrix (any printer)
**Status:** folded into S9-5.
Render the receipt + kitchen ticket at **58mm and 80mm thermal widths AND a
standard width**, so it prints clean on whatever the restaurant owns.
**Strategy (confirmed):** device-OS print (browser print dialog / phone share
sheet) + the PNG. **No per-printer driver / ESC-POS code.**

## Pre-pilot hardening — Next.js security bump (BEFORE go-live)
**Status:** queued — pre-pilot, NOT mid-sprint.
`npm audit` flags Next.js 14.2.5 middleware authorization-bypass
(GHSA-7gfc-8cq8-jh5f) + eslint-toolchain CVEs. Do a deliberate, tested Next
upgrade (verify auth/RLS/middleware + full build + eval suite) before any real
restaurant goes live. Not from any Sprint 9 dependency (resvg is the only runtime
add). Must not be rushed mid-sprint.
