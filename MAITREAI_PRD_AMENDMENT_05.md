# MaitreAI — PRD AMENDMENT 05: The Conversational Operating System
# (Two-Agent Architecture · Scenario Corpus · Page Sharpening · Deep Specs
# for Onboarding & Promotion Engine)

> Status: APPROVED by owner. Extends PRD + Amendments 01-04. Newest wins.
> Source: owner-commissioned product review, arbitrated against the
> constitution. The LAUNCH SLICE IS UNCHANGED (§U). This amendment
> sharpens; it does not widen.

---

## §P. Two-agent architecture (BINDING, begins this sprint)

P1. MaitreAI has exactly TWO brains sharing one tenant dataset:
- **Customer Agent** (exists: /api/agent/respond): talks to customers,
  builds orders, answers menu/zones/hours/status, escalates. May never:
  change prices/menu, create promotions, refund, promise compensation
  beyond policy, invent ETAs, accept unavailable items, continue after
  escalation, or confirm an order without explicit customer confirmation.
- **Admin Agent** (NEW: /api/agent/admin): talks to owner/manager/operator
  in the Maître console. Reads everything role allows; prepares writes.

P2. Admin Agent core loop (BINDING):
intent → read real data / prepare action → answer or card in-thread →
if write/money/destructive: **PreviewDiffCard** (before/after + impact) →
explicit confirm → execute → log → result card. **No write executes
without confirmation. This rule applies retroactively: the current home
chat's instant execution of سكّر/افتح المطعم is a defect — fix in the
current sprint.** The assistant never claims an action succeeded before
the DB write succeeds.

P3. Files: app/api/agent/admin/route.ts · lib/ai/admin/{prompt,tools,
types}.ts · lib/admin-actions/preview.ts · components/maitre-thread/
cards/*. Role enforcement server-side (operation cannot invoke
manager-only tools; revenue tools blocked for operation).

P4. Card inventory v2 (in-thread): DailyOpsCard, ReportCard,
EscalationCard, OrderCard/OrderSummaryCard, PaymentCard, PromoProposalCard,
MenuEditCard, BranchStatusCard, WhatsAppStatusCard, PreviewDiffCard,
ConfirmationCard, ErrorDegradedCard, DailyReviewCard (S11). Cards may
carry secondary «التفاصيل» actions; default work happens in-thread.

P5. Token efficiency (restates the owner directive as PRD law): fixed
chips = deterministic intent = NO LLM call; free text = small admin
prompt, low max_tokens, intent+params+one sentence; card bodies are
COMPUTED, never LLM-generated; off-scope requests get a one-line
redirect; all admin turns logged to agent_runs (or admin_action_runs).

P6. Admin Agent capability rollout: Phase 1 (now): read-only ops
(daily ops, escalations, orders, payments, menu queries, agent health)
+ writes for open/close, pause/resume assistant, item availability —
all via PreviewDiff. Phase 2 (S10-11): price edits, zones, hours, promo
drafts, campaign approval. Phase 3 (S11+): full NL-everywhere per PRD.

## §Q. Scenario corpus = the canonical eval suite

Q1. Adopt the owner-side library (daily ops, open/close/control, sales,
orders, takeover, menu, promos, payments, delivery/branches, CRM,
knowledge-improvement, staff, adversarial) and the customer-side library
(greeting, browsing, item details, direct/vague orders, modifiers,
confirmation, delivery/address, hours, payment, status, changes,
cancellation, complaints, allergens, offers, returning-customer,
dialect/language mix) as /reports/scenario-corpus.md + harness cases.
Q2. Tiering: T1 safety (never-invent, money, allergens, escalation,
injection, refunds) must pass 100% before any go-live; T2 capability
(coverage %) tracked per release; T3 nice-to-have. Extend
scripts/eval-scenarios.mjs incrementally per sprint — each sprint's
envelope names which scenario groups become executable.
Q3. Allergen rule (sharpened): with confirmed data → answer from data;
without → explicitly say data is unconfirmed and escalate. Inferred
allergens are NEVER presented as confirmed (also binds onboarding §S).

## §R. Page sharpening — absorbed into the CURRENT sprint map

R1. Finish Amendment 04 items already binding: mobile bottom tabs (M2),
conversations inbox→chat→drawer (M4), order detail drawer (M5: items/
modifiers/notes, customer+address, payment controls, promo lines, status
timeline, manager-only cancel/refund, reprint), desktop/till, role nav.
R2. Pulse strip v2: every segment CLICKABLE (تصعيدات→filtered list,
واتساب→setup/diagnostics, الدفع→payment settings, الطابعة→printer setup);
mode badge always visible in non-live modes.
R3. Orders: filters (توصيل/استلام/متأخرة/غير مدفوعة), bulk ops (طباعة
كل الجديدة), printer-degraded banner with browser-print fallback.
R4. Menu = AI-readiness center: filters (ناقص سعر/وصف/حساسية/صورة، غير
متوفر، يُسأل عنه كثيرًا), quick actions per item (availability toggle,
price edit, اختبر رد المساعد preview, اعمل عرض), readiness vs allergen-
safety scores. Menu import lands with S10 ingestion.
R5. ذاكرة المطعم keeps its name; reorganize into: جاهزية المساعد ·
معلومات ناقصة · أسئلة العملاء المتكررة (from J1 signals) · مناطق التوصيل ·
السياسات · الأسئلة الشائعة · اختبر المساعد — each gap with a Fix-with-AI
action. مراجعة المساعد becomes the Assistant Quality Center backed by
real agent_runs/signals (low-confidence, escalation reasons, unknown
questions; actions: اعتمد/صحح/أضف للذاكرة/حوّل دائمًا).
R6. Settings regrouped: بيانات المطعم · الفروع والساعات · واتساب والقنوات
(diagnostic states: app/number/webhook/token/last in-out) · الدفع ·
قواعد المساعد · التصعيد · اللغة واللهجة · الطباعة · الحساب والصلاحيات.
Dangerous reset requires typed confirmation. AI-tone live preview.
R7. /customers stays a secondary route (not nav) and becomes CRM-lite:
segments (جدد/متكررون/VIP/خاملون 30ي/اشتكوا/طلبوا عرضًا ولم يكملوا),
profile shows last order, favorite item, spend, complaints, opt-in
status, suggested next action.
R8. Login routes by state: no restaurant → /onboarding; incomplete →
resume step; else /dashboard. Checkout becomes tenant-branded (logo,
color, name), shows the payment-policy state (H2), and replaces any
app-return link with «ارجع إلى واتساب لمتابعة طلبك». Landing gains a
how-it-works visual + before/after section (public-page merges remain
pre-authorized).

## §S. Onboarding deep spec (Sprint 10 — supersedes/extends PRD S10)

S1. Framing: «درّب موظفك الذكي» — an AI setup interview with cards and
review grids, NOT a form stack. Layout: progress rail + agent thread +
cards/review grid. Resume-on-return via onboarding_state.
S2. Steps: profile (country auto-sets currency/dialect/payment defaults/
weekend) → menu ingestion (PDF/photos/text/CSV) → REVIEW GRID with
per-field confidence (green/yellow/red), NL corrections («غير برجر
الدجاج إلى 27»), smart cleanup (missing prices, duplicates, combos-as-
offers, unlinked modifiers) → branches/hours by sentence (prayer-pause
default offered in KSA) → zones by sentence or map; pickup-only valid →
policies/FAQ interview (5-8 questions → drafted policy to approve) →
persona + live reply preview → WhatsApp connect (guided; truthful
diagnostics; real test message «إذا وصلتك هذه الرسالة فموظفك جاهز ✅») →
test drive (owner completes one order; PLUS auto self-test: simple order,
vague order, unavailable item, zone, allergen, complaint) → go-live
checklist with readiness score.
S3. Hard gates (block go-live): profile · ≥1 branch/pickup · hours ·
≥5 priced active items · fulfillment setting · cancellation+complaint
policy basics · WhatsApp connected · 1 successful test order. Warn-only:
allergens (agent will escalate allergen questions and SAY so), photos,
promos, FAQ depth, online payment, zones-if-pickup.
S4. Data: onboarding_state, onboarding_events, menu_ingest_jobs,
menu_ingest_candidates, onboarding_test_runs; Storage bucket
menu_uploads. Candidates NEVER write to live menu tables without owner
approval. Defaults engine by business type (fast-food/cafe/cloud-kitchen/
premium presets for tone, upsell, fulfillment emphasis).

## §T. Promotion engine deep spec (Sprint 11 — extends Amendment 02 C)

T1. Three modules: Promo Intelligence (consumes J1 conversation_signals:
price_sensitive, asked_offer, abandoned_order, asked_unavailable_item,
repeated_item_interest, complaint, inactive...) · Offer Builder (prefers
bundles/combos over % discounts for margin safety; if cost data absent,
margin=unknown and recommend bundles) · WhatsApp Compliance Checker.
T2. Consent model (schema change, migrate in S11): customer_marketing_
preferences with SEPARATE opt-ins (order_updates / marketing /
recommendations) + opt_out keywords (إيقاف، وقف، stop) + window tracking
(last inbound at). Campaign sends require: marketing opt-in AND not
opted-out AND window/template-eligible AND frequency-cap pass AND
manager approval. Recent complainants excluded unless manager-approved
recovery. Auto-pause campaign on opt-out/error threshold breach.
T3. Template library: ~5 reusable approved Marketing/Utility templates
(general offer, win-back, finish-order, new-item, recovery-coupon) with
variables — not per-campaign templates. whatsapp_templates table tracks
provider status (approved/paused/disabled).
T4. Campaign flow (all in admin chat): proposal card (audience size,
eligible count, exclusions w/ reasons, offer, WHY-this-offer reasoning,
template, schedule, test-first option, auto-pause rule) → manager
approve → test send → full send → analytics card (sent/delivered/replied/
started/confirmed/revenue/redemptions/opt-outs) + assistant's verdict.
Compensation/recovery coupons are ALWAYS one-to-one and manager-approved.
T5. Tables per the reviewed schema: promotions(+created_source),
promotion_codes, customer_segments, whatsapp_templates, campaigns,
campaign_recipients, campaign_events (conversation_signals exists).
Guardrails per restaurant: max discount %, min margin, no-discount lists,
approval thresholds (>10% discount, free delivery, >100 recipients,
inactive>90d).

## §U. Sequencing & the not-now list (BINDING)

U1. Current sprint (8.5 extension, may be labeled 8.6): finish §R1-R3 +
Admin Agent Phase 1 (§P) + scenario-corpus file + harness extension for
admin read-only + confirm-before-write fix. THEN Sprint 9 (WhatsApp live
+ voice STT + templates plumbing) → Sprint 10 (§S onboarding) → Sprint 11
(§T promotions + NL-everywhere Phase 2/3 + Daily Review) → Sprint 12
(payments + hardening) — per the existing map.
U2. NOT NOW (unchanged + additions): POS, inventory, accounting, staff
scheduling, loyalty programs, deep BI, per-branch WhatsApp numbers,
cost-based margin computation (manual margin tags acceptable),
multi-restaurant chains console, native apps.
U3. Launch slice reaffirmed verbatim: one restaurant, one WhatsApp
number, one dialect, tap-first ordering, COD + one online method,
ticket printing, human takeover, zero hallucination.
