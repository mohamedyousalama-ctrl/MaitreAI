# Kivo — Master Roadmap

> **Restaurant Direct Commerce OS**  
> We turn restaurants' own WhatsApp, QR, Instagram, and loyal customers into
> direct orders — then manage delivery, tracking, and repeat sales without giving
> away margin on every order.

**Production domain:** getkivo.io  
**First milestone:** Launch Wesaya Fried Chicken with V1 Kivo  
**Current maturity:** Pre-pilot — real backend and agent infrastructure; not yet commercially proven

> **North star:** see [`docs/KIVO_UPGRADED_CONCEPT_ROADMAP.md`](docs/KIVO_UPGRADED_CONCEPT_ROADMAP.md) (adopted 2 Jul 2026). **KSA plan:** [`docs/KIVO_SAUDIZATION_ROADMAP.md`](docs/KIVO_SAUDIZATION_ROADMAP.md).

---

## Strategic direction

### The problem

Restaurants depend on delivery platforms (Talabat, HungerStation, etc.) for demand, ordering UX, and delivery. In exchange, they lose:

- Margin (commissions)
- Customer ownership and data
- Control over ranking, promotions, and the delivery experience

The biggest hidden problem is **customer ownership leakage**: when an order comes through a platform, the platform owns the customer relationship, the reorder habit, and the data.

### The insight

Delivery apps are not enemies — they are useful for new customer acquisition. The stronger strategy:

```
Delivery apps = customer acquisition channel
Kivo          = customer ownership + repeat order + direct delivery control layer
```

Position: _"Use platforms to get discovered. Use Kivo to keep your customers forever."_

### The product definition

```
A direct-order + delivery operating system for restaurants.

Kivo turns the restaurant's own WhatsApp, website, QR, Instagram, phone leads,
Google Maps links, and loyal customer base into a delivery-app-quality ordering
experience — with AI order handling, menu truth, dispatch, driver tracking,
and customer retention intelligence.
```

**Category name:** Restaurant Direct Commerce OS

---

## Current product maturity

```
IDEA → DEMO UI → REAL SERVER CORE → PRE-PILOT PRODUCT → SELLABLE OS
                                          ▲
                                     Kivo now
```

| Dimension | Score |
|---|---|
| Agent safety core | ████████░░ 8/10 |
| Order engine | ███████░░░ 7/10 |
| Multi-tenant foundation | ███████░░░ 7/10 |
| Operator console | ███████░░░ 7/10 |
| WhatsApp live readiness | █████░░░░░ 5/10 |
| Self-serve onboarding | █████░░░░░ 5/10 |
| Delivery / dispatch | ████░░░░░░ 4/10 |
| Direct-order growth layer | ██░░░░░░░░ 2/10 |
| Billing / commercial model | ██░░░░░░░░ 2/10 |
| Driver network | ░░░░░░░░░░ 0/10 |

---

## What is real vs mocked vs behind flag

### Real now ✅
- WhatsApp Cloud API webhook (receive + send, per-tenant, signature-verified)
- AI ordering agent (Karim) — Claude claude-sonnet-4-6, tool-grounded, money guard, output guard
- Deterministic allergen safety gate (code gate, not model luck)
- Allergen symptom detection v4 (merged, flag OFF pending human review)
- Human takeover + ownership state machine (AI_ACTIVE/HUMAN_ACTIVE/SYSTEM_HOLD/CLOSED)
- COD cash ledger + driver settlement (manager-gated)
- Order engine (cart → confirm → persist, reorder dedup, double-tap guard)
- Delivery dispatch + driver token + customer tracking (flag-gated OFF)
- Operator console — 7 pages wired to real per-tenant data
- Self-serve onboarding backend (WhatsApp Embedded Signup, menu ingestion, go-live gate)
- Security hardening: webhook signature, cross-tenant guard, per-tenant agent scope, deterministic tenant resolution
- CI eval gate: tsc + build + 101 unit tests

### Behind feature flags 🚩
- `allergen_symptom_detection` — symptom/euphemism detection (per-tenant, default OFF)
- `deterministic_allergen_safety` — allergen gate (per-tenant, default OFF)
- `ENABLE_DELIVERY_TRACKING` — delivery dispatch module (env var, default OFF)
- `handoff_timeout` — auto-return from human takeover after idle period (per-tenant, default OFF)

### Incomplete / not yet shipped ⚠️
- Meta Embedded Signup frontend (backend done; SDK init incomplete)
- `escalation_timeout_minutes` column + API + stuck-detection wiring (deferred, spine-risk)
- `/api/settings/plan` tier endpoint (not built)
- Billing / subscription model (not defined)
- Delivery dispatch UI polish (foundation behind flag)
- Commission savings dashboard
- Customer retention / CRM / promotions engine

---

## Phase roadmap

### Phase 0 — Foundation ✅ mostly done

App shell · RTL Arabic UI · Supabase migrations · tenant model · agent core · order engine · allergen safety · COD · WhatsApp webhook · Kivo brand · security hardening

Remaining cleanup: docs update (this pass) · test runner · font build fix · legal pages

---

### Phase 1 — Sellable WhatsApp Ordering ← current priority

**Goal:** A restaurant can self-onboard, connect its own WhatsApp number, load its menu and hours, and Karim takes real orders safely.

**V1 promise:**
> Connect your restaurant WhatsApp. Karim receives orders, respects your menu and prices, escalates allergies, creates orders, and lets your team operate from Kivo.

**V1 exit gate:**
```
New restaurant owner signs in
  → creates restaurant
  → connects own WhatsApp (Embedded Signup)
  → adds menu / hours / zones / persona
  → goes live (server-side readiness gate)
  → sends real WhatsApp test message
  → Karim replies from that restaurant's own number
  → order appears in Kivo console
  → operator can take over and release
```

**What V1 must include:**
- Working Meta Embedded Signup (frontend completion is the #1 blocker)
- Public legal pages ✅ (this pass)
- Tenant provisioning ✅
- Menu onboarding ✅
- Hours/zones/persona setup ✅
- Safe WhatsApp customer-turn engine ✅
- Order creation ✅
- Human takeover/release ✅
- Allergy safety hold ✅
- Money/pricing truth ✅
- Basic COD ✅
- Operator console ✅
- Wesaya V1 launch checklist ✅ (this pass)

**Remaining blocker:** Meta Tech Provider setup (env vars + App Review for `whatsapp_business_management`). See `docs/META_SETUP_GUIDE.md`.

---

### Phase 1.5 — Direct Order Conversion Engine

**Goal:** Move loyal customers from platform dependency into restaurant-owned direct orders.

**V1.5 promise:** _"Turn your own customers into direct orders."_

Modules:
- WhatsApp order link / QR menu / Instagram bio link / Google Maps order link
- Mobile web menu + one-tap reorder
- Exclusive direct-only offers
- Commission savings dashboard
- Direct vs platform order split analytics

This is where restaurants stop seeing Kivo as "nice chatbot" and start seeing it as a margin-recovery system.

---

### Phase 2 — Restaurant-Owned Delivery Control

**Goal:** Let restaurants use their own drivers with a delivery-app-like tracking experience.

**V2 promise:** _"Manage your own delivery like a delivery platform."_

Build order:
- V2.1: Driver roster + assign order + driver link + status updates + COD capture
- V2.2: Customer tracking link + order status timeline + ETA + support button
- V2.3: Operator dispatch board + driver load + active map + manual reassignment
- V2.4: Cash reconciliation + expected/collected per driver + settlement audit

Foundation exists behind `ENABLE_DELIVERY_TRACKING` flag. Polish and field-test needed before commercial promise.

**Rule:** Phase 1 = restaurant's own drivers only. No shared driver network until Phase 5.

---

### Phase 3 — Retention + Promotion Intelligence

**Goal:** Kivo becomes the restaurant's repeat-sales engine.

**V3 promise:** _"Know who buys, why they buy, and what offer brings them back."_

Modules:
- Customer memory (repeat detection, preferences, VIP/at-risk/new)
- Promotion engine (direct-only offers, win-back, bundles, time-limited)
- Insights (item performance, conversation outcomes, lost orders, platform leakage estimate)

---

### Phase 4 — Multi-Channel Direct Commerce

**Goal:** Kivo handles restaurant-owned orders from more than WhatsApp.

Channels: web ordering · Instagram DM · Messenger · Google order link · QR menu

Do not overbuild before V1/V1.5 are proven.

---

### Phase 5 — Partner Driver Network

Evolution:
```
Restaurant own drivers
  → Invited external drivers
  → Shared driver pool by zone
  → Kivo-managed dispatch marketplace
  → Restaurant-first delivery network
```

Correct business sequence: Software first. Density second. Driver liquidity third. Network fourth. Do not build the driver marketplace before restaurant density exists.

---

### Phase 6 — Restaurant Direct Commerce OS

**Advanced vision:** Ordering + delivery + customer ownership + retention + intelligence in one operating system for restaurant-owned revenue.

```
Strongest long-term message:
Kivo is the Restaurant Direct Commerce OS — ordering, delivery control,
customer ownership, retention, and intelligence in one system.
```

---

## Wesaya V1 — First milestone

**Milestone name:** Launch Wesaya Fried Chicken with V1 Kivo

**Purpose:** Prove that Kivo can operate a real restaurant-owned WhatsApp ordering flow safely. This is the first real proof point of the company.

**Current status (2 Jul 2026) — Phase 0 (Wesaya live & stable) in progress.** Per the [north-star roadmap](docs/KIVO_UPGRADED_CONCEPT_ROADMAP.md), Phase 0 is the gate for everything downstream.

Merged and in production:
- S-series / T-series sprints, cutover P1 (WB1/WB2/WB3), allergen foundation (#271–#273), console audit + WB-FIX (#274), **DRYRUN-1 tester allowlist (#275, migration 0057 applied to prod)**, **DRYRUN-2 tenant-creds on all 5 console-initiated send sites (#276)** — all merged.
- A3.1 allergy hard-test: **211/211 passing**.
- Wesaya data loaded: **47 menu items priced**, **25 delivery zones**.
- Migrations **0051–0057** applied in prod.

Remaining Phase-0 items before "live & stable" is reached:
- Bahaa full rehearsal (console operator + WhatsApp customer + driver/dispatch) — **Meta test number pending**.
- Real-number cutover from Be-On.
- 2–4 weeks of real live order volume.

**V1 acceptance criteria:**

```
Technical
├─ Production build passes (getkivo.io)
├─ Wesaya tenant configured in Supabase
├─ Wesaya menu/items/prices loaded and verified
├─ Hours/zones/persona configured
├─ WhatsApp webhook verified
├─ Inbound message → conversation → Karim reply → WhatsApp
├─ Order persists in DB
├─ Operator console shows order and conversation
├─ Human takeover works; return-to-AI works
├─ Allergen gate escalates and blocks unsafe confirmation
├─ Money guard prevents invented prices
└─ No cross-tenant data leakage

Operational
├─ Wesaya staff know where to see orders
├─ Staff know when to take over
├─ Staff know how to handle allergy escalations
└─ Support fallback exists if Karim fails

Business
├─ First 10 real orders completed safely
├─ First 50 real conversations reviewed
└─ Top failure modes documented and adjusted
```

Full checklist: `docs/WESAYA_V1_LAUNCH_CHECKLIST.md`

---

## What NOT to build now

```
❌ Broad driver marketplace
❌ Complex route optimization
❌ Multiple countries at once
❌ Heavy loyalty/CRM automation before V1 is stable
❌ Advanced campaign automation
❌ Complex billing system from day one
❌ All channels at once
❌ AI admin chat expansion before V1 core is stable
```

The near-term product must stay narrow:

> **Real WhatsApp ordering + safe order creation + operator control + Wesaya launch.**

---

## Safety principles (non-negotiable)

1. **Allergen gate is deterministic** — a code gate, not model luck. Never weaken.
2. **Money is DB-only** — totals come from the order engine. AI never invents prices.
3. **Human takeover is real** — when a human owns a conversation, AI stays out.
4. **Safety holds require deliberate human release** — structural, never auto-return.
5. **Multi-tenant isolation** — restaurant_id scoped on every business object. No cross-tenant leakage.
6. **No fake claims** — docs, UI, and metrics reflect the real state. Never overstate.

---

## Key identifiers

| Item | Value |
|---|---|
| Repo | `mohamedyousalama-ctrl/MaitreAI` |
| Supabase ref | `zlighrbsjexrozrmuwpw` |
| Production domain | `getkivo.io` |
| Wesaya tenant | `5acbc72f-def3-46cd-ad6c-bf0ff4a23642` |
| Sweet Shop (demo) tenant | `9244d8ef-66b1-417a-a012-41a389ab1abf` |
| demo-pro tenant | `0de3c0de-0001-4a00-8a00-000000000001` |

---

*Kivo gives your restaurant its own delivery-app experience, inside your own WhatsApp and direct channels.*
