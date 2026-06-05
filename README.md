# MaitreAI — موظف واتساب الذكي للمطاعم

WhatsApp-first AI order management system for restaurants. This repository is
the **Sprint 1 MVP App Foundation** — the approved Claude Design converted into a
clean, scalable Next.js app. Arabic RTL, premium bright SaaS style, **mock data only**.

> ⚠️ This sprint contains **no real integrations**. WhatsApp, AI, payment, and
> backend are all mocked/placeholders. See _Known Limitations_ below.

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
