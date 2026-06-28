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
  order_persist_failed: "فشل حفظ الطلب (مطلوب متابعة يدوية)",
  receipt_send_failed: "فشل إرسال الإيصال للعميل",
  cod_capture_failed: "فشل تسجيل تحصيل الكاش (COD)",
  operator_send_failed: "فشل إرسال رسالة الموظف عبر واتساب",
  delivered_without_driver_override: "تسليم بدون مندوب (تأكيد مدير — تحقّق فشل)",
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
  const [degraded, setDegraded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/alerts", { cache: "no-store" });
      if (r.ok) {
        // Healthy path (alertSystemStatus:"ok") — refresh the list, clear degraded.
        setAlerts(((await r.json()).alerts ?? []) as Alert[]);
        setDegraded(false);
      } else {
        // Q3 — 503/degraded (or any non-OK): alerting is down. Show the degraded
        // banner instead of a false all-clear. Keep the last-known alerts visible.
        setDegraded(true);
      }
    } catch {
      // Can't even reach /api/alerts → alerting is unverifiable; fail loud.
      setDegraded(true);
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

  if (role !== "manager") return null;
  if (alerts.length === 0 && !degraded) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 24px 0" }}>
      {/* Q3 — distinct degraded state: alerting itself is down (not "all clear"). */}
      {degraded && (
        <div
          role="alert"
          style={{
            display: "flex", alignItems: "center", gap: 11,
            borderRadius: 12, padding: "10px 14px",
            background: "rgba(216,151,43,.12)", border: "1px solid rgba(216,151,43,.40)",
          }}
        >
          <AlertTriangle size={18} style={{ flex: "none", color: "var(--kv-amber)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#9a6a14" }}>
              تنبيه: نظام التنبيهات مش شغّال صح — راجِع الدعم
            </span>
            <div style={{ fontSize: 11.5, color: "var(--kv-muted)", marginTop: 2 }}>
              ممكن تكون فيه أعطال غير ظاهرة دلوقتي. هنحاول نوصل تاني تلقائياً.
            </div>
          </div>
        </div>
      )}
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
