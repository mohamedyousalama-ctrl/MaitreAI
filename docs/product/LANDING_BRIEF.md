# A.6 — getkivo.io Landing Page Brief
**Program:** Core Evolution · **Status:** APPROVED for build (WO-C4)
**Date:** 2 Jul 2026 · **Wesaya impact: NONE**

## 1. Positioning (the page's one job)
**Kivo is the Restaurant Direct Commerce OS.** Karim is the face; the brain is the product. Sell the wedge in the owner's language:
> **AR (hero):** «كريم ياخد طلباتك على واتساب، يخدم عملاءك، ويوريك ليه العملاء بيشتروا أو مبيشتروش — وبعدين يساعدك تحسّن المبيعات والمنيو والعروض.»
> **EN (hero):** "Karim takes your orders on WhatsApp, serves your customers, and shows you why they buy or don't — then helps you improve sales, menu, and offers."
Never lead with "AI operating system." Owners buy more orders, fewer missed customers, recovered aggregator margin.

## 2. Audience & market targeting
Independent restaurant owners + small chains in **Saudi Arabia and Egypt**. One page, two markets — market-neutral copy, country toggle only where facts differ (ر.س/ج.م, mada+Apple Pay / COD+Vodafone Cash). Arabic DEFAULT; English secondary. Full RTL-first build.

## 3. Page architecture (single page + 2 support pages)
1. **Hero** — the wedge sentence + one visual: a real WhatsApp conversation with Karim (Arabic, an actual order flow) + primary CTA.
2. **"The problem" strip** — three owner pains: missed WhatsApp orders, ~30% aggregator commissions, no idea why customers don't order. Short, numeric, unsentimental.
3. **How Karim works** — 3 steps: customer messages → Karim takes the order (allergy-safe, price-true) → your team runs it from one console. Screenshot: the live console (Arabic).
4. **Beyond the chatbot** — the honest brain section: order truth, customer memory, COD reconciliation, delivery zones, staff handoff. Only shipped features. Default: omit "coming soon" teasers until real (never-overclaim rule).
5. **Safety & trust block** — the differentiator: deterministic allergy safety, human takeover, no invented prices or availability. Doubles as the answer to "can I trust AI with my customers?"
6. **Proof** — Wesaya as first named client (photo + owner quote) ONLY once live with permission; until then a neutral "built with a working Egyptian fried-chicken restaurant" line.
7. **Pricing/contact** — no public pricing in V1; CTA-driven.
8. **Footer** — City Baker LLC legal, links to /privacy, /terms, /data-deletion.
Support pages: **/demo** + the legal pages. Nothing else in V1.

## 4. The CTA — eat our own cooking
Primary CTA everywhere: **«جرّب كريم على واتساب» / "Try Karim on WhatsApp"** — a wa.me link into a demo tenant where Karim takes a fake order in 60 seconds. The demo IS the pitch. Secondary CTA: "Book a call" (calendar link).
*Dependency: dedicated demo tenant + number — flag as the one build-adjacent item; use a placeholder wa.me link constant until Mohamed provides the demo number.*

## 5. Claim-language rules (locked)
- ✅ "Works alongside your POS" · ❌ "POS integration"
- ✅ "Order truth, customer memory, cash reconciliation" · ❌ "AI insights/analytics" (until real)
- ✅ "Deterministic allergy safety — escalates to your staff" · ❌ anything implying medical assurances
- KSA facts: "cash on delivery + online payments (coming to KSA)" until Moyasar is live
- No fabricated logos, testimonials, or metrics. Empty proof > fake proof.

## 6. Design direction
Extend the existing Kivo/Karim design language (terracotta/quiet-luxury explored in the project's design files) — warm, food-adjacent, premium-but-approachable; NOT generic SaaS blue. Real Arabic screenshots, anonymized conversation snippets, Readex Pro / Noto Sans Arabic (the app's existing stack). Fast static build on the existing Next.js app — the landing route already exists at `/` per middleware host mapping: this is a redesign, not new infrastructure.

## 7. Success metrics
WhatsApp-demo starts/week, call bookings, AR:EN split, KSA:EG split. No vanity metrics.

## 8. Resolved decisions (Mohamed)
1. Strictly shipped-features-only (no roadmap teaser).
2. Wesaya naming: neutral line until explicit permission.
3. Demo tenant: placeholder link constant for now; provisioning is a separate follow-up.
