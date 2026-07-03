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

// Set the printed roll width by driving the ticket element's own width (CSS var,
// border-box). We deliberately do NOT emit `@page { size: <w> auto }` — a length
// paired with `auto` is not a valid @page size and strict browsers drop it, and
// pinning an explicit page height would eject blank thermal roll. The element
// width is the single source of truth for how wide the ticket prints.
function applyWidth(w: Width) {
  const root = document.getElementById("kitchen-ticket");
  if (root) root.style.setProperty("--kt-width", w);
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
