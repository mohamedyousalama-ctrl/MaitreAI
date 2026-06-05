# MaitreAI — موظف واتساب الذكي للمطاعم

WhatsApp-first AI order management system for restaurants.

- **Sprint 1** — MVP App Foundation: the approved Claude Design converted into a
  clean, scalable Next.js app (Arabic RTL, premium SaaS style).
- **Sprint 2** — Restaurant Brain Setup + Local CRUD: restaurant configuration
  is now **fully editable and persisted locally** (no backend).
- **Sprint 3** — Conversation State + AI Intent Mock Engine: the Conversations
  page is now **interactive and intelligent** using local rule-based logic that
  reads the editable Restaurant Brain (no real AI / WhatsApp / network).
- **Sprint 4** — Local Order Engine: conversation draft orders become **real
  persisted orders** that flow through Orders → Kitchen → tracking, with a
  payment **placeholder** (mock link + manual mark-paid). No real payment.

> ⚠️ Still **no real integrations**. WhatsApp, AI, payment, and backend are
> mocked/placeholders. See _Known Limitations_ below.

## Order engine (Sprint 4)

End-to-end local flow: in **المحادثات** type "أبغى برجر كلاسيك وكولا" → AI builds a
draft → click **تأكيد الطلب** to create a real order (`pending_payment`/`unpaid`).
Use **إرسال رابط دفع تجريبي** then **تأكيد الدفع** (mock) — the conversation
receives system messages at each step. The order appears on **الطلبات** and, once
paid, on **المطبخ**; kitchen actions (بدء التحضير / تجهيز كجاهز / إكمال) advance the
order status and push updates back to the conversation. Asking "وين طلبي؟" replies
with the real current status. Orders, items, statuses, payment, kitchen state, and
events persist to `localStorage` via a dedicated order store.

## Conversation engine (Sprint 3)

Open **المحادثات**, select a customer, and type as the customer (simulation mode):
the local engine detects intent, extracts entities from the live menu/branches/
delivery areas, generates an Arabic reply, scores confidence, lists the knowledge
sources used, updates the conversation status, builds a lightweight **draft order
preview**, and auto-escalates to a human when needed (complaints, allergen gaps,
unknown delivery areas, low confidence, or an explicit "أبغى أكلم موظف").

- **Human takeover** — "تحويل لموظف" switches ownership to a human (AI stops),
  the composer becomes "أنت ترد كموظف"; "إعادة للذكاء الاصطناعي" hands it back.
- **AI insights panel** (right pane) shows intent, confidence, suggested action,
  sources, owner, escalation reason, detected entities, the draft order, and a
  collapsible **AI Debug** JSON view of the raw intent result.
- Conversations, messages, owner, status, confidence, suggested action, and
  intent history persist to `localStorage` via a dedicated Zustand store.

## Editable configuration (Sprint 2)

The owner can configure everything below without touching code; changes persist
to `localStorage` (Zustand `persist`) and survive refresh:

- **Restaurant Profile** (Settings)
- **Branches** — full CRUD (Branches)
- **Menu items** — full CRUD (Menu)
- **Modifiers** — reusable library, attachable to items (Menu → إدارة الإضافات)
- **Ingredients & Allergens** — per item via tag editors (Menu)
- **Delivery Areas** — full CRUD (Restaurant Brain)
- **FAQ** — full CRUD (Restaurant Brain)
- **Policies** — editable text, 5 policies (Restaurant Brain)
- **AI Tone** — personality / length / emoji / language / greeting (Settings)

The **Restaurant Brain score** is computed locally (no AI) from how complete each
area is, and updates live as you edit. "استعادة الافتراضي" in Settings resets all
local data to the seed.

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** (custom module color system)
- **lucide-react** icons
- **IBM Plex Sans Arabic** (next/font), fallback Cairo / Tajawal / system
- Fully **RTL** by default

## Run Locally

```bash
npm install
npm run dev      # http://localhost:3000  → redirects to /dashboard
npm run build    # production build
npm start        # serve production build
```

## Project Structure

```
app/
  layout.tsx            # RTL shell (sidebar + topbar), Arabic font
  page.tsx              # redirects to /dashboard
  dashboard/            # لوحة التحكم
  conversations/        # المحادثات (3-pane WhatsApp workspace)
  orders/               # الطلبات
  kitchen/              # المطبخ (ticket board)
  menu/                 # المنيو
  branches/             # الفروع
  promotions/           # العروض
  restaurant-brain/     # عقل المطعم
  customers/            # العملاء
  ai-review/            # مركز مراجعة الذكاء (placeholder)
  settings/             # الإعدادات

components/
  layout/   AppSidebar, AppTopbar, PageHeader
  ui/       MetricCard, StatusBadge, ModuleCard, EmptyState, SettingsCard,
            PaymentStatusBadge, AIConfidenceBadge, HumanTakeoverButton,
            BranchCard, PromotionCard, CustomerCard
  conversations/  ConversationList, ChatWindow, ChatBubble,
                  CustomerContextPanel, CurrentOrderCard
  orders/         OrderTable, OrderCard
  kitchen/        KitchenBoard, KitchenTicket
  menu/           MenuItemCard
  restaurant-brain/ KnowledgeHealthCard

lib/
  types.ts        # all domain TypeScript types
  mock-data.ts    # centralized mock data (مطعم الذواقة)
  navigation.ts   # sidebar nav + module accent colors
  utils.ts        # cn(), formatCurrency(), formatOrderId()
```

## Module Color System

Dashboard `blue` · Conversations `whatsapp green` · Orders `royal blue` ·
Kitchen `orange` · Menu `teal` · Branches `indigo` · Promotions `purple` ·
Restaurant Brain `emerald` · Customers `cyan` · Settings `slate`.

## What Works

- Sidebar navigation across all pages (active state, accent colors)
- Conversations: live pane switching (list → chat → context), typing indicator,
  AI confidence badges, status badges, current-order card
- Orders: status filtering + clickable rows that open a detail side panel
- Kitchen: 3-column ticket board with timers and payment status
- Menu: category filtering + item cards with visual toggles
- Dashboard: AI daily summary, KPI grid, recent activity, system status
- Branches / Promotions / Customers / Restaurant Brain / Settings render fully

## Placeholder Only

- All toggles/buttons are visual (composer, takeover, payment links, AI tone)
- AI Review Center is a thin placeholder
- "Add new" buttons are non-functional
- No persistence — refreshing resets any client state

## Known Limitations

- No real WhatsApp, AI, payment, or database integration (by design)
- No authentication
- Data is read-only from `lib/mock-data.ts`

## Recommended Next Sprint

**Sprint 2 — Restaurant data model + local CRUD:** introduce a typed data layer
(Zustand/Context or a local DB) so menu, orders, and branches become editable,
preparing for the conversation state engine in Sprint 3.
