# MaitreAI — PRD AMENDMENT 02 (v2): Customer Experience + Promotion Machine

> Status: APPROVED by owner. Extends MAITREAI_PRD_AND_BACKLOG.md + AMENDMENT 01.
> Newest amendment wins on conflict. Claude Code: commit to repo root; treat as
> part of the PRD in all sessions. Part B = customer-facing WhatsApp experience.
> Part C = the Promotion Machine. Part D = cross-app alignment corrections.

---

# PART B — CUSTOMER EXPERIENCE (WhatsApp UI)

## B1. Principle
The customer should almost never need to type. Every step offers a native tap
target (list, button, cart, location share); free text and voice remain fully
understood by the Brain at any moment. The agent must feel like a skilled human
host — dialect-correct, warm, brief.

## B2. TIER 1 — Native interactive messages (Sprint 9, required for launch)
Implement as first-class outbound kinds in the WhatsApp adapter:
`interactive_list`, `reply_buttons`, `image`, `location_request`. Inbound kinds:
`button_reply`, `list_reply`, `location`, `audio`, `order` (cart). Composed by
the Brain via tools.

### B2.1 Interactive list messages
- Category browse: header "منيو {restaurant}", button "اختر القسم 🍔", sections =
  categories, rows = items ("{name}" / "{price} {currency} · {short_desc}").
  Respect the 10-row limit → paginate with "المزيد ⬇️".
- Trigger: broad menu asks ("وش عندكم؟", "عايز أشوف المنيو").

### B2.2 Reply buttons (max 3) — standard sets
- Order confirm: [تأكيد الطلب ✅] [تعديل ✏️] [إلغاء ❌]
- Fulfillment: [توصيل 🛵] [استلام 🏪]
- Payment (per tenant config): [ادفع أونلاين 💳] [كاش عند الاستلام 💵]
- Closed + preorders on: [اطلب لوقت الفتح ⏰] [ذكّرني عند الفتح 🔔]
- Returning customer: [نفس طلبي المعتاد 🔁] [أطلب شي ثاني 📋]
Button taps arrive structured → handled deterministically; Brain handles context.

### B2.3 Dish photos
Item question → dish image (per B4) + caption "{name} — {price} {currency}\n
{description}" + buttons [أضفه لطلبي ➕] [شي ثاني 📋].

### B2.4 Native location request
Delivery flow → location-request message ("شارك موقعك 📍..."). Pin → zone check
(polygon if defined, else zone-name flow) → fee + ETA → attach to draft order.
Typed-address path always remains.

### B2.5 Generated receipt/summary images
Server-side renderer (`lib/render/ticket-image.ts`): branded order summary image
(logo, big order number, items+modifiers, **promo/discount lines + discount
total**, totals, fulfillment, payment) sent at order confirmation and payment
success. RTL, both dialects.

### B2.6 Order tracking presentation
"وين طلبي؟" → emoji progress bar + human line:
`🟢🟢🟢⚪⚪` "طلبك قيد التحضير 👨‍🍳 باقي تقريباً ١٢ دقيقة" (dialect-correct).
Status templates reuse the same bar.

### B2.7 Human-feel mechanics
Mark inbound read; typing indicator; ✅ reaction on the order-completing message.
Tenant-configurable.

### B2.8 Voice notes (MENA-critical)
Inbound audio → dialect-aware transcription → normal Brain turn → reply opens
with confirmation of what was heard ("سمعتك 👌 ..."). Low confidence → ask to
repeat/type; never guess an order.

### B2.9 QR / deep-link context
Support `wa.me/<number>?text=` prefilled payloads ("طاولة ٥", "عرض اليوم",
promo codes per C5.3). Settings generates printable QR variants (table /
storefront / delivery bag / promo).

## B3. TIER 2 — WhatsApp Catalog + native cart (Sprint 9 Part B)
- Sync menu → Meta Commerce Catalog (Graph API): available items with image
  (B4 card fallback guarantees compliance), price, description, retailer_id =
  menu_item id. Sync on item change/availability/menu-sync approval/**active
  promo price changes (C6.4)**. Out-of-stock = hidden.
- Multi-Product Messages: Brain tool `send_product_list(...)` → card carousel →
  native cart → inbound `order` payload → draft order built against live prices
  **server-side (never trust client prices)** → confirm via B2.2 → normal pipeline.
- Gating: build Part B unconditionally; activation waits only on Meta Commerce
  approval. Tier 1 alone is launchable. OWNER ACTION: create Commerce Manager +
  catalog and start review immediately.

## B4. Dish image system & governance (Sprint 10, Menu module)
Per-item `image_kind`: `real` | `illustrative` | `card`; `image_status`:
`approved` | `pending` | `rejected`.
1. **real** — owner photo: (a) mobile-first per-dish camera/gallery upload;
   (b) menu-sync vision auto-crops dish photos found in uploaded menus (owner
   approves); (c) screenshot import (Instagram/delivery apps) vision-matched.
2. **illustrative** — AI-generated/curated stock for the dish type when no real
   photo; badge **"صورة تعبيرية"** burned into the image; owner approval
   mandatory; never auto-published.
3. **card** — auto-generated branded text card (logo/color, Arabic name, price);
   zero-effort fallback; satisfies catalog image requirement.
Governance: vision check (is food? matches name?), quality gate (resolution/
blur/brightness), square-crop + compression, Arabic rejection messages. Menu
page shows badges (✅ حقيقية / 🎨 تعبيرية / 📄 بطاقة); Brain score rewards real
photos. Display priority: real → illustrative → card.

## B5. Session-linked web menu (Sprint 11)
Agent button "📲 تصفح المنيو كامل" → mobile web menu (existing design system)
bound to the conversation via signed token (60-min expiry, no login). Cart →
"أرسل الطلب" → lands back in the SAME WhatsApp chat as a draft order → B2.2
confirm. Active promos display and apply (C6.1).

---

# PART C — THE PROMOTION MACHINE (AI-managed, nothing fixed)

## C1. Principle
Promotions are created, targeted, governed, distributed, and analyzed through
the Brain. Structured controls exist as guides and guardrails; every creation
path accepts a plain sentence. The customer agent always applies the single
best eligible offer automatically and transparently.

## C2. Promotion types (full industry set)
`percent_off` (order | category | item) · `amount_off` · `combo` (bundle price)
· `bogo` / buy-X-get-Y · `free_item_over_threshold` · `free_delivery` ·
`first_order` (acquisition) · `promo_code` (shareable code, attachable to any
type) · `happy_hour` (time-window pricing).

## C3. Smart targeting — AI segments
Built-in computed segments (refreshed continuously from CRM data):
`new` (0 orders) · `active` · `lapsed` (no order in N days — configurable,
default 30; the winback segment) · `vip` (top spend decile) · `item_affinity`
(ordered item/category ≥ N times) · `zone` (delivery areas) · `aov_band` ·
`all`.
**Custom NL segments:** owner writes a sentence — "العملاء اللي ما طلبوا من شهر
وكانوا يحبون البرجر" → Brain compiles to a structured filter, shows matching
customer COUNT + sample, owner confirms. Stored as reusable named segments.

## C4. Controls (timing, caps, budgets, stacking, guardrails)
- **Schedule:** start/end datetime, days-of-week, time windows (happy hour),
  Hijri/Ramadan-aware phrases resolved at creation (per base PRD).
- **Caps:** total redemptions, per-customer limit, per-day cap.
- **Budget cap:** maximum total discount spend; promo AUTO-PAUSES at cap and
  notifies the manager.
- **Eligibility:** min order value, branches, fulfillment types, channels,
  first-order-only flag, segment(s).
- **Stacking:** each promo is `exclusive` (default) or `stackable`; evaluation
  is **best-deal-wins** — the engine computes every eligible promo against the
  cart server-side and applies the single best (or best stackable set), never
  accidental double discounts. Promo codes override auto-selection if valid.
- **Margin guardrail:** at creation, Brain estimates discount depth; warns on
  aggressive promos (>40% effective or below item cost when cost data exists);
  manager must explicitly confirm past a warning.

## C5. Distribution
### C5.1 In-conversation auto-apply (Sprint 8 simple → Sprint 11 full)
Agent tool `get_applicable_promotions(customer, cart)` → engine returns best
deal → agent applies and explains naturally: "عندك عرض يخصك 🎉 خصم ١٥٪ لأنك ما
زرتنا من فترة". Discount lines appear in the confirm summary, receipt image,
and printed ticket.
### C5.2 Outbound WhatsApp campaigns (Sprint 11)
Campaign = promotion + segment + approved **marketing template** + schedule.
Compliance (hard rules):
- Send marketing ONLY to customers with stored opt-in consent
  (`marketing_opt_in`, captured with source + timestamp; the agent asks once,
  naturally, after a completed order — never during).
- Instant opt-out: "إيقاف" (and variants) → `opted_out_at` set, confirmation
  sent, excluded forever unless re-opted.
- **Frequency cap:** max 1 marketing message per customer per 7 days (tenant
  can lengthen, never shorten below 7).
- Sends scheduled within the restaurant's OPEN hours only (alignment with
  Amendment 01 A4).
- Campaign states: draft → scheduled → sending → done, with per-send delivery/
  read stats.
### C5.3 Promo links & QR
Each promo can issue a `wa.me` deep link / QR (B2.9) that pre-loads its code
into the conversation context.
### C5.4 Catalog sync
Active price-affecting promos sync to catalog prices (B3) and revert on end.

## C6. Lifecycle, analytics, and the AI Advisor
- **Lifecycle:** draft → scheduled → active → paused (manual or budget/cap) →
  ended → archived. Fully automatic transitions.
- **Analytics per promotion/campaign:** redemptions, attributed revenue,
  discount cost, ROI, orders uplift vs baseline, new-vs-returning split,
  segment conversion. Surfaced on the Promotions page + dashboard tile.
- **AI Promotion Advisor (Sprint 11):** weekly (and on-demand "اقترح لي عرض"),
  the Brain analyzes order patterns and proposes 1–3 campaigns with reasoning +
  predicted impact ("الثلاثاء أضعف يوم بـ٤٠٪ — هابي آور ٣-٦ على المشروبات،
  متوقع +١٢ طلب"). One-tap creates the draft for review. Advisor proposals are
  logged to agent_runs.
- **Autopilot (post-launch backlog):** AI executing approved playbooks within
  budget guardrails without per-campaign approval. NOT in Sprints 7–12.

## C7. Schema (Sprint 7 — apply NOW)
Replace the base PRD `promotions` table with:
- `promotions`: name, type (C2 enum), config jsonb (items/categories/amounts/
  thresholds per type), code (nullable, unique per restaurant), segment_ids
  uuid[], custom_filter jsonb, schedule jsonb (start/end/days/windows),
  caps jsonb (total/per_customer/per_day), budget_cap numeric (nullable),
  spent numeric default 0, eligibility jsonb (min_order/branches/fulfillment/
  channels/first_order_only), stacking text check in ('exclusive','stackable')
  default 'exclusive', state text check in ('draft','scheduled','active',
  'paused','ended','archived') default 'draft', created_from_text text,
  created_by uuid.
- `segments`: name, kind ('builtin'|'custom'), definition jsonb, last_count int,
  refreshed_at.
- `promotion_redemptions`: promotion_id, order_id, customer_id, amount_discounted,
  created_at. (Powers caps, budget, analytics.)
- `campaigns`: promotion_id, segment_id, template_name, scheduled_at, state
  ('draft'|'scheduled'|'sending'|'done'|'cancelled'), sent/delivered/read/
  opted_out counts.
- `customers` additions: marketing_opt_in bool default false, opt_in_source,
  opt_in_at, opted_out_at, last_marketing_at.
- `orders` additions: discount_total numeric default 0, applied_promotions jsonb
  (id, name, amount per applied promo).
RLS: promotions/segments/campaigns = **manager-write only**; redemptions written
by server (service role) on order completion.

---

# PART D — CROSS-APP ALIGNMENT REVISION (verified, binding)

1. **Agent tools (Sprint 8):** replace `get_active_promotions`/`apply_promotion`
   with `get_applicable_promotions(customer, cart)` + engine-side best-deal
   evaluation. Sprint 8 ships a SIMPLE version (active combos/percent, no
   segments); Sprint 11 completes the machine.
2. **Receipts & tickets:** B2.5 receipt image AND the Amendment 01 printed
   kitchen/customer ticket include discount lines + discount_total. Renderer is
   shared.
3. **Roles (Amendment 01 A5):** promotions, segments, campaigns = manager only;
   operation has no read/write on campaigns and read-only on active promo list.
4. **Open/closed (Amendment 01 A4):** campaign sends only during open hours;
   the agent never offers "اطلب الآن" promos while closed (offers preorder path
   if enabled).
5. **Cart trust:** C5.1 evaluation and B3 cart parsing share one server-side
   pricing/eligibility module — single source of truth.
6. **Meta approvals (Sprint 9):** marketing template approvals + Commerce
   catalog review are part of the Sprint 9 Meta checklist so Sprint 11 is not
   blocked.
7. **Onboarding (Sprint 10):** no promotion step added (avoid overload); the
   go-live checklist mentions "أنشئ أول عرض" as an optional post-launch nudge.
8. **NL command bar (Sprint 11):** promo sentences route to the same creation
   engine as the Promotions page box — one parser, two entry points.
9. **Dialect (Amendment 01 A1):** all promo copy the agent generates and all
   campaign template bodies render per-tenant dialect.

## Sprint impact summary (replaces earlier tables where overlapping)
| Sprint | Additions |
|---|---|
| 7 | C7 full schema (promotions/segments/redemptions/campaigns/customer consent/order discounts) + B4 image columns + adapter kind awareness |
| 8 | Tool upgrade (D1, simple engine); promo lines in confirmations |
| 9 | All B2 (Tier 1) + B3 built (gated activation); receipt renderer (with discounts); marketing templates + catalog submitted for approval |
| 10 | B4 image system + governance |
| 11 | Full Promotion Machine (C2–C6): all types, segments incl. NL custom, caps/budget/stacking engine, campaigns + compliance, analytics, AI Advisor; B5 web menu |
| 12 | QA both dialects incl. promo flows + campaign opt-out; load test incl. campaign sends + image sends |

## Acceptance additions
- Full delivery order completable with zero typing (taps + location only), and
  equally via text or voice note.
- Every customer-visible dish has an approved image per B4 policy; illustrative
  images always badged.
- The canonical sentence "خصم ١٥٪ للعملاء اللي ما طلبوا من شهر، بحد أقصى ٥٠٠
  ريال، لمدة أسبوع" creates a correct lapsed-segment percent promo with budget
  cap in ≤2 confirmations.
- A capped promo stops applying the moment any cap/budget is hit (verified by
  concurrent test).
- Two stackable=false promos never co-apply; best-deal-wins verified.
- Opt-out "إيقاف" excludes the customer from the very next campaign send.
- Campaign to a 10-customer test segment delivers within open hours with
  accurate per-send stats.
