# MaitreAI — PRD AMENDMENT 01 (overrides MAITREAI_PRD_AND_BACKLOG.md where stated)

> Status: APPROVED by owner. Apply from Sprint 7 onward. Where this file conflicts
> with the base PRD, THIS FILE WINS. Claude Code: commit this file to the repo root
> and treat it as part of the PRD in every future sprint session.

---

## A1. Dialect selection: Saudi or Egyptian (modifies Sprint 8 + Sprint 10)

- Onboarding Step 1 adds a required choice: **لهجة الموظف الذكي** — two large cards:
  🇸🇦 **سعودي/خليجي** and 🇪🇬 **مصري**. Stored as `restaurants.dialect` (`saudi` | `egyptian`).
- Effects:
  - Brain system prompt loads a dialect pack (vocabulary, phrasing examples, greeting
    style). Saudi pack: "أبشر، يعطيك العافية، وش طلبك". Egyptian pack: "تحت أمرك،
    تؤمر، عايز تطلب إيه".
  - Defaults: Saudi → currency ر.س, weekend Fri–Sat; Egyptian → currency ج.م,
    weekend Fri–Sat (Egypt) — still editable.
  - The live persona preview (onboarding step 6) renders samples in the chosen dialect.
- Changeable later in Settings → AI tone. Schema already has `dialect`; constrain the
  enum to these two values for launch (architecture stays open for more later).

## A2. Menu auto-sync from the Menu page (extends Sprint 10 task 3)

- The AI menu ingestion is NOT onboarding-only. The **Menu page** gets a permanent
  **"مزامنة المنيو"** button accepting: photos (multiple), PDF, and spreadsheets
  (.xlsx / .csv / Google-Sheets-exported files).
- Pipeline: upload → Supabase Storage → `/api/brain/ingest-menu` (vision for
  images/PDF, parser+Brain mapping for sheets) → **diff-aware review grid**:
  - NEW items (highlighted green), CHANGED items (price/description diffs shown),
    POSSIBLY REMOVED items (in upload's scope but missing → owner decides),
    UNTOUCHED items left alone. No duplicates are ever created silently.
  - Owner edits inline, then **اعتماد** applies everything in one transaction.
- Onboarding step 2 reuses this exact component (single source of truth).
- Acceptance addition: re-uploading the same menu produces ZERO proposed changes.

## A3. REMOVE Kitchen module → Printer-first kitchen flow (modifies base PRD globally)

- The **المطبخ board page is removed** from navigation and scope. `KitchenBoard` /
  `KitchenTicket` components and the kitchen page are deleted; `kitchen_status`
  simplifies into `order_status` transitions managed from the **Orders page**
  (buttons: بدء التحضير / جاهز / خرج للتوصيل / اكتمل — these still trigger customer
  WhatsApp templates per Sprint 9).
- **Kitchen ticket printing (new, Sprint 9 scope addition):**
  - Every order that becomes paid/confirmed auto-prints an **80mm thermal ticket**:
    order number large, time, branch, fulfillment, items + modifiers + notes
    (Arabic RTL, large font), customer name/phone, address/zone for delivery, total +
    payment method (COD vs paid).
  - **Connection method:** integrate **QZ Tray** (free, cross-platform) as the print
    bridge — the restaurant installs it once on the till PC; it exposes ALL printers
    (USB cable, Bluetooth, network/Wi-Fi) to the web app for silent printing,
    including raw ESC/POS for thermal printers.
  - Settings → new **"الطابعة"** card: detect printers via QZ Tray, pick kitchen
    printer, toggle auto-print on new paid order, "طباعة تجريبية" test button, and a
    plain-Arabic install guide for QZ Tray (with download link) for non-technical staff.
  - **Fallback:** if QZ Tray is not connected, a "طباعة" button on each order opens
    the browser print dialog with the same 80mm-formatted ticket. The app must remain
    fully usable with no printer at all.
  - Reprint button on every order; print events logged to `order_events`.

## A4. Restaurant open/closed + hours-aware agent (adds to Sprint 8 + Sprint 9)

- **Master switch** in the topbar: مفتوح 🟢 / مغلق 🔴 per restaurant (managers only),
  stored as `restaurants.is_open` + optional `closed_message` override. Separate from
  the Sprint 9 "service paused" switch (paused = agent silent; closed = agent replies
  but takes no orders).
- **Hours awareness:** on EVERY inbound message the Brain checks: master switch +
  current time vs branch hours (timezone-aware, prayer-pause aware).
  - Outside hours / closed: polite dialect-correct reply — e.g. "نعتذر منك 🌙 المطعم
    مغلق حالياً، نفتح الساعة ١١ صباحاً. تقدر ترسل طلبك ونجهزه أول ما نفتح؟" — order
    intent is parked as a **pre-order draft** if the owner enables "قبول الطلبات
    المسبقة" (Settings toggle, default OFF).
  - Informational questions (menu, location, hours) are still answered while closed.
- The agent never confirms an order for immediate prep while closed.
- Acceptance: messaging the test number outside configured hours returns the closed
  reply with the correct reopening time; flipping the master switch changes behavior
  within seconds.

## A5. User roles & permissions (modifies Sprint 7 schema + all UIs)

- `members.role` enum is exactly: **`manager`** and **`operation`** for launch
  (the base PRD's owner/manager/staff trio is replaced).
- **manager** — full access: everything, including settings, Brain, promotions,
  WhatsApp/payment config, team management (invite/remove members by phone/email),
  open/close switch, NL admin write commands.
- **operation** — day-to-day only:
  - CAN: view/respond in Conversations (human takeover), manage order statuses,
    print/reprint tickets, toggle menu item availability (متوفر/غير متوفر) ONLY,
    view dashboard, read-only NL questions.
  - CANNOT: edit menu/prices, promotions, branches, zones, policies, AI tone,
    settings, team, billing, open/close master switch, any NL write command.
- Enforced in THREE layers: RLS policies, server route checks, and UI hiding.
  Team management screen lives in Settings → **"الفريق"** (manager only).
- Acceptance: an operation account verifiably cannot perform any restricted action
  via UI OR direct API call.

## A6. Platform: responsive web app only (clarifies base PRD)

- MaitreAI ships as a **web app** (the current Next.js app), fully responsive — owners
  onboard and operate from phone browsers; no native iOS/Android apps for launch.
- All new screens (onboarding, printer settings, team, command bar) must pass a
  mobile-width check before a sprint is accepted.

---

## Sprint impact summary

| Sprint | Changes |
|---|---|
| 7 | Roles = manager/operation (A5) in schema + RLS; `is_open`, `closed_message`, pre-order toggle columns (A4); drop kitchen board from scope |
| 8 | Dialect packs saudi/egyptian in prompts (A1); open/closed + hours check on every turn, pre-order parking (A4) |
| 9 | QZ Tray printing + printer settings card + auto-print on paid order + fallback print (A3); closed-reply behavior live on WhatsApp (A4) |
| 10 | Dialect step 1 (A1); menu sync component shared with Menu page, diff-aware (A2); team setup step optional (A5); all steps mobile-checked (A6) |
| 11 | Command bar respects roles — operation = read-only (A5) |
| 12 | QA matrix runs in BOTH dialects (A1); load test includes print events |
