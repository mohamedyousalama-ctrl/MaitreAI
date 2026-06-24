"use client";

// Kivo console sidebar (SPEC 02 §2a). 226px, right side in RTL. Brand + real
// tenant/branch, nav with live intervention counts (never hardcoded), and the
// agent status card with a pause toggle bound to the ops-store (local-only for
// now — see TODO).

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LineChart,
  MessagesSquare,
  ClipboardList,
  Users,
  Settings,
  Bell,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { useOrderStore } from "@/lib/order-store";
import { useConversationStore } from "@/lib/conversation-store";
import { countEscalations } from "@/lib/escalation";
import { useOpsStore } from "@/lib/ops-store";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { StatePill } from "@/components/kivo";
import { KivoMark } from "@/components/brand/KivoLogo";
import type { OrderStatusKey } from "@/lib/types";

const ACTIVE: OrderStatusKey[] = [
  "pending_confirmation",
  "pending_payment",
  "paid",
  "preparing",
  "ready",
  "out_for_delivery",
];

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number) => String(n).replace(/[0-9]/g, (d) => AR[+d]);

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 11,
        height: 40,
        padding: "0 12px",
        borderRadius: 13,
        fontSize: 13.5,
        fontWeight: 700,
        textDecoration: "none",
        color: active ? "var(--kv-deep)" : "var(--kv-muted)",
        background: active
          ? "linear-gradient(90deg,rgba(14,159,110,.14),rgba(14,159,110,.04))"
          : "transparent",
      }}
    >
      {active && (
        <span
          aria-hidden
          style={{ position: "absolute", insetInlineStart: 0, top: 8, bottom: 8, width: 3, borderRadius: 99, background: "var(--kv-primary)" }}
        />
      )}
      <Icon size={18} strokeWidth={2.1} style={{ flex: "none" }} />
      <span style={{ flex: 1 }}>{label}</span>
      {!!badge && badge > 0 && (
        <span
          style={{
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 99,
            background: "var(--kv-red)",
            color: "#fff",
            fontSize: 10.5,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {toAr(badge)}
        </span>
      )}
    </Link>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-faint)", padding: "0 12px", margin: "16px 0 7px" }}>
      {children}
    </div>
  );
}

export function ConsoleSidebar() {
  const pathname = usePathname();
  const hydrated = useHasHydrated();

  const orders = useOrderStore((s) => s.orders);
  const conversations = useConversationStore((s) => s.conversations);
  const profileName = useRestaurantStore((s) => s.profile.name);
  const branches = useRestaurantStore((s) => s.branches);
  const agentEnabled = useOpsStore((s) => s.agentEnabled);
  const setAgentEnabled = useOpsStore((s) => s.setAgentEnabled);

  const escalations = hydrated ? countEscalations(conversations) : 0;
  const activeOrders = hydrated ? orders.filter((o) => ACTIVE.includes(o.orderStatus)).length : 0;
  // Orders needing human = orders whose source conversation is escalated.
  const escalatedConvIds = new Set(
    conversations.filter((c) => c.owner === "human" || c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف").map((c) => c.id)
  );
  const ordersNeedingHuman = hydrated
    ? orders.filter((o) => o.conversationId && escalatedConvIds.has(o.conversationId) && ACTIVE.includes(o.orderStatus)).length
    : 0;

  const tenantName = hydrated ? profileName : "Kivo";
  const branchName = hydrated && branches[0]?.name ? branches[0].name : "";

  const is = (p: string) => pathname === p || pathname?.startsWith(p + "/");

  return (
    <aside
      className="kv-scroll"
      style={{
        width: 226,
        flex: "none",
        height: "100%",
        overflowY: "auto",
        background: "linear-gradient(180deg,#ffffff,#f6faf8)",
        borderLeft: "1px solid var(--kv-border)",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Brand + real tenant */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "0 4px" }}>
        <div style={{ width: 42, height: 42, borderRadius: 14, background: "var(--kv-grad-brand)", display: "grid", placeItems: "center", flex: "none", boxShadow: "0 12px 22px -14px rgba(10,138,95,.8)" }}>
          <KivoMark size={24} tone="white" title="Kivo" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "var(--kv-text)", lineHeight: 1.1 }}>Kivo</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--kv-faint)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {tenantName}
            {branchName ? ` · ${branchName}` : ""}
          </div>
        </div>
      </div>

      <GroupLabel>الوكيل</GroupLabel>
      <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <NavLink href="/dashboard" icon={LayoutDashboard} label="الرئيسية" active={is("/dashboard")} />
        <NavLink href="/insights" icon={LineChart} label="الرؤى" active={is("/insights")} />
        <NavLink href="/conversations" icon={MessagesSquare} label="المحادثات" active={is("/conversations")} badge={escalations} />
        <NavLink href="/orders" icon={ClipboardList} label="الطلبات" active={is("/orders")} />
        <NavLink href="/customers" icon={Users} label="العملاء" active={is("/customers")} />
        <NavLink href="/settings" icon={Settings} label="الربط والإعدادات" active={is("/settings")} />
      </nav>

      <GroupLabel>تشغيل</GroupLabel>
      <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <NavLink href="/conversations" icon={Bell} label="التنبيهات" badge={escalations} />
        {/* التعلّم — coming-soon, non-navigating (learning depth is V2). */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, height: 40, padding: "0 12px", borderRadius: 13, color: "var(--kv-faint)", cursor: "default" }}>
          <GraduationCap size={18} strokeWidth={2.1} style={{ flex: "none" }} />
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>التعلّم</span>
          <StatePill state="coming" />
        </div>
      </nav>

      {/* Agent status card */}
      <div
        style={{
          marginTop: "auto",
          background: "var(--kv-primary-tint)",
          border: "1px solid rgba(14,159,110,.18)",
          borderRadius: 14,
          padding: "13px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className={agentEnabled ? "kv-pulse" : undefined}
            aria-hidden
            style={{ width: 8, height: 8, borderRadius: "50%", background: agentEnabled ? "var(--kv-primary)" : "var(--kv-faint)", flex: "none" }}
          />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--kv-text)", flex: 1 }}>
            {agentEnabled ? "كريم نشط" : "كريم متوقف مؤقتاً"}
          </span>
          {/* Pause toggle → ops-store (client). TODO: sync to backend agent_mode. */}
          <button
            type="button"
            role="switch"
            aria-checked={agentEnabled}
            aria-label="إيقاف مؤقت لكريم"
            onClick={() => setAgentEnabled(!agentEnabled)}
            style={{
              width: 38,
              height: 22,
              borderRadius: 99,
              border: 0,
              cursor: "pointer",
              padding: 0,
              position: "relative",
              background: agentEnabled ? "var(--kv-primary)" : "#cdd9d2",
              transition: "background .15s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                insetInlineStart: agentEnabled ? 19 : 3,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                transition: "inset-inline-start .15s",
              }}
            />
          </button>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--kv-muted)", marginTop: 8, lineHeight: 1.5 }}>
          {toAr(activeOrders)} طلب نشط دلوقتي · {toAr(ordersNeedingHuman)} محتاج تدخّل
        </div>
      </div>
    </aside>
  );
}
