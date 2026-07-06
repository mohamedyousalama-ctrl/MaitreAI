"use client";

// ============================================================================
// Kivo (KSA) — WO-QZ-PRINT: printer settings card (console). Manager picks the
// QZ Tray printer + width + auto_print for SILENT kitchen-ticket printing. Only
// renders when the qz_print flag is on (the route reports enabled:false → the
// card shows an off state). Listing printers connects to QZ Tray (unsigned dev
// prompt V1); a truth chip shows the connection state honestly. The browser
// print dialog is always available regardless of this card.
// ============================================================================

import { useEffect, useState } from "react";
import { SettingsCard } from "@/components/ui/SettingsCard";
import { Printer } from "lucide-react";
import { parsePrinterConfig, PRINT_WIDTHS, type PrinterConfig, type PrintWidth } from "@/lib/print/printer-config";
import { connectQz, listQzPrinters, type QzStatus } from "@/lib/print/qz-client";

export function QzPrinterCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [config, setConfig] = useState<PrinterConfig>({ name: "", width: "80mm", auto_print: false });
  const [printers, setPrinters] = useState<string[]>([]);
  const [conn, setConn] = useState<QzStatus>("disconnected");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/printer")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) { setEnabled(false); return; }
        setEnabled(!!d.enabled);
        if (d.enabled && d.config) setConfig(parsePrinterConfig(d.config));
      })
      .catch(() => setEnabled(false));
  }, []);

  async function scan() {
    setConn("disconnected");
    const s = await connectQz();
    setConn(s);
    if (s === "connected") setPrinters(await listQzPrinters());
  }

  async function save(patch: Partial<PrinterConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    setSaving(true);
    try {
      await fetch("/api/settings/printer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next.name, width: next.width, auto_print: next.auto_print }),
      });
    } catch { /* best-effort; card stays usable */ }
    finally { setSaving(false); }
  }

  if (enabled === null) return null; // still loading
  if (!enabled) {
    return (
      <SettingsCard icon={Printer} title="الطباعة الصامتة (QZ Tray)">
        <p style={{ fontSize: 13, color: "#9b8b7c" }}>الميزة غير مُفعّلة لهذا الحساب.</p>
      </SettingsCard>
    );
  }

  const chipText: Record<QzStatus, string> = {
    connected: "متصل بـ QZ Tray",
    disconnected: "غير متصل — اضغط بحث",
    error: "تعذّر الاتصال بـ QZ Tray",
  };

  return (
    <SettingsCard icon={Printer} title="الطباعة الصامتة (QZ Tray)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={scan}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #d8ccbf", background: "transparent", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            بحث عن الطابعات
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: conn === "connected" ? "#1f7a3d" : conn === "error" ? "#a3352a" : "#8a6d1f" }}>
            {chipText[conn]}
          </span>
        </div>

        <label style={{ fontSize: 13, fontWeight: 700, color: "#6a5c4e" }}>
          الطابعة
          <select
            value={config.name}
            onChange={(e) => save({ name: e.target.value })}
            style={{ display: "block", marginTop: 6, width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #d8ccbf" }}
          >
            <option value="">— اختر طابعة —</option>
            {config.name && !printers.includes(config.name) ? <option value={config.name}>{config.name}</option> : null}
            {printers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          {(PRINT_WIDTHS as readonly PrintWidth[]).map((w) => (
            <button key={w} type="button" onClick={() => save({ width: w })} aria-pressed={config.width === w}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid",
                borderColor: config.width === w ? "#b5502e" : "#d8ccbf",
                background: config.width === w ? "#b5502e" : "transparent",
                color: config.width === w ? "#fff" : "#6a5c4e", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {w === "58mm" ? "٥٨ مم" : "٨٠ مم"}
            </button>
          ))}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, color: "#6a5c4e", cursor: "pointer" }}>
          <input type="checkbox" checked={config.auto_print} onChange={(e) => save({ auto_print: e.target.checked })} />
          طباعة صامتة تلقائية (بدون نافذة المتصفح)
        </label>

        <p style={{ fontSize: 11.5, color: "#9b8b7c", margin: 0 }}>
          {saving ? "جارٍ الحفظ…" : "يتطلب تشغيل تطبيق QZ Tray على جهاز الطباعة. عند غياب الاتصال تُطبع التذكرة عبر نافذة المتصفح."}
        </p>
      </div>
    </SettingsCard>
  );
}
