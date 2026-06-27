"use client";

// ============================================================================
// MaitreAI — critical-failure banner (operator console). Manager-visible.
// Polls /api/alerts for ACTIVE (non-dismissed) system_alerts and shows a
// persistent red banner per failure: what failed, when, and (if applicable) a
// link to the conversation. Dismiss → POST /api/alerts/dismiss. Truth-system:
// it renders ONLY real recorded failures — it never invents a test alert.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { useRole } from "@/lib/use-role";

interface Alert {
  id: string;
  type: string;
  detail: string | null;
  conversation_id: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  agent_error: "تعذّر رد كريم (خطأ في المساعد)",
  whatsapp_send_failed: "فشل إرسال رسالة واتساب",
  inbound_persist_failed: "فشل حفظ رسالة واردة",
};

const POLL_MS = 30000;

function timeAr(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  } catch {
    return iso;
  }
}

export function AlertBanner() {
  const role = useRole();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/alerts", { cache: "no-store" });
      if (r.ok) setAlerts(((await r.json()).alerts ?? []) as Alert[]);
    } catch {
      /* network hiccup — keep last state, no fake data */
    }
  }

  useEffect(() => {
    if (role !== "manager") return;
    let alive = true;
    load();
    const t = setInterval(() => alive && load(), POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [role]);

  async function dismiss(id: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/alerts/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.ok) setAlerts((a) => a.filter((x) => x.id !== id));
    } finally {
      setBusy(null);
    }
  }

  if (role !== "manager" || alerts.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 24px 0" }}>
      {alerts.map((a) => (
        <div
          key={a.id}
          role="alert"
          style={{
            display: "flex", alignItems: "center", gap: 11,
            borderRadius: 12, padding: "10px 14px",
            background: "rgba(192,73,47,.08)", border: "1px solid rgba(192,73,47,.32)",
          }}
        >
          <AlertTriangle size={18} style={{ flex: "none", color: "#c0492f" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#a83a22" }}>
              {TYPE_LABEL[a.type] ?? a.type}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--kv-muted)", marginInlineStart: 8 }}>
              {timeAr(a.created_at)}
            </span>
            {a.detail && (
              <div style={{ fontSize: 11.5, color: "var(--kv-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.detail}
              </div>
            )}
          </div>
          {a.conversation_id && (
            <Link
              href={`/conversations?c=${a.conversation_id}`}
              style={{ flex: "none", fontSize: 12, fontWeight: 800, color: "#a83a22", textDecoration: "none" }}
            >
              افتح المحادثة
            </Link>
          )}
          <button
            onClick={() => dismiss(a.id)}
            disabled={busy === a.id}
            aria-label="إخفاء التنبيه"
            style={{ flex: "none", display: "grid", placeItems: "center", width: 28, height: 28, border: 0, borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--kv-muted)" }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
