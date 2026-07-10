# KIVO DELIVERY MODULE — BUILD SPEC v1 (C1; approved by Mohamed)

> **Owner:** PM + Engineering · **Status:** Active · **Last reviewed:** 2026-07-10

The last big V1 build. Converged design (3 brainstorms + audit) + Mohamed's notes 1/3/9 (branch routing).
Principle: Kivo runs the restaurant's OWN delivery — never marketplace machinery.

═══════════════════════════════════════════
## 0. WHAT ALREADY EXISTS (build ON it, never parallel to it)
═══════════════════════════════════════════
delivery_zones (named zones + fees) · drivers + CRUD · deliveries + assign (one-driver-one-delivery)
· /d/<token> driver page (WhatsApp'd link, token = auth, status chain pending→assigned→picked_up→on_the_way→delivered/failed/cancelled, COD fail-closed)
· driver GPS while page open · /t/<token> customer tracking · live التوصيل console section.
The gaps: zones have no GEOGRAPHY (name+fee only, no map), drivers can't carry MULTIPLE orders, and nothing routes an order to a BRANCH.

═══════════════════════════════════════════
## 1. ZONES GET GEOGRAPHY (Mohamed note 3)
═══════════════════════════════════════════
- Each zone gains: center point + RADIUS (km) — radius-first V1; polygons = V2.
- Each zone belongs to a BRANCH (per-branch zones; single-branch tenants auto-assign all to the one branch).
- ONE reusable bottom-sheet map editor (Arabic-first RTL, dark console_v2 language): drop/drag center pin, drag radius, name + fee + ETA-promise + branch. Mounted in BOTH Onboarding (التشغيل step) and Settings→التوصيل. Same component, one implementation.
- Customer location: WhatsApp location pin (the natural gesture). Karim asks for the pin at delivery-order time («ابعت موقعك من المشبك 📎»); text-address fallback = zone by name match or ask.

═══════════════════════════════════════════
## 2. BRANCH ROUTING (Mohamed notes 1 + 9 — one number, many branches)
═══════════════════════════════════════════
- DELIVERY order: pin → matching zone → THAT zone's branch gets the order (its ticket printer, its fee, its ETA). Overlapping zones → nearest branch by straight-line distance (ratified tie-break).
- PICKUP order: no pin needed — agent asks «أي فرع أقرب لك؟» and lists branches (with area names).
- OUTSIDE ALL ZONES (soft handling, V1): honest message «للأسف موقعك خارج نطاق التوصيل حالياً 🙏 تقدر تستلم من أقرب فرع؟» + offer pickup + log the miss (misses feed zone-expansion insights later).
- Orders carry branch_id end-to-end: ticket, console filters, outcomes.

═══════════════════════════════════════════
## 3. MULTI-ORDER DRIVERS (delivery_runs)
═══════════════════════════════════════════
- New delivery_runs: a driver carries up to 3 deliveries per run (cap enforced; configurable later).
- Existing per-delivery rows + tokens PRESERVED underneath — a run is a grouping, not a rewrite.
- Assignment: MANUAL by operator (V1 truth: the restaurant knows its drivers) + KIVO SUGGESTS (same-zone/adjacent grouping, oldest-first) — suggestion is a tap-to-accept, never auto-assign.
- Driver page /d upgrades to a STOP LIST: ordered stops, per-stop customer name/area/items-count/COD amount, tap-to-navigate (native maps handoff — geo: URL), tap-to-advance status per stop.
- ★ SAFETY LAW: allergen/health notes NEVER on the driver glance view — kitchen-ticket only. Driver sees logistics, not medical data.
- COD: per-stop «حصّل X» display + mark-collected (basic); full reconciliation ledger = V1.1.
- Customer tracking /t: shows ACTIVE-LEG only (driver location only while their stop is the current one) — no exposing the whole route or other customers. No background GPS (page-open only, as today).

═══════════════════════════════════════════
## 4. CONSOLE (التوصيل section upgrades)
═══════════════════════════════════════════
- Runs board: active runs (driver, stops, statuses), unassigned deliveries queue (oldest flagged), suggest-grouping button.
- Zone misses surface (outside-area attempts) — plain count + areas, feeds expansion decisions.
- Everything Arabic-first, facts-plain, red = safety only (late/failed = amber).

═══════════════════════════════════════════
## 5. DATA (staged, prepare-only migrations, PM reserves numbers)
═══════════════════════════════════════════
- zones: + center_lat/lng, radius_km, branch_id, eta_minutes
- branches: exists? if not: minimal branches table (name, location, printer routing hook) — verify in code first
- delivery_runs: id, driver_id, status, created; deliveries gain run_id + stop_order (nullable — single-delivery flows unchanged)
- zone_misses: pin/area + timestamp + conversation ref (insight feed)
- DEFERRED to V1.1: driver_shifts, COD ledger, polygons, auto-assignment.

═══════════════════════════════════════════
## 6. BUILD SEQUENCE (3 WOs, sequential)
═══════════════════════════════════════════
W-D1 GEOGRAPHY+ROUTING: zone schema + bottom-sheet editor (both mounts) + pin matching + branch routing + outside-area soft flow + zone_misses. (Agent conversation changes flag-gated delivery_geo_routing default OFF.)
W-D2 RUNS: delivery_runs + cap + manual assign + suggest + driver stop-list page + active-leg tracking + COD basic. (Flag delivery_runs default OFF.)
W-D3 CONSOLE: runs board + misses surface + polish + end-to-end proof on the dev tenant (Sweet Shop), screenshots.
Laws throughout: flag-off byte-identical (Wesaya untouched until Mohamed flips) · propose→approve migrations · red-first proofs per WO · money engine-computed · allergen-never-on-driver · PM verify + bots-green each merge.

═══════════════════════════════════════════
## STEP-1 DELTAS (recorded by WO-DELIVERY-D1 investigation — reflects code reality as of 2026-07-10)
═══════════════════════════════════════════
Read-only investigation of the current codebase, appended so this doc reflects reality. Where the spec's §5 assumptions ("verify in code first") differ from what exists, the code wins and §5 is amended here.

**§5 "branches: exists?" → YES, branches already exist (no new table).**
`public.branches` has existed since the first migration — `supabase/migrations/0001_init.sql:60-74`: `id, restaurant_id (FK→restaurants), name, address, lat, lng, phone, hours jsonb, notes, active, created_at, updated_at`. The data model is already one-restaurant→many-branches (`branches_restaurant_idx` on `restaurant_id`, FK cascade), with full UI (`app/(main)/branches/page.tsx`), store (`lib/store.ts`), DB helpers (`lib/db/brain.ts`), and AI `branch_question` intent (`lib/ai/engine.ts:123`). The "printer routing hook" the spec wanted lives on the order path: the kitchen ticket + receipt already render the branch name (`lib/render/receipt.ts:237`, `components/print/KitchenTicketView.tsx:156`). **W-D1 adds no branches table.**

**§5 "zones: + center_lat/lng, radius_km, branch_id, eta_minutes" → branch_id + eta_minutes ALREADY EXIST.**
`delivery_zones` — `supabase/migrations/0001_init.sql:128-141`: already has `branch_id uuid references branches(id)` and `eta_minutes int` (plus `fee`, `min_order`, `name`, `active`). It also already has an **unused `polygon jsonb`** column (never selected/mapped in app code) — the natural V2 home for polygons; left untouched. **Migration 0081 therefore only ADDs `center_lat`, `center_lng` (double precision) + `radius_km` (numeric) to `delivery_zones`, plus the new `zone_misses` table.**

**Orders already carry branch_id, zone_id, and lat/lng.**
`orders.branch_id` (`0001_init.sql:295`, FK→branches), `orders.zone_id` (`:310`, FK→delivery_zones), and `orders.lat/lng` (`supabase/migrations/0043_orders_coords.sql:21-22`, double precision, nullable) all exist today. `branch_id` is currently DERIVED from the chosen zone at order creation (`lib/db/orders-create.ts:109`). `orders.lat/lng` are populated only by the web storefront's LocationPicker (`app/api/storefront/orders/route.ts:129`); the WhatsApp path leaves them null. Branch already rides the order end-to-end (ticket/receipt/conversation_reports.branch_id). W-D1's job is to make WhatsApp delivery orders populate lat/lng from the pin and set branch_id from the matched zone correctly.

**Fee is already engine-computed (money law already satisfied).**
`lib/order-pricing.ts:175-188` (`resolveDeliveryZone`) + `:251` compute the delivery fee from `delivery_zones.fee` server-side; the LLM only supplies the zone name. Geo-routing keeps this — the pin selects the zone, the engine still computes the fee.

**The real gap for W-D1 is inbound location + the agent's pin handling.**
WhatsApp `location` messages are silently DROPPED today: `lib/messaging/adapters/whatsapp.ts` — `WaMessage` (`:39-62`) has no `location` field and the normalizer requires text-or-audio (`:198`), so `type:"location"` with `messages[].location.{latitude,longitude,name,address}` never reaches the agent. The prompt explicitly tells the model pins are unreadable (`lib/ai/prompt.ts:437`). W-D1 adds flag-gated location parsing (flag-OFF = pin dropped, byte-identical to today) and flag-gated agent pin handling.

**Flag mechanism (PM-confirmed).**
`delivery_geo_routing` is a per-tenant flag on `restaurants.feature_flags` JSONB (added in `supabase/migrations/0024_restaurant_feature_flags.sql`), read via `isFeatureExplicitlyEnabled("delivery_geo_routing", features)` (`lib/tenant/tier.ts:51`) — the *Explicit* variant so a `pro` tenant does NOT auto-enable it (Wesaya least-privilege law). DEFAULT OFF requires no migration (JSONB default `{}`). Wesaya flip stays Mohamed's to make later.
