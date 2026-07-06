"use client";

// ============================================================================
// Kivo — kitchen-ticket print control (client). Lets the operator pick the
// thermal width (58mm | 80mm) and print. On print it FIRST records the
// `order_events` ticket_printed audit (POST /api/orders/[id]/ticket-print),
// then prints. A failed audit is logged but never blocks the print.
//
// WO-QZ-PRINT: when the `qz_print` flag is ON and a printer is configured with
// auto_print, the ticket PNG is printed SILENTLY via QZ Tray (no browser dialog).
// A connection truth chip shows QZ state honestly (connected / not proven). If QZ
// is unconfigured, off, or unreachable, we FALL BACK to window.print() — the
// browser dialog is always available and the kitchen ticket is never gated on QZ.
// This whole control is `.kt-no-print` (hidden in print).
// ============================================================================

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { parsePrinterConfig, shouldSilentPrint, type PrinterConfig } from "@/lib/print/printer-config";
import { connectQz, qzStatus, qzPrintImage, type QzStatus } from "@/lib/print/qz-client";

type Width = "58mm" | "80mm";

// Set the printed roll width by driving the ticket element's own width (CSS var,
// border-box). The element width is the single source of truth for print width.
function applyWidth(w: Width) {
  const root = document.getElementById("kitchen-ticket");
  if (root) root.style.setProperty("--kt-width", w);
}

export function PrintTicketButton({ orderId }: { orderId: string }) {
  const [width, setWidth] = useState<Width>("80mm");
  const [busy, setBusy] = useState(false);

  // QZ silent-print state (inert unless the flag is on + a printer configured).
  const [qzEnabled, setQzEnabled] = useState(false);
  const [qzConfig, setQzConfig] = useState<PrinterConfig | null>(null);
  const [qzConn, setQzConn] = useState<QzStatus>("disconnected");

  useEffect(() => {
    let alive = true;
    fetch("/api/settings/printer")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.enabled) return;
        setQzEnabled(true);
        const cfg = parsePrinterConfig(d.config);
        setQzConfig(cfg);
        if (cfg.width === "58mm" || cfg.width === "80mm") { setWidth(cfg.width); applyWidth(cfg.width); }
        // Probe status without forcing a connect (honest "not proven" until proven).
        qzStatus().then((s) => alive && setQzConn(s));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  function pick(w: Width) {
    setWidth(w);
    applyWidth(w);
  }

  async function recordAudit() {
    try {
      const res = await fetch(`/api/orders/${orderId}/ticket-print`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ width }),
      });
      if (!res.ok) console.error("[kitchen-ticket] audit write failed", res.status);
    } catch (e) {
      console.error("[kitchen-ticket] audit request threw", e);
    }
  }

  async function print() {
    if (busy) return;
    setBusy(true);
    applyWidth(width);
    await recordAudit(); // audit first; never blocks the print

    // SILENT path: flag on + printer named + auto_print → try QZ; on ANY failure
    // fall back to the browser dialog. window.print() is always the safety net.
    if (shouldSilentPrint({ flagOn: qzEnabled, config: qzConfig }) && qzConfig) {
      const imageUrl = `${window.location.origin}/api/orders/${orderId}/image?kind=ticket&w=${width}`;
      const ok = await qzPrintImage(qzConfig.name, imageUrl);
      setQzConn(ok ? "connected" : "error");
      setBusy(false);
      if (ok) return; // printed silently — no dialog
    } else {
      setBusy(false);
    }
    // Fallback / default: browser print dialog (deferred so state settles first).
    setTimeout(() => window.print(), 0);
  }

  async function testConnection() {
    setQzConn("disconnected");
    setQzConn(await connectQz());
  }

  const pill = (w: Width, label: string) => (
    <button
      type="button"
      onClick={() => pick(w)}
      aria-pressed={width === w}
      style={{
        padding: "6px 14px", borderRadius: 8, border: "1.5px solid",
        borderColor: width === w ? "#b5502e" : "#d8ccbf",
        background: width === w ? "#b5502e" : "transparent",
        color: width === w ? "#fff" : "#6a5c4e", fontWeight: 700, fontSize: 13, cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  // Truth chip — never claims "connected" until QZ actually reports active.
  const chip = () => {
    const map: Record<QzStatus, { t: string; bg: string; fg: string }> = {
      connected: { t: "الطابعة متصلة", bg: "#e7f4ea", fg: "#1f7a3d" },
      disconnected: { t: "الاتصال غير مثبت", bg: "#fbf3e3", fg: "#8a6d1f" },
      error: { t: "تعذّر الاتصال — سيُطبع عبر المتصفح", bg: "#fdecea", fg: "#a3352a" },
    };
    const c = map[qzConn];
    return (
      <button type="button" onClick={testConnection} title="اختبار اتصال QZ Tray"
        style={{ padding: "5px 12px", borderRadius: 999, border: "none", background: c.bg, color: c.fg, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
        🖨️ {c.t}
      </button>
    );
  };

  return (
    <div className="kt-no-print" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#9b8b7c" }}>عرض الورق:</span>
      {pill("58mm", "٥٨ مم")}
      {pill("80mm", "٨٠ مم")}
      {qzEnabled ? chip() : null}
      <button
        type="button"
        onClick={print}
        disabled={busy}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10,
          border: "none", background: "#2a211b", color: "#fff", fontWeight: 800, fontSize: 14,
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, marginInlineStart: "auto",
        }}
      >
        <Printer size={16} />
        {busy ? "جارٍ الطباعة…" : "طباعة التذكرة"}
      </button>
    </div>
  );
}
