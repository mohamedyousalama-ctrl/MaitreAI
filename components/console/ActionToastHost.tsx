"use client";

// ============================================================================
// MaitreAI — action-result toast host (Phase R1). Mounted ONCE in the console
// shell; renders the runAction(...) feedback stack. RTL Arabic, Kivo-styled, no
// UI library. a11y: each toast is its own live region — role="status"
// (aria-live="polite") for pending/success, role="alert" (aria-live="assertive")
// for failures — so results are announced to screen readers (Audit-14).
// ============================================================================

import { Loader2, CheckCircle2, AlertTriangle, X, RotateCcw } from "lucide-react";
import { useToastStore } from "@/lib/console-toast";

export function ActionToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;

  return (
    // Positioned overlay; the container itself is NOT a live region (each toast is)
    // to avoid double announcements. pointer-events:none so it never blocks the UI.
    <div
      dir="rtl"
      style={{
        position: "fixed",
        insetInlineStart: 20,
        bottom: 20,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 380,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const failed = t.state === "failed";
        const success = t.state === "success";
        const Icon = failed ? AlertTriangle : success ? CheckCircle2 : Loader2;
        const accent = failed ? "#c0492f" : success ? "#0a8a5f" : "var(--kv-muted)";
        return (
          <div
            key={t.id}
            role={failed ? "alert" : "status"}
            aria-live={failed ? "assertive" : "polite"}
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 13px",
              borderRadius: 12,
              background: failed ? "rgba(192,73,47,.10)" : success ? "rgba(14,159,110,.10)" : "var(--kv-card)",
              border: `1px solid ${failed ? "rgba(192,73,47,.34)" : success ? "rgba(14,159,110,.30)" : "var(--kv-border)"}`,
              boxShadow: "var(--kv-shadow-panel)",
              color: "var(--kv-text)",
            }}
          >
            <Icon
              size={17}
              style={{ flex: "none", color: accent }}
              className={t.state === "pending" ? "kv-spin" : undefined}
            />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700 }}>{t.message}</span>
            {t.retry && (
              <button
                onClick={t.retry}
                style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 5, border: 0, background: "transparent", color: "#c0492f", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                <RotateCcw size={14} /> إعادة المحاولة
              </button>
            )}
            {(failed || success) && (
              <button
                onClick={() => dismiss(t.id)}
                aria-label="إغلاق"
                style={{ flex: "none", display: "grid", placeItems: "center", width: 24, height: 24, border: 0, borderRadius: 7, background: "transparent", cursor: "pointer", color: "var(--kv-muted)" }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
