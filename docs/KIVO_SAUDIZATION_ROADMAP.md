# Kivo — Saudization Roadmap (KSA Market Activation)
**Version 1.0 · 30 Jun 2026 · grounded in a full read of the live repo (github.com/mohamedyousalama-ctrl/MaitreAI) + the master roadmap**

---

## 0. The headline finding (why this is activation, not a port)

**Kivo was originally architected Saudi-first, then re-pointed to Egypt for the Wesaya pilot.** The evidence in the live code:

- `supabase/migrations/0001_init.sql` — schema **defaults** were `currency='ر.س'`, `country='SA'`, `dialect='saudi'`, `timezone` Riyadh.
- `lib/ai/dialect.ts` — the **saudi** dialect profile is fully written (greeting «هلا فيك، وش تحب تطلب اليوم؟», order-confirm, escalation, closed, unavailable, no-offers), with `currencyDefault: "ر.س"`, `digitStyle: "western"` (KSA uses Western digits; Egypt Arabic-Indic). `dialectProfile()` even **falls back to saudi**.
- `lib/messaging/phone.ts` — `COUNTRY_DIAL` already has `SA: { cc:"966", nationalLen:9, mobilePrefix:"5" }` ("05XXXXXXXX → 9665XXXXXXXX"). Multi-country by design ("add a market by appending one row").
- `lib/payments.ts` — payment method labels are **mada / آبل باي / بطاقة ائتمانية** — Saudi rails, not Egyptian (currently a **mock**, "no real provider").
- `app/api/onboarding/provision-tenant/route.ts` — **defaults to `Asia/Riyadh`, `ر.س`, `SA`** and accepts a `dialect` param. The Saudi provisioning path already exists.
- Then `0013_egypt_first.sql` re-pointed new-tenant defaults to `egyptian` / `ج.م` (EGP) for the pilot. `0014_tax_vat.sql` added VAT-ready columns (`tax_mode`, `tax_rate`, `tax_registration_no`, per-order tax snapshot).

**Implication:** Saudization is ~60% *reactivation + completion of an existing layer* and ~40% *genuinely new KSA-specific work* (a real payment provider + ZATCA e-invoicing). This plan separates the two honestly.

---

## 1. Scope & principle

Serve a **new Saudi restaurant** as a tenant on the same multi-tenant Kivo deployment (same console, same codebase — like Wesaya, data filtered by tenant). No fork. The Saudi tenant runs alongside Egyptian tenants; per-tenant `country/dialect/currency/timezone/tax` already isolate behavior.

**Standing principles carried from the master roadmap:** propose→approve→apply on all DB; migrations PREPARE-ONLY then applied after review; the allergen safety gate is universal (not country-specific) and must remain intact; every merge reviewed against live code + bot reviews; input-control/validation on every build.

---

## 2. What ALREADY works for KSA (verified in code — reactivate, don't build)

| Capability | State in repo | Saudization action |
|---|---|---|
| Saudi dialect (Karim voice) | `dialect.ts` saudi profile complete | Set tenant `dialect='saudi'` — done at provisioning |
| Saudi currency ر.س | schema + profile support it | Set tenant `currency='ر.س'` |
| Western digit style (KSA) | `digitStyle:"western"` in profile | Automatic once dialect=saudi |
| Saudi phone normalization (+966, 05→9665) | `COUNTRY_DIAL.SA` present + tested | Automatic once `country='SA'` |
| Riyadh timezone | onboarding default `Asia/Riyadh` | Automatic |
| VAT-ready order math + receipt | `0014_tax_vat.sql` (tax_mode/rate/reg_no + per-order snapshot) | Set `tax_mode='added'`, `tax_rate=15` (KSA VAT) |
| Payment method labels mada/ApplePay/card | `payments.ts` | Labels ready — provider is the gap (§3) |
| Tenant provisioning w/ country/dialect/currency | `provision-tenant` route | Use it to create the Saudi tenant |
| Multi-tenant isolation, console, orders, COD, menu, allergen gate | live | Tenant-scoped — works as-is |

**This means a Saudi tenant can be provisioned and Karim will speak Saudi, quote ر.س, normalize +966 numbers, and apply 15% VAT — using code that already exists.** The gaps below are what's genuinely missing for a *complete* KSA product.

---

## 3. What is GENUINELY MISSING for KSA (real new work)

### SAUD-1 — Real payment provider (mada / Apple Pay / cards) 🔴 HIGH
Today payments are a **mock** (`lib/payments.ts` "no real provider"; mock route inert in prod). KSA expects **mada** (the national debit scheme), Apple Pay, and cards. Options: Moyasar, HyperPay, Tap, or PayTabs (all support mada+ApplePay in KSA). 
- Build: provider adapter behind the existing `payment_sessions` model + a signed provider webhook (the mock route already notes "a real provider + signed webhooks arrive in a later sprint"). Flag-gated per tenant; fail-closed.
- Dependency: merchant account with the chosen PSP (business/legal, restaurant-side).

### SAUD-2 — ZATCA e-invoicing (Fatoora / Phase 2) 🔴 HIGH (regulatory)
**Not present anywhere in the code** (confirmed — grep clean). KSA mandates ZATCA e-invoicing: Phase-1 "simplified tax invoice" needs a **QR code** (TLV-encoded: seller name, VAT reg no, timestamp, total, VAT total); Phase-2 adds XML + cryptographic stamp + clearance/reporting to ZATCA's platform for B2B.
- V1-KSA (most restaurants, B2C): generate a compliant **simplified tax invoice with the ZATCA QR** on each receipt. Uses the VAT data `0014` already captures.
- V2-KSA: Phase-2 integration (XML, CSID/cryptographic stamp, ZATCA API clearance) — larger, needs a ZATCA-onboarded solution/cert. Defer unless the target restaurant is B2B-heavy.

### SAUD-3 — Arabic quality for the Saudi register 🟠 MED
Karim's saudi profile exists, but a Saudi-market pass: menu/UI Arabic that reads native to KSA (not Egyptian phrasing), address model for Saudi (district/حي, city, National Address / short-address optional), and Saudi delivery-zone conventions.

### SAUD-4 — Saudi delivery/logistics norms 🟠 MED
Zone model is generic (name+fee+min+eta — works). Saudi-specific: common KSA aggregator context (HungerStation/Jahez/ToYou/Mrsool) for the margin-recovery positioning; optional integration later. V1: manual zones like Wesaya.

### SAUD-5 — WhatsApp / Meta for a KSA number 🟠 (same mechanics as EG)
Same Cloud API path; a Saudi business number + WABA. No code difference — `COUNTRY_DIAL.SA` already handles the format. Business verification is KSA-side.

---

## 4. The Saudization phases (dependency order)

### PHASE KSA-0 — Reactivation & tenant provisioning 🟢 (low effort, mostly config)
1. Provision the Saudi tenant via `provision-tenant` (dialect=saudi, currency=ر.س, country=SA, timezone=Asia/Riyadh) — propose→approve.
2. Set VAT: `tax_mode='added'`, `tax_rate=15.00`, `tax_registration_no=<restaurant VAT no>`.
3. Verify (Sweet-Shop-style dry-run tenant first): Karim speaks Saudi, quotes ر.س with Western digits, normalizes a +966/05 number, VAT line appears on totals/receipt.
4. Load the Saudi restaurant's menu + zones (same structured-load discipline as Wesaya).
**Exit:** a working Saudi tenant end-to-end EXCEPT real payments + ZATCA invoice.

### PHASE KSA-1 — ZATCA simplified invoice + QR 🔴 (regulatory gate for real operation)
- Build a ZATCA-compliant simplified tax-invoice generator (TLV QR from the VAT data already captured) on the receipt/order.
- Investigate-first sprint (like the allergen work): map the current receipt/order-total path, propose the invoice+QR design, then build. PREPARE-ONLY migration if any invoice-number/sequence column is needed.
**Exit:** every Saudi order produces a compliant simplified tax invoice with QR.

### PHASE KSA-2 — Real payment provider 🔴
- Choose PSP (mada+ApplePay+card). Build adapter + signed webhook behind `payment_sessions`; per-tenant flag; fail-closed; test on dry-run tenant.
**Exit:** Saudi customers pay by mada/ApplePay/card; COD still available.

### PHASE KSA-3 — Saudi Arabic & UX polish 🟠
- Native KSA Arabic pass (menu/UI/Karim edge phrases), Saudi address model, digit/currency formatting audit.
**Exit:** reads native to a Saudi user.

### PHASE KSA-4 — WhatsApp go-live (KSA number) 🟠
- Saudi WABA + number, Meta verification, same allowlist→dry-run→public cutover pattern as Wesaya (Project Dry-Run reused).
**Exit:** Karim live on the Saudi number.

### PHASE KSA-5 (V2) — ZATCA Phase-2 + aggregator integrations 🔵 DEFERRED
- Full ZATCA Phase-2 (XML, cryptographic stamp, clearance) if B2B. Aggregator/Foodics-style integrations for margin positioning.

---

## 5. Sequence & gates

1. KSA-0 reactivation (config + dry-run tenant) — do first, proves the existing layer.
2. KSA-1 ZATCA simplified invoice — regulatory gate before real KSA operation.
3. KSA-2 real payments — parallel with KSA-1 (independent).
4. KSA-3 Arabic/UX polish — parallel.
5. KSA-4 WhatsApp go-live — after 0–3, reuse Project Dry-Run (allowlist → tester → public) + the A3.1 allergen hard-test MUST pass for the Saudi tenant before agent_mode→live.
6. KSA-5 deferred to V2.

**Universal safety carries over:** the deterministic allergen gate is country-agnostic and applies to the Saudi tenant unchanged; A3.1 hard-test is a per-launch gate.

## 6. Honest dependencies (not code)
- PSP merchant account (restaurant/legal) → gates KSA-2.
- ZATCA VAT registration + (Phase-2) ZATCA onboarding/cert → gates KSA-1/KSA-5.
- Saudi WhatsApp business number + Meta verification → gates KSA-4.
- The target Saudi restaurant's real menu, zones, VAT number, policies → content, tenant-side.

---

## Amendment (2 Jul, post-vision)

POS boundary locked — Kivo emits ONE canonical structured order; all downstream = adapters (T1 manual handoff control layer [built], T2 API inject, T3 printed ticket + order webhook). Foodics API inject is pulled EARLIER for the KSA client (Foodics dominates KSA and has a real API — makes "send to any system" literally true there). Dispatch coordination stays owned; fleet/logistics operations never. The first Saudi client launches on the same multi-tenant core + this plan; vision layers (outcomes table, insights, modules) are built once on the core, never forked per client.
