# MaitreAI — PRD AMENDMENT 03: Operations, Trust, Money & Language

> Status: APPROVED by owner. Extends the base PRD + Amendments 01–02. Newest
> amendment wins on conflict. Claude Code: commit to repo root; treat as part
> of the PRD in all sessions. A separate AMENDMENT 04 (UI redesign spec) will
> follow once the hi-fi design boards are final; section K here pre-locks the
> IA decisions it will build on.

---

## E. Conversation ownership & human↔AI takeover (binding rules)

E1. One conversation has exactly one owner at a time: `ai` or `human`.

E2. **Manual takeover:** operator taps "تدخل" → ownership flips instantly;
any in-flight AI generation is cancelled before send. Optional soft system
line to customer (tenant-configurable, default OFF). Composer switches to
human mode.

E3. **Typing = takeover.** A human sending a message in an AI-owned
conversation IS a takeover — no button required. AI generation cancels; the
human message wins.

E4. **Copilot mode:** after takeover the AI keeps reading, keeps the insights
panel live (intent, history, draft order), and offers a suggested reply the
operator can tap-to-send or edit. The AI never sends on its own while
human-owned.

E5. **Self-escalation:** on complaint, allergen uncertainty, payment dispute,
abusive content, low confidence (<0.55), large/suspicious orders, repeated
misunderstanding, or explicit human request → AI sends ONE polite dialect-
correct bridge message, flips owner to human, notifies operators, and the
conversation enters the escalation queue with an **SLA timer** (default
5 min). SLA breach → louder manager notification. The AI NEVER reclaims
ownership on its own.

E6. **Escalation context card:** every escalation shows: reason, last intent,
suggested reply, relevant order/payment/customer facts, and a "إعادة
للمساعد بعد هذه الرسالة" quick option. Escalation is presented as SAFETY,
not failure ("توقفت لأن هذا قد يمس ثقة العميل").

E7. **Handback:** operator taps "إعادة للمساعد" → system extracts
commitments made by the human (discounts promised, exceptions granted) into
structured handover notes → shows a one-line summary the operator
confirms/edits → AI resumes having read the FULL human exchange; never
re-greets; treats human promises as binding. Draft orders survive the
round-trip.

E8. **Idle human:** customer messages a human-owned conversation with no
reply → nudge operator at N min, manager at 2N. AI does not jump in.
Optional per-tenant "auto-return to AI after X idle minutes" toggle,
default OFF.

E9. **Multi-operator:** first sender becomes assignee; others see live
presence ("يرد عليه أحمد الآن"). Ownership flips and message queueing are
race-safe.

E10. **Operational events bypass ownership:** payment confirmations, order
status templates, and ticket printing fire regardless of who owns the chat.
Only conversational replies respect ownership.

## F. Switches & system modes

F1. Three distinct controls, visually distinct, never conflated:
(a) per-conversation owner (E); (b) **مفتوح/مغلق** restaurant open/closed
(Amendment 01 A4 behavior: AI answers questions, states reopening time,
takes no live orders, optional pre-order parking); (c) **إيقاف المساعد**
master AI pause: AI silent everywhere, all inbound → human queue +
notifications, optional auto-reply. Manager-only. Effective on next message.

F2. **Vacation mode** = closed with custom message + date range
("مغلق للعيد، نرجع ٢٤ يونيو 🌙").

F3. **System modes (global, truth-driven):** the app is always in exactly
one of: `demo` (local simulation, no real customers), `setup` (backend
connected, WhatsApp not live), `test` (owner simulating), `live`
(real customers), `degraded` (WhatsApp/AI/payment/printer/DB problem),
`paused/closed` (intentional). A persistent status strip shows: open/closed,
AI state, WhatsApp state, payment mode, printer state, escalations needing
humans, late orders. **No UI text may claim a connection or active state
that is not actually true** (e.g. the current hardcoded "متصل بواتساب"
sidebar text is prohibited). Customer-facing surfaces in live mode must
never show demo/simulation controls (e.g. the checkout "simulate failure"
button is dev/demo-mode only).

F4. **Degraded behavior:** printer offline → visible in strip, auto-print
fails loudly, browser-print fallback offered, reprint always available,
order flow NEVER blocked by printing. WhatsApp disconnected → unmissable
alert. AI budget exhausted → graceful degradation to escalation, never
silence.

## G. Live data while conversations run

G1. Owner edits (menu, prices, zones, policies, tone, dialect) apply on the
NEXT agent turn. No restarts.

G2. **Re-quote rule:** prices are re-validated at confirmation. If changed
since quoting, the agent re-quotes transparently; never silently charges
differently, never silently honors stale prices.

G3. Item unavailable mid-draft → apologize at confirm + offer closest real
alternatives; never hide it, never keep unavailable items in a draft.

G4. **Promo goodwill window:** a promo the agent offered is honored for
10 minutes after offer even if it expired in between; beyond that,
apologize + show today's best real deal. Redemption still logs against the
promo budget.

G5. Branches/zones with active orders can be deactivated, never hard-deleted.

G6. **Auto-accept mode (per tenant, default OFF):** when ON, orders
auto-confirm without operator approval IF all items available AND zone valid
AND payment policy satisfied; otherwise the order waits in "needs approval".
Ticket auto-print obeys its own toggle (Amendment 01 A3).

G7. Ambiguity rule: vague requests ("أبغى برجر" with 5 burgers) → never
guess; present choices via list/buttons, one clarifying question max before
options.

## H. Payments & pricing

### H1. Customer payment methods (per launch country)
- **Egypt:** COD is the frictionless default; online via **Paymob** —
  cards/Meeza, mobile wallets (Vodafone/Orange/Etisalat Cash), with
  InstaPay/Fawry surfaces as available.
- **Saudi:** **mada + Apple Pay are mandatory**, then STC Pay and cards, via
  **Moyasar or Tap**. COD available but secondary.
- Checkout shows only the tenant's enabled methods. The agent's payment
  buttons (B2.2) are built from tenant config.

### H2. Per-tenant payment policy (manager-only; Sprint 12 with checkout)
- Method toggles: COD on/off; online on/off; per-method enable within online.
- **Prepayment rules:** require online payment when order > X, for
  first-time customers, for selected zones, or always. The agent enforces
  conversationally and the checkout reflects it (COD hidden when prepay
  mandatory, with a one-line explanation).
- Design requirement: checkout has three states — all methods / prepay-
  mandatory / COD-only.

### H3. Money architecture (unchanged, restated as binding)
Order money flows customer → restaurant's own gateway account
(Paymob/Moyasar/Tap per market). MaitreAI never holds order money. MaitreAI
bills restaurants a SaaS subscription only.

### H4. SaaS billing
- Egypt: Paymob recurring billing in EGP (card/wallet on file) + InstaPay-
  against-invoice fallback.
- Saudi (launch phase): international card via Paymob, or annual invoice +
  bank transfer; merchant-of-record (e.g. Paddle) at growth; KSA/UAE entity
  only at scale.

### H5. Launch pricing grid (hypothesis to validate in pilot; structure is
binding, numbers may be tuned)
| Tier | Egypt | Saudi | Includes |
|---|---|---|---|
| تجربة (Free) | 0 | 0 | 14 days full → 100 conv/mo, 1 branch, MaitreAI watermark on receipts |
| أساسي (Starter) | EGP 499/mo | SAR 149/mo | 500 conv/mo, 1 branch, full agent + orders + printing |
| نمو (Growth) | EGP 1,299/mo | SAR 349/mo | 2,000 conv/mo, 3 branches, promotions + campaigns + Image Studio |
| محترف (Pro) | EGP 2,799/mo | SAR 699/mo | 6,000 conv/mo, unlimited branches, Advisor + Daily Review, priority support |
| Overage | EGP 0.35/conv | SAR 0.15/conv | beyond allowance |
- Annual = 2 months free. Per-country local-currency pricing. Free-tier
  watermark is the growth loop. Usage metering (conversations + tokens) per
  tenant is required infrastructure (Sprint 12).
- Pricing floor rule: never discount below Starter; overage is the margin
  safety valve; revisit numbers after 30 days of pilot token bills.

## I. Agent tools & Image Studio

I1. Adopted tools (beyond those already specced): **dish photo enhancement**
(Sprint 10, extends B4), **promo card generator** (Sprint 11, feeds
campaigns + catalog), **QR poster / table-tent generator** (Sprint 11,
extends B2.9), **menu copywriter** (Sprint 10). Social-post generator =
post-launch backlog.

I2. **Image governance:** ENHANCING a real photo (lighting/crop/background
of the same dish) needs no badge. GENERATING a dish image keeps the
**"صورة تعبيرية"** badge everywhere, no exceptions. Owner approval required
before any generated/enhanced image goes customer-facing.

I3. Image-generation/enhancement calls are metered per plan tier (freemium
lever).

I4. Tool discipline rule: a new agent tool is only added if it does a real
restaurant job mapped to an existing module.

## J. Trust & learning layer (the retention engine)

J1. **Signal logging (Sprint 8):** the Brain logs, per tenant: unanswered/
missing-knowledge questions, requested-but-absent items/areas/modifiers,
abandonment points (e.g. after delivery fee), repeated combos, dish-photo
requests, complaint reasons.

J2. **Daily Improvement Review (Sprint 11):** end-of-day card: "لاحظت
اليوم..." with 1–5 concrete observations, each with one-tap actions (add
FAQ / add zone / add modifier / add photo / create promo / ignore). Every
action goes through the normal preview-confirm write path.

J3. **Daily proof card (Sprint 11):** simple value summary — conversations
handled, orders created, returning customers recognized, abandoned orders
recovered, complaints safely escalated, assisted sales amount. One card,
not a dashboard.

J4. **AI asks the owner** (same engine): proactive single-question
suggestions in the Maître thread ("عملاء كثير يسألون عن صوص حار — أضيفه
كإضافة؟"). Frequency-capped to avoid nagging (max 3/day).

## K. IA consolidation & launch-slice discipline (pre-locks Amendment 04)

K1. **Navigation collapses to 5:** الرئيسية (Pulse strip + Maître thread) ·
المحادثات · الطلبات (absorbs printing + statuses) · المنيو والذاكرة ·
الإعدادات/التشغيل. Promotions, customers, analytics, AI review, Image
Studio are summoned in-flow or nested — no new top-level nav item unless
used daily by most restaurants.

K2. **Role-aware UI:** operation role sees only: المحادثات، الطلبات،
الطباعة، توفر الأصناف + read-only strip. Actions they cannot perform are
REMOVED from their UI, not disabled. (RLS/server checks per Amendment 01
remain the enforcement.)

K3. **Surface grammar:** Thread (conversation) · Card (decision, money,
confirmation, error, takeover, order status ONLY) · Drawer (detail/edit/
audit). Everything else collapses into history. Cards are rationed —
not every event becomes a card.

K4. **Go-Live Control Room (Settings):** checklist of WhatsApp / AI / menu /
zones / printer / payments / test-order-passed, with one button
"تشغيل المساعد" enabled only when critical checks pass. Driven by the
Brain completeness score + live statuses.

K5. **Launch slice (binding scope guardrail):** the launch bar is one
restaurant, one WhatsApp number, one dialect, tap-first ordering, COD +
one online method, ticket printing, human takeover, zero hallucination.
**Not now:** POS replacement, inventory, accounting, staff scheduling,
supplier ordering, deep BI, loyalty programs, workflow builders,
multi-channel beyond WhatsApp. Any feature request is tested against:
does it reduce operator work, customer loss, or mistakes — today?

K6. PRD/code alignment fixes owed: dialect enum/default must be
`saudi`/`egyptian` (not `gulf`); kitchen nav/pages removed at redesign;
README demo-era language cleaned; demo controls gated out of live mode (F3).

## L. Arabic language layer

L1. The repo file `ARABIC_LANGUAGE_GUIDE.md` (committed alongside this
amendment) is the source of truth for all Arabic strings.

L2. **Two layers:** operator app = professional, short, operational Arabic
(one register, not dialectal); customer WhatsApp = dialect-aware per tenant
(Saudi/Gulf or Egyptian), warm and tap-first.

L3. Terminology decisions (binding): product phrase = **"الموظف الذكي
للمطعم"** / UI references = **"المساعد"**; never "بوت/شات بوت". لوحة التحكم
→ **الرئيسية / نبض المطعم**. عقل المطعم → **ذاكرة المطعم** (UI label;
"Brain" remains the internal concept). مركز مراجعة الذكاء → **مراجعة
المساعد**. Order drafts = **مسودة طلب / طلب غير مؤكد**. Status text
(واتساب متصل، المساعد نشط) only when actually true (F3).

L4. Centralize strings in a terminology/constants module; no hardcoded
status claims.

## Scenario conformance checklist (QA acceptance for Sprints 8–9)
The agent + UI must demonstrably pass: new-signup wizard path (S10);
menu-upload diff with zero-change re-upload; unavailable item; vague order
disambiguation; voice note high/low confidence; allergen with/without data;
complaint escalation; cancellation by status; "وين طلبي"; closed/paused/
outside-hours distinctions; payment link expiry; COD end-to-end; printer
offline; webhook redelivery; low confidence clarify-vs-escalate; zero
hallucinated facts (tool-grounded only); promotion sentence with ambiguity +
margin warning. Each becomes a test/QA item in the relevant sprint's
acceptance list.

## Sprint impact summary
| Sprint | Additions from this amendment |
|---|---|
| 8 | E (ownership/takeover/copilot/handback in engine + endpoints), F1–F3 states in agent behavior, G all, J1 signal logging, L strings audit on agent replies |
| 8.5 (NEW — UI redesign, spec in Amendment 04) | F3 status strip + mode banners, K1–K4 shell, kitchen removal, L terminology audit across UI, mobile-first conversations (inbox→chat→drawer) |
| 9 | E10 operational bypass live on WhatsApp; F4 degraded behaviors; scenario checklist on real phone |
| 10 | I1 enhancement + copywriter; onboarding framed as "درّب موظفك" (hiring-an-employee narrative) |
| 11 | J2–J4 review/proof/asks; I1 promo cards + QR posters; K4 go-live room if not earlier |
| 12 | H all (gateways, policy states, billing, metering, pricing flags) |
