# Kivo — Upgraded Concept & Master Roadmap

> **SCOPE.** This file remains the strategic concept. Current implementation status and sequence
> are governed by [`docs/KIVO_AGENT_ROADMAP.md`](./KIVO_AGENT_ROADMAP.md).

### Restaurant-First Core Brain + Module Agents
**Document status:** Strategic north star + execution roadmap
**Owner:** Mohamed (City Baker LLC — CR 216565)
**Product:** Kivo — WhatsApp-first AI Restaurant Operating System
**Frontline agent:** Karim / كريم (Egyptian Arabic, claude-sonnet)
**First live client:** Wesaya Fried Chicken (وصاية) — Cairo, Egypt
**Date:** July 2026
---
## 1. The One-Sentence Concept
> **Kivo is a restaurant-first AI operating console: Karim handles customer conversations and orders, Kivo turns every conversation and business signal into structured truth and insights, specialized restaurant modules decide growth / marketing / menu / operations / service / margin actions, a Decision Layer enforces priority, approval, and safety, and Kivo executes those actions and learns from every result — then the same architecture expands industry by industry.**
Kivo is **not a chatbot**. Karim is the visible front layer. The deeper product is the brain behind him.
---
## 2. Strategic Positioning
### 2.1 What Kivo is
**The Restaurant Direct Commerce OS.** Kivo owns the layer where order truth is *born*:
Customer message → Karim / staff → order truth → POS handoff → kitchen / dispatch → driver delivery → COD settlement → customer memory → manager insights → recommended actions → executed campaigns → measured results → smarter next actions.
### 2.2 The moat
> **The moat = structured truth + insights + action loops. Not chat.**
Anyone can build a chatbot that replies nicely. Very few companies can build a system that:
1. Captures business truth from every conversation
2. Structures conversations into queryable data (intent, outcome, lost reason, objection)
3. Understands restaurant-specific patterns
4. Routes insights to specialized decision modules
5. Executes actions safely under owner approval
6. Measures outcomes and feeds results back as new data
Every conversation Kivo handles makes the moat deeper. A competitor starting later starts with zero structured restaurant truth.
### 2.3 The wedge
**Win one wedge first: Karim + restaurant modules.** The sellable pitch to a restaurant owner is concrete, not abstract:
> "Karim takes your orders on WhatsApp, handles your customers, and shows you exactly why customers buy or don't buy — then helps you improve sales, menu, offers, and operations."
Restaurant owners buy more orders, fewer missed customers, and better decisions. They do not buy "a multi-agent AI operating system."
### 2.4 The expansion strategy
**Go deep in one industry first, then clone the architecture industry by industry.**
Restaurants → Clinics → Beauty → Real Estate → Hotels → …
What gets cloned is the **architecture**, never the surface:
frontline agent → industry data sources → source of truth → insights engine → decision layer → specialized modules → execution layer → feedback loop.
Geographic expansion runs in parallel: **Egypt-first (live), Saudi Arabia next.** The codebase was originally built Saudi-first (Saudi dialect, ر.س, +966 normalization, Riyadh timezone, mada/Apple Pay labels all present). Genuinely new KSA work = a real payment provider + ZATCA e-invoicing. Nothing else needs rebuilding.
---
## 3. The Five-Layer Architecture
### Layer 1 — Frontline Restaurant Agent: Karim
The customer-facing AI worker. CS · Sales · Orders · Support. Takes WhatsApp orders, answers menu questions, recommends items, handles complaints, confirms delivery areas, collects preferences, escalates allergy/safety cases deterministically, sends order status, hands off to human staff and back.
**Status: ✅ BUILT and in production for Wesaya.**
### Layer 2 — Collects + Saves + Structures (Memory + Source of Truth)
Kivo does not just reply — it captures the truth of every interaction in structured form. Not "customer asked about spicy chicken and left" but:
| Field | Example |
|---|---|
| Intent | wanted spicy chicken family meal |
| Items mentioned | spicy chicken, family bucket |
| Outcome | no order (lost) |
| Lost reason | price objection / unclear portion size |
| Customer mood | interested but hesitant |
| Potential action | improve description, offer bundle |
**Status: 🟡 HALF-BUILT.** Orders, conversation stages, ad/referral source, customer memory, allergen data, COD truth, POS handoff status, and audit events are already structured. **The single missing piece is the conversation-outcomes table** — the highest-leverage build in this entire roadmap. Everything in Layers 3–5 depends on it.
### Layer 3 — Insights Engine / Shared Brain
Turns conversation + business data into patterns: lost-order reasons, menu confusion, pricing objections, complaint/delay clusters, top demand patterns, repeat-customer behavior, area-specific issues.
**Status: 🔴 NOT BUILT** (blocked only by the outcomes table).
### Layer 4 — Decision Layer
Priority · Approval · Safety · Conflict resolution. Modules may disagree (Marketing wants a 25% discount; Cost says margin is too low; Operations says the kitchen is overloaded). The Decision Layer arbitrates: what runs first, what is blocked, what needs owner approval, what violates margin or safety rules, what becomes a small test instead of a rollout.
**Status: 🔴 NOT BUILT** — but its DNA already exists in the codebase: feature-flag gating, manager-only routes, propose→approve→apply discipline, and the deterministic allergen gate are all Decision-Layer patterns already proven in production.
### Layer 5 — Kivo Executes / Orchestrates
**Modules decide, Kivo executes safely.** Execution surface: campaigns · offers/pricing · customer replies · menu updates · reports · tasks/workflows · ops actions. Every execution result becomes new data (the feedback loop).
**Status: 🟡 PARTIAL.** Customer replies, receipts, order/delivery/COD actions, and alerts execute today. Campaigns, menu updates, reports, and the measurement loop do not exist yet.
---
## 4. Data Sources (Left Side of the Architecture)
| # | Source | Status |
|---|---|---|
| 1 | WhatsApp / chat | ✅ Live (the wedge) |
| 2 | Website orders (storefront) | ✅ Live |
| 3 | Menu + modifiers | ✅ Live (47 Wesaya items, priced) |
| 4 | CRM / customer history | ✅ Live (built automatically from conversations) |
| 5 | Payments (COD, Vodafone Cash) | ✅ Live |
| 6 | Branch / ops data (delivery zones, drivers, dispatch) | ✅ Live (25 zones) |
| 7 | Marketing data (ad/referral source per conversation) | ✅ Live (schema, awaiting volume) |
| 8 | Support signals (complaints, escalations, human takeovers) | ✅ Live |
| 9 | Delivery apps (Talabat etc.) | 🔮 Future ingest-only — never operate |
| 10 | Any connected tool | 🔮 Future (POS integration, reviews) |
**Rule:** a data source is added only when a module needs it *and* the restaurant already produces it. Kivo never asks a restaurant to change how it works just to feed Kivo.
---
## 5. Replace vs. Integrate — The System Map
**The governing rule:** *Kivo replaces the systems where truth is created — conversation, order, customer identity. Kivo integrates with systems that touch physical operations, hardware, or accounting compliance.* The moat is structured truth; own where truth is born, not where food is cooked or counted.
### 5.1 REPLACE — these ARE the product
| System | Incumbent at Wesaya | Why replace | When |
|---|---|---|---|
| WhatsApp / conversation management | Be-On | The wedge. Highest-truth data source in the restaurant. Whoever owns the conversation owns the customer relationship. | ✅ Replacing now (pilot) |
| Direct order capture | Phone habits, manual entry | Every order through Kivo is structured, server-priced, attributed. Every order outside it is a blind spot. | ✅ Replacing now |
| CRM / customer memory | Nothing (doesn't exist at SMBs) | Falls out of conversations nearly free. Kivo becomes the first CRM the restaurant ever had. | ✅ Live |
| Marketing / campaign messaging | Manual blasts / nothing | Whoever owns the WhatsApp number must own campaigns — a second tool on the same number poisons data and 24h windows. | Phase 4 |
| Delivery dispatch board | Wesaya's route/trip board | Adjacent to order truth and COD truth Kivo already owns; a separate tool splits the money trail. | After trip-grouping is built (post-pilot) |
| Loyalty | Nothing | Thin layer on customer memory Kivo already has. | Post-pilot module |
### 5.2 INTEGRATE / COEXIST — never replace
| System | Incumbent | Why NOT replace | Kivo's relationship |
|---|---|---|---|
| **POS** | Deyafa (Simple Touch) | Cashier hardware, kitchen printers, dine-in tickets, tax receipts, accountant workflow, years of staff habit. Replacing POS is a different company with a different sales cycle and on-site support burden. | **Control layer now** (pos_status handoff + Deyafa reference number — built). **API integration in V2** (Foodics-class inject). The *only* future door into POS territory: a KDS-lite for delivery-only cloud kitchens with no POS legacy. |
| **Aggregators** | Talabat | The aggregator is the villain in Kivo's sales story ("recover the ~30% direct-order margin"), not a feature to rebuild. | Coexist. Later: ingest their order data as a read-only source. Never operate. |
| **Inventory** | Manual / POS-linked | Chained to procurement, suppliers, POS depletion counts. Owning it buys a year of engineering for data that improves no insight. | Consume ONE signal: item availability (86'd items — already modeled). |
| **Accounting / payroll** | Accountant + Deyafa reports | Compliance territory. | CSV exports (COD export built). E-invoicing adapters (ETA Egypt / ZATCA KSA) on the roadmap. Stop there. |
| **Payment processing** | Cash, Vodafone Cash | Kivo owns payment *truth* (what was paid, how), never payment *processing*. | Integrate Paymob (Egypt) then mada/Apple Pay rails (KSA). |
**The pattern:** everything on the Replace list makes the structured-truth brain smarter. Everything on the Integrate list would burn engineering to own data that doesn't improve a single insight.
---
## 6. The Restaurant Module Agents (Right Side)
**Critical architectural decision — modules are NOT six separate products or six AI agents.** Each module is a scheduled analysis job (a prompt + queries) over the shared brain, writing into one shared **recommendations pipeline**:
```
proposed → approved → executed → measured
```
with an approve/reject screen in the console. This is what keeps the vision buildable in sprints instead of years.
| Module | Analyzes | Example actions | Data needed |
|---|---|---|---|
| **1. Growth** | Lost orders, repeat customers, AOV, reactivation candidates, abandoned baskets | "37 customers ordered twice then disappeared 30+ days — approve reactivation campaign?" Upsell scripts for Karim. Bundle suggestions. | ✅ Already have (once outcomes table exists) |
| **2. Marketing** | Segment response, churn risk, campaign performance, ad-source ROI | Draft WhatsApp campaign, Ramadan offer, win-back message, A/B two offer texts | ✅ Already have + campaign execution (Phase 4) |
| **3. Menu** | Items with high questions but low conversion, confusing descriptions, missing allergen data, modifier problems | Rewrite item description (owner approves), flag missing allergy data, suggest bundles, better names | ✅ Already have (once outcomes table exists) |
| **4. Operations** | Late orders, zone delays, cancellation reasons, handover problems, human-takeover clusters | Staff task, branch alert, delivery-area limit recommendation, daily ops report | ✅ Already have |
| **5. CX / Service** | Complaints, angry customers, slow replies, bad handovers, Karim mistakes | Service-recovery message, escalate sensitive cases, complaint-pattern summary, Karim reply improvements | ✅ Already have |
| **6. Cost / Margin** | Offer cost, low-margin items, discount abuse, margin impact of bundles | **Block harmful offers** (Decision-Layer veto), warn before discounting, high-margin upsell recommendations | 🟡 Needs item-cost input from owner (one simple form) |
| **7. Future modules** | Loyalty, delivery intelligence, reviews, staff training, finance summaries, franchise performance | — | Backlog, gated by the discipline rule below |
**Two-way arrows:** Kivo pushes insights to modules ("customers ask about family meals but don't order"); modules pull analyses from Kivo ("find all conversations mentioning portion size", "check expected margin before approving this offer").
**Launch order: Growth + Menu first.** Both need zero new data sources and produce owner-visible wins fastest.
### The Module Discipline Rule (non-negotiable)
> **A module may only be built if it needs ZERO new data sources.** The moment a proposed module requires integrating something Kivo doesn't already capture, it goes to the backlog — not the sprint.
This single rule is what prevents "six half-built agents."
---
## 7. Safety & Approval Doctrine
**Approval first, automation later.** Carried over directly from the production discipline already proven at Wesaya (feature flags, manager gating, propose→approve→apply).
| Requires owner/manager approval — always at first | Can be automated early (low-risk) |
|---|---|
| Launching discounts / changing prices | Daily & weekly reports |
| Changing menu items or descriptions | Conversation summaries |
| Sending mass campaigns | Drafting replies & campaign drafts |
| Refunds / customer compensation | Tagging complaints |
| Anything touching allergy answers | Creating internal tasks |
| Deleting items / changing zone rules | Suggesting improvements (suggestions only) |
**Immutable safety invariants (carry into every phase, every module, every industry clone):**
1. The **deterministic allergen gate** fires before any LLM call. No module, campaign, or automation ever bypasses or weakens it. All workarounds (negation-guard, time-window suppression) are permanently rejected.
2. Karim **never fabricates** price, payment status, availability, or safety claims — money and safety are code-enforced, not prompt-hoped.
3. Every automated action is **flag-gated, approval-gated, audited, and reversible.**
4. Safety holds are released only by deliberate human action — never by timeout, never by a module.
5. The Cost/Margin module holds **veto power** in the Decision Layer: an offer that violates margin rules is blocked even if Growth and Marketing both proposed it.
The owner's trust contract: *"Kivo helps me, but never damages my business without my permission."*
---
## 8. The Phased Roadmap
### Phase 0 — Wesaya Live & Stable (NOW — the gate for everything)
Nothing from this document gets built before the pilot runs, because **the pilot generates the data that makes insights real.** An insights engine on zero conversations is decoration.
- ☐ DRYRUN-1 merge (tester allowlist, fail-safe HOLD) — PR #275
- ☐ DRYRUN-2 fix: per-tenant WhatsApp credentials on console-initiated sends (manual replies, resume-to-AI, receipt images) — the one open architectural finding; hard gate before any second live tenant
- ☐ Bahaa full rehearsal: console operator + WhatsApp customer + driver/dispatch + real Vodafone Cash transfer
- ☐ A3.1 allergy hard-test 211/211 green before any live order (standing rule)
- ☐ Adversarial harness 191/191 green
- ☐ WhatsApp number cutover from Be-On (Meta test number → real Wesaya number, 0100XXXXXXX)
- ☐ 2–4 weeks of real Wesaya order volume
**Exit gate:** Wesaya running real daily orders with zero safety incidents and stable COD reconciliation.
### Phase 1 — Structured Truth (the keystone build — small, ~1 sprint)
**The `conversation_outcomes` table.** After a conversation closes/goes quiet, a cheap background extraction pass writes one structured row:
`intent · items_mentioned · outcome (ordered/lost/complaint/question_only) · lost_reason · objection_type · sentiment · linked order_id · ad_source`
One table + one background job + one extraction prompt + reuse of the existing stage system (WB2). Backfill from historical Wesaya conversations on day one.
**Exit gate:** ≥90% of closed conversations produce an outcome row; spot-check accuracy against 50 hand-labeled conversations.
### Phase 2 — Insights Engine v1 = The Weekly Owner Report (~1 sprint)
Generate the real weekly summary for Wesaya from the outcomes table: top lost-order reasons · most-asked-but-not-ordered items · complaint patterns · repeat-customer count · zone performance · ad-source conversion. Delivered as a console page + WhatsApp summary to the owner.
Zero automation risk, and it is **the sales demo** for restaurants #2–#100: the owner sees intelligence, not chat logs.
**Exit gate:** Wesaya's owner reads it weekly and acts on at least one insight without prompting.
### Phase 3 — Decision Layer v0 + First Two Modules (~1–2 sprints)
- The `recommendations` table (proposed → approved → executed → measured) + console approve/reject screen
- **Growth module job:** reactivation candidates, abandoned-basket follow-ups, upsell opportunities
- **Menu module job:** high-question/low-conversion items, description-fix drafts, missing-allergen flags
- Conflict rules v0: dedupe overlapping recommendations; Cost-veto stub (margin rules configurable, block-by-default when data missing)
**Exit gate:** owner approves ≥1 recommendation per week; every recommendation traceable to the data that produced it.
### Phase 4 — Execution Layer: Campaigns & Menu Updates (~2 sprints)
- **WhatsApp campaigns:** segment builder from customer memory + outcomes → template sends (Meta-approved templates only, honest 24h-window handling, utility/marketing pricing awareness) → approval-gated → per-message delivery tracking
- **Menu updates:** approved description changes publish through the existing menu system
- **Tasks/workflows:** operational recommendations become assignable staff tasks in the console
- Marketing + Operations + CX module jobs come online (same pipeline, new prompts)
**Exit gate:** first closed loop — a campaign runs, results are measured, and the measurement appears in the next weekly report.
### Phase 5 — Closed Learning Loop + Cost Module (~1 sprint)
- Campaign/action results write back into the brain: opened → replied → ordered → AOV → margin impact → repeat behavior
- Cost/Margin module live (owner inputs item costs via one simple form) → veto power activates in the Decision Layer
- Recommendation quality scoring: which module suggestions actually produced revenue
**Exit gate:** the diagram's feedback arrow is real — *Data → Insight → Decision → Execution → Result → New Data → Better Insight.*
### Phase 6 — Scale the Playbook
- **Second/third tenants** (Sweet Shop live + new restaurants) — DRYRUN-2 fix already makes multi-tenant sends safe; Meta Embedded Signup (`feat/embedded-signup-frontend` rebased fresh) makes onboarding self-serve
- **Trip/route dispatch grouping** — replaces Wesaya's dispatch board fully (multi-order driver trips, trip-level COD roll-up, failed-delivery reasons)
- **POS integration v1** — Deyafa/Foodics-class API inject (upgrade the control layer, keep the handoff status as fallback)
- **Loyalty module** on top of customer memory
- **Paymob** online payments (Egypt)
### Phase 7 — Kingdom & Beyond
- **KSA launch:** mada/Apple Pay payment rails + ZATCA e-invoicing (dialect, currency, phone, timezone already built)
- **Egypt e-invoicing (ETA)** adapter
- **Industry clone #1 (Clinics):** new frontline agent (appointments, patient questions, follow-ups) + clinic data sources + clinic modules — on the *same* five-layer core, the same recommendations pipeline, the same Decision Layer. The architecture is the product being cloned, never the restaurant surface.
- Then Beauty → Real Estate → Hotels, one at a time, each entered only after the previous vertical's playbook is profitable and repeatable.
---
## 9. Why This Version of the Concept Is Stronger
1. **Clear restaurant wedge** — focused market, not everything for everyone
2. **Easier to sell** — owners understand orders, customers, menu, complaints, revenue; they don't buy abstract multi-agent platforms
3. **Better data moat** — restaurant-specific conversation patterns compound into defensible knowledge
4. **Safer execution** — the Decision Layer + approval doctrine prevents harmful automation and protects owner trust
5. **Reusable architecture** — expansion from strength (a proven playbook), not from theory
---
## 10. Operating Principles (carried from production, apply to every phase)
1. **Merge = ship.** Every unguarded merge to main is a production event for live tenants; anything not ready is flag-gated OFF.
2. **Propose → approve → apply** for every production data change. Never apply-then-report.
3. **The allergen gate is sacred.** No architecture change touches it; the 211-case hard-test gates every live milestone.
4. **Verify before trusting.** No module, report, or recommendation ships on unverified extraction — spot-check against hand-labeled truth first.
5. **One decision at a time** for the owner. Kivo's job is to reduce the owner's cognitive load, not add dashboards.
6. **Adversarial review is mandatory,** not optional — independent review has caught safety findings repeatedly.
7. **A module needs zero new data sources, or it waits.**
8. **Never overclaim.** The UI says what Kivo actually does. No "POS integration" label until the API integration ships; no "AI insights" label until the outcomes table feeds real ones.
---
## 11. The Roadmap in One Line Each
| Phase | One line | Unlocks |
|---|---|---|
| 0 | Wesaya live, safe, stable | The data |
| 1 | Conversation outcomes table | Everything else |
| 2 | Weekly owner report | The sales demo |
| 3 | Recommendations pipeline + Growth & Menu modules | The Decision Layer |
| 4 | Campaigns + menu updates execute | The action loop |
| 5 | Results feed back; Cost module vetoes | The learning loop |
| 6 | Multi-tenant scale, trips, POS API, loyalty | The restaurant playbook |
| 7 | KSA + industry clones | The company |
---
*Kivo starts as a restaurant-first AI operating console where Karim handles customer conversations and orders, Kivo turns all restaurant data into structured truth and insights, specialized restaurant modules decide growth/marketing/menu/operations/service/margin actions, the Decision Layer checks priority and safety, and Kivo executes those actions while learning from every result — then the same architecture expands industry by industry.*

---

## 12. PM Decision Ledger

> The running record of PM-level decisions, merges, ceremonies, and standing-law
> additions. Records ≤ 148 are held in the PM's continuous log; the entries below
> (149–162) continue it in-repo. Each record states verbatim facts.

**149. PM window replaced.** The PM window was rotated. The new PM verified program
state independently via three sources — `git` history, the production database, and
Vercel deploy state — and reconciled it against the five-window read-only reports on
file before issuing any new ruling.

**150. #418 data-honesty merged** (`ef7bacf`). Binding base-prompt additions — truthful
answers to data/deletion questions and anti-anchoring — applied to all personas.

**151. #410 signup env split merged** (`720a091`). Landed via the replacement Payments
window; the halt-on-contradiction discipline was honored (work paused for verification
rather than proceeding on an unresolved conflict).

**152. Ceremony Day executed on test tenants.** Migrations `0080`–`0083` applied;
Sweet Shop provisioned with 4 flags; KSA Dry-Run with 2; Wesaya proven byte-identical
through the applies (prepare-only columns inert until a flag flips).

**153. Wesaya status correction — by the owner, out loud.** Wesaya is **pre-launch, not
selling**. The weight of a flip is reduced accordingly (build-phase caution, not live-
production caution), and the explicit launch gates were defined (see the Launch Roadmap).

**154. Wesaya activation.** +4 feature flags flipped, then `console_v2` + `photo_thread`
enabled — Wesaya now at **14 verified keys**.

**155. LIVE-2 batch.** Live findings F1–F4 triaged from the founder's test. **#419 §0
context gate** merged (`177fbe6`) — root cause was the «عادي» ("regular" flavor) false-
positive in the context-free banned-phrase scan; the PM's echo-of-marketing hypothesis
was refuted by the recovered blocked draft. **#420 companion block audit** merged
(`ed9ba84`) — the §0 output-scan block now writes a `conversation_allergy_events` row.

**156. LIVE-3 batch — #421 merged** (`527e156`). Five media/hospitality rules behind
`media_guard` (link dedup; 24h-OR-new-order budget window; per-message cap 2→3 on an
explicit ask; guard→model coherence directive; intentional link-on-ask) **plus a P0
webhook-reachability fix**: location-only and image-only webhooks were unreachable
(nested inside the text-gated block). A **route-level red-first proof class** (posting
real bodies through the actual handler) is now standing law for inbound-path WOs.

**157. WO-T1-PAYMENTS — #422 merged** (`50149be`). A canonical `payment_methods` model:
`lib/payments/resolve` is the sole-source resolver; a never-all-off guard; an immutable
per-order snapshot. Flag OFF; the `0084` migration is prepare-only (unapplied).

**158. Zone work + editor defects.** Wesaya has 2 geo delivery zones. Three console-v2
zone-editor defects were diagnosed — an ASCII `\d` digit-class bug (Arabic-Indic
numerals), feature-flag-panel over-exposure, and SSR leaflet loading — folded into the
**#423 rebuild** (held).

**159. GoTrue NULL-token repair.** A NULL-token family across 8 `auth.users` columns was
repaired, unblocking team invites.

**160. #424 signup hardening.** Embedded Signup moved to Graph `v25.0` with fetch
timeouts. Separately, the **live messaging** Graph version was flagged **expired**
(`v19.0`) → **WO-GRAPH-VERSION-LIVE** opened (in flight at the Payments window).

**161. Architecture ADR ratified.** "One brain, two skins" — the persona architecture —
was owner-ratified (see `docs/decisions/ADR-PERSONA-ARCHITECTURE.md`).

**162. Standing laws added.** (a) One active order per window; (b) route-level,
type-only-payload proofs are required for every inbound-path WO; (c) the PM checklist
law (verify state before ruling).
