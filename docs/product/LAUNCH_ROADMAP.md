# Kivo Launch Roadmap — v2

> **Owner:** PM · **Status:** Active · **Last updated:** 2026-07-12

The single canonical view of what it takes to get Wesaya selling and Kivo opening to
external merchants. Phases run top-to-bottom; Tracks M and B run in parallel and gate
*future* merchants and the KSA market respectively, **not** Wesaya's own launch.

---

## Phase 1 — Construction · ✅ CLOSED (12 Jul 2026)

The build phase is complete. Everything below is shipped and live:

- **Monitoring & alerts** (A1) — anomaly ledger + sweep + critical-alert surface.
- **Delivery module** — D1 (geography + branch routing) · D2 (multi-order runs) · D3
  (console-v2 التوصيل board).
- **Companion arc** — W1 (core contract + §0/§6) · W2 (two-axis ingredient×prep data) ·
  W3 (MIZAN rewrite + §7 adversarial batteries).
- **A5** — `/privacy` + `/terms` (Arabic-first, PDPL/EG-aware).
- **C4** — the emerald getkivo.io landing.
- **Conversation quality** (#414) · **data-honesty** (#418) · **signup env split**
  (#410) · **media-inbound** (#415).
- **§0 context gate** (#419) — the «عادي» flavor false-positive fix.
- **Companion block audit** (#420) · **media rules + webhook reachability** (#421).
- **Canonical payments model** (#422) — flag OFF; `0084` prepare-only, **unapplied**.
- **console_v2 + photo_thread** — live on Wesaya.
- **Wesaya at 14 feature flags** (verified).
- **Test-tenant ceremony complete** — Sweet Shop (4 flags) · KSA Dry-Run (2 flags).

---

## Phase 1.5 — Wesaya Data Readiness · 🟠 OPEN (critical path)

The gate between "built" and "sells". Two-axis ingredients data for **all 47 items**,
each **verify-stamped by a human** in the W2 editor, and the **allergy-hint test must
pass** afterwards. **WO-W4 ingredients-import** (chambered) converts the work from
*typing* to *verifying* — bulk-scaffolds unverified drafts a human then confirms; it can
never write verified state.

---

## Live Verification (continuous)

The founder runs a **six-test script** on Wesaya's real number — pins in/out, photo,
allergy pair, delivery run. Live findings are triaged by the PM into fix lanes:

- **Complete:** the **LIVE-2** and **LIVE-3** batches.
- **Chambered:** F1 `reply_context` · F3 `hold_ack` · storefront OG branding ·
  **WO-GRAPH-VERSION-LIVE** (messaging Graph `v19.0` expired → `v25.0`; in flight at the
  Payments window) · invite-route robustness.

---

## Phase 2 — Launch Audits

- **AUDIT-1** — workflows.
- **AUDIT-2** — routes / UI. *Pre-logged:* the old green login; **CUTOVER-2** (#350)
  folds in; UI-1/UI-2 findings fixed via **#423**.
- **AUDIT-3** — delivery topology.
- **A9** — key rotation.
- **A7 / A8** — ops readiness.
- **Founder human audit** — last.

---

## Phase 3 — Wesaya Sells

**Launch gates (all required):**

1. Ingredients verified (Phase 1.5).
2. Allergy-hint test passes.
3. Six live tests green.
4. Phase-2 blockers cleared.
5. Fares ops items — WABA payment method · icon · ownership.
6. Customer announcement.

**Status:** Wesaya is **pre-launch by the owner's out-loud word** (11 Jul). Full
production caution **re-engages the moment he announces live**.

---

## Track M — External-merchant gate (parallel; does NOT gate Wesaya)

kivometa business verification submitted → Mohamed's Vercel signup env fill-in →
Meta-side webhook/config on the signup app → **App Review** (advanced access:
`whatsapp_business_messaging` + management; assets: privacy URL ✅ live, icon TODO Fares,
ES screencast TODO) → **Access Verification** (10/wk → 200/wk) → first external merchant.

---

## Track B — Khalid voice/dialect (parallel; gates KSA)

R1 + R3 reviewer gate → **Step-6 rebuild** → **Moyasar ceremony** before any real KSA
money.
