# MaitreAI — PRD AMENDMENT 04: UI Redesign Spec (Sprint 8.5)

> Status: APPROVED by owner. Extends base PRD + Amendments 01–03. Newest
> wins on conflict. Scope: Sprint 8.5 — rebuild the app SHELL and core
> screens to the approved design direction. This is a presentation-layer
> rebuild on top of the Sprint 7/8 data layer and Brain — keep store/data
> APIs; do not rewrite business logic.
>
> Design sources of truth (commit under /design/ in the repo):
> - design/MaitreAI Hybrid.dc.html — operator console, FINAL (7 sections:
>   legend, manager home ×2 dialects, summoned cards, takeover round-trip,
>   orders pipeline, operation-role variant, desktop/till).
> - design/MaitreAI Chat-Continuation HiFi.dc.html — customer surfaces base
>   (Sprint 11 implements; tokens/image family defined here).
> - design/MaitreAI Directions.dc.html + Customer Directions.dc.html —
>   exploration archives, non-binding.
> Where a design file lags this spec (see M6 design debt), THIS SPEC WINS.

---

## M. Operator app redesign (Sprint 8.5 scope)

### M1. Design language
- Palette: warm hospitality (cream/sand surfaces, charcoal text, warm
  orange/terracotta accents). Escalation/SLA = red-amber family only.
- Type: **Readex Pro** (300–700), Arabic+Latin. Generous Arabic line-height.
- Tone: calm, low-chrome, card-rationed (K3 surface grammar: Thread · Card ·
  Drawer). RTL-first throughout.
- All strings via the terminology constants module per
  ARABIC_LANGUAGE_GUIDE.md; agent = **المساعد** everywhere; header app name
  مساعد المطعم.

### M2. App shell & navigation
- **Mobile (primary):** bottom tabs = الرئيسية · المحادثات · الطلبات ·
  المنيو والذاكرة · الإعدادات (manager). Operation role: المحادثات ·
  الطلبات (+home strip read-only) — items they cannot use are REMOVED,
  not disabled (A5/K2).
- **Pinned Pulse strip** on every main screen (collapses to one line on
  scroll): مفتوح/مغلق toggle · المساعد يعمل/متوقف toggle · تصعيدات count
  with SLA ring + nearest deadline · today's orders + revenue (revenue
  hidden for operation role) · printer + WhatsApp + payment state dots.
  Every value truth-driven (F3); toggles two-tap max, manager-only.
- **System mode banner** (F3): demo/setup/test/live/degraded/paused —
  visually unmissable in non-live modes; live mode shows no banner, only
  the strip.
- **Desktop/till (lg+):** one canvas per design Section F — Pulse strip
  across top, Maître thread left pane, live orders pipeline right pane.
  Same components, reflowed; no separate desktop codepath.

### M3. الرئيسية — the Maître console
- The home IS a conversation with المساعد: greeting per tenant dialect
  (saudi/egyptian packs), proactive line ("عندك ٣ محادثات تبي تدخّلك..."),
  suggestion chips (التصعيدات · أرقام اليوم · اعمل عرض · سكّر المطعم —
  dialect-correct), and a composer ("اكتب أمرك...") wired to the admin
  agent (Sprint 11 enables write-tools; Sprint 8.5 wires read/Q&A +
  navigation intents).
- **Summoned cards** render inline in the thread. Card inventory v1:
  escalation (reason · order ref · customer · AI draft · [تولّ]) ·
  promo draft (items/discount/days/channel · تأكيد/تعديل/إلغاء) ·
  Image Studio result (image · استخدم في الحملة/عدّل/احذف) · menu-item
  edit (price · availability toggle · photo · حفظ/تراجع) · order summary ·
  payment event · error/degraded notice. Cards ONLY for decisions, money,
  confirmations, takeover, status, errors (K3) — everything else is text.

### M4. المحادثات — mobile-first takeover flow
- Structure: inbox list → full-screen chat → context DRAWER (bottom sheet):
  no hidden desktop columns on mobile. Inbox shows owner badge (مساعد/بشري),
  escalation flags, SLA countdowns, dialect-correct previews.
- Chat screen implements Amendment 03 E end-to-end:
  - AI-owned: messages stream; composer reads "اكتب لتتولى المحادثة" —
    typing/sending = takeover (E3).
  - Human-owned: "المساعد متوقف" badge; copilot suggestion bubble above
    composer (tap-to-send/edit, E4); customer thread slides up as overlay
    from an escalation card (matches design Section C).
  - Release: [إعادة للمساعد] → one-line handover summary confirm (E7) +
    "يكمّل المساعد المتابعة تلقائيًا" toggle.
  - Presence for multi-operator (E9): "يرد عليه أحمد الآن".
- Context drawer tabs: المساعد (intent, confidence, sources, risk, debug —
  preserves the existing AI-insights value) · الطلب (draft/active order +
  payment controls) · العميل (profile, history, notes).

### M5. الطلبات — the pipeline (kitchen board removed)
- Four glanceable stages: جديدة → قيد التحضير → جاهزة → خرجت للتوصيل
  (+ مكتملة collapsed). Swipe/big-button to advance; print/reprint on every
  card and in detail; auto-print badge (طباعة تلقائية) reflecting the A3
  toggle; COD/paid marker; late-order highlight feeding the strip count.
- Order detail drawer: items+modifiers+notes, discount lines +
  applied_promotions, customer + address/zone, payment status + link
  controls, status timeline, refund/cancel (manager), reprint.
- DELETE the kitchen page/components and nav entry (A3/K6) in this sprint.
- Operation role: this tab is home; advance + print are primary actions.

### M6. Design debt (carry into the design file when convenient; spec is
already binding): customer-board fixes from review — WhatsApp-primitive
audit annotations, checkout's 3 payment-policy states (H2), digit-style
token default per country (L/§4), interactive prototype. None block 8.5
implementation (customer web surfaces are Sprint 11).

## N. Customer-surface tokens (defined now, implemented Sprint 11)
- Base architecture: Chat-Continuation (B5) — web pages speak the chat's
  bubble language; the seam (order returns INTO WhatsApp) is sacred.
- **Hard perf budget:** first paint ≈1s on 3G; system-font first then brand
  font swap without layout shift; WebP lazy images; one accent color.
- **Tenant theme tokens:** primary color · logo · display font accent
  (e.g. Lalezar=Pop, Amiri=Premium) · dialect · currency · digit style.
  Fixed: skeleton, components, flows. Presets: Street-Food Pop · Premium
  Hospitality · Default — selectable per tenant (B4-adjacent, owner picks
  in onboarding/settings).
- **Rendered-image family** (receipt · order ticket · promo card): one
  visual system sharing tenant tokens, RTL, both dialects, server-rendered
  PNG (B2.5 renderer is the single pipeline).

## O. Sprint 8.5 acceptance criteria
1. Mobile (≤390px) and desktop/till both fully usable; no functionality
   hidden by breakpoint on mobile (conversations = inbox→chat→drawer).
2. Manager vs operation accounts show verifiably different navigation and
   strip behavior; operation UI contains zero locked-feature affordances;
   revenue absent for operation.
3. Pulse strip values change live (flip open/closed, pause المساعد, create
   an escalation → strip updates without refresh) and never display untrue
   states; demo/test modes show their banners; live customer-facing
   surfaces show no demo controls (F3 verified).
4. Takeover round-trip works end-to-end against the real Sprint 8 Brain:
   escalation card → typing takes over + cancels AI → copilot suggestion
   renders → release with summary → المساعد resumes with full context and
   honors a promise made by the human (E7 test).
5. Orders pipeline replaces kitchen entirely (no kitchen routes/nav);
   advance + print/reprint work; auto-print toggle respected; printer-
   offline shows degraded state + browser-print fallback without blocking
   orders (F4).
6. All UI strings come from the terminology module and pass an
   ARABIC_LANGUAGE_GUIDE.md audit (no "بوت/الذكاء/لوحة التحكم/عقل المطعم/
   المطبخ" strings; no hardcoded status claims).
7. `npm run build` clean; existing Sprint 7/8 tests still green (shell
   rebuild must not break the data layer).
