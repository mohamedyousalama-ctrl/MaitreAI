"use client";

// ============================================================================
// Kivo — kitchen-ticket print control (client). Lets the operator pick the
// thermal width (58mm | 80mm) and print. On print it FIRST records the
// `order_events` ticket_printed audit (POST /api/orders/[id]/ticket-print),
// then calls window.print(). A failed audit is logged but never blocks the
// print — the kitchen getting its ticket is the operator's action, not gated
// on the audit write. This whole control is `.kt-no-print` (hidden in print).
// ============================================================================

import { useState } from "react";
import { Printer } from "lucide-react";

type Width = "58mm" | "80mm";

// Keep the print width in sync with the rendered ticket (CSS var) AND the @page
// box, so the preview and the actual print match the chosen paper.
function applyWidth(w: Width) {
  const root = document.getElementById("kitchen-ticket");
  if (root) root.style.setProperty("--kt-width", w);
  let pageStyle = document.getElementById("kt-page-style");
  if (!pageStyle) {
    pageStyle = document.createElement("style");
    pageStyle.id = "kt-page-style";
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = `@page { size: ${w} auto; margin: 3mm; }`;
}

export function PrintTicketButton({ orderId }: { orderId: string }) {
  const [width, setWidth] = useState<Width>("80mm");
  const [busy, setBusy] = useState(false);

  function pick(w: Width) {
    setWidth(w);
    applyWidth(w);
  }

  async function print() {
    if (busy) return;
    setBusy(true);
    applyWidth(width);
    try {
      const res = await fetch(`/api/orders/${orderId}/ticket-print`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ width }),
      });
      if (!res.ok) console.error("[kitchen-ticket] audit write failed", res.status);
    } catch (e) {
      // Never block the print on the audit — log and continue.
      console.error("[kitchen-ticket] audit request threw", e);
    } finally {
      setBusy(false);
      // Defer so the audit toast/state settles before the print dialog steals focus.
      setTimeout(() => window.print(), 0);
    }
  }

  const pill = (w: Width, label: string) => (
    <button
      type="button"
      onClick={() => pick(w)}
      aria-pressed={width === w}
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        border: "1.5px solid",
        borderColor: width === w ? "#b5502e" : "#d8ccbf",
        background: width === w ? "#b5502e" : "transparent",
        color: width === w ? "#fff" : "#6a5c4e",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="kt-no-print"
      style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#9b8b7c" }}>عرض الورق:</span>
      {pill("58mm", "٥٨ مم")}
      {pill("80mm", "٨٠ مم")}
      <button
        type="button"
        onClick={print}
        disabled={busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 18px",
          borderRadius: 10,
          border: "none",
          background: "#2a211b",
          color: "#fff",
          fontWeight: 800,
          fontSize: 14,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
          marginInlineStart: "auto",
        }}
      >
        <Printer size={16} />
        {busy ? "جارٍ التسجيل…" : "طباعة التذكرة"}
      </button>
    </div>
  );
}
