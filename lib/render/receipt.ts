// ============================================================================
// MaitreAI — Receipt + kitchen-ticket PNG renderer (Sprint 9, S9-3) — SERVER ONLY
// Renders Arabic-RTL-correct order images with @resvg/resvg-js. We build the SVG
// by hand and let resvg (rustybuzz) do the real Arabic shaping + bidi — satori
// does NOT shape Arabic (renders disconnected, reversed glyphs), so it is not
// used. Noto Sans Arabic carries the script; Readex Pro is the Latin/symbol
// fallback (#, ×). EVERY number comes from the order row (DB) — never the LLM.
// ============================================================================

import { readFileSync } from "fs";
import { join } from "path";
import { Resvg } from "@resvg/resvg-js";

// --- fonts (loaded + cached once) -------------------------------------------
const FONT_DIR = join(process.cwd(), "public", "fonts");
let fontFilesCache: string[] | null = null;
function fontFiles(): string[] {
  if (!fontFilesCache) {
    fontFilesCache = [join(FONT_DIR, "NotoSansArabic-Regular.ttf"), join(FONT_DIR, "ReadexPro.ttf")];
    // Touch them once so a missing file fails loudly here, not mid-render.
    for (const f of fontFilesCache) readFileSync(f);
  }
  return fontFilesCache;
}

function rasterize(svg: string, width: number): Buffer {
  const r = new Resvg(svg, {
    background: "white",
    fitTo: { mode: "width", value: width * 2 }, // 2× for crisp output
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Noto Sans Arabic" },
  });
  return Buffer.from(r.render().asPng());
}

// --- data shape (decoupled from the DB row) ---------------------------------
export interface ReceiptItem {
  name: string;
  quantity: number;
  modifiers: string[];
  total: number;
  notes?: string;
}
export interface ReceiptData {
  restaurantName: string;
  orderNumber: string;
  fulfillment: "delivery" | "pickup";
  items: ReceiptItem[];
  subtotal: number;
  deliveryFee: number;
  discountTotal?: number;
  total: number;
  currency: string;
  paymentStatus?: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  branchName?: string;
  createdAt?: string;
}

// --- helpers ----------------------------------------------------------------
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Force an LTR run (order numbers, "#1048") so neutrals like # don't jump sides
// inside the surrounding RTL text. U+202A LRE … U+202C PDF.
const ltr = (s: string) => `‪${s}‬`;
const money = (n: number, cur: string) => `${Math.round(Number(n) * 100) / 100} ${cur}`;
const FULFILL_AR = { delivery: "توصيل", pickup: "استلام" } as const;
const PAYMENT_AR: Record<string, string> = {
  paid: "مدفوع",
  unpaid: "غير مدفوع",
  cod: "الدفع عند الاستلام",
  pending: "بانتظار الدفع",
};

function fmtDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const mer = h < 12 ? "ص" : "م";
  h = h % 12 || 12;
  return `${dd}/${mm} · ${h}:${min} ${mer}`;
}

// Width presets. Thermal widths print clean on the rolls restaurants actually
// own; "standard" is for A4/letter or a phone share-sheet. The strategy stays
// device-OS print (browser dialog / share sheet) + the PNG — no driver code.
export type ReceiptWidth = "58mm" | "80mm" | "standard";
export const RECEIPT_WIDTHS: Record<ReceiptWidth, number> = { "58mm": 384, "80mm": 576, standard: 600 };
export function toReceiptWidth(v: string | null | undefined): ReceiptWidth {
  return v === "58mm" || v === "80mm" ? v : "standard";
}

/** Per-width layout context: scaled SVG text/line helpers (RTL aware). */
function layout(width: ReceiptWidth) {
  const W = RECEIPT_WIDTHS[width];
  const k = W / 600; // scale the 600px base design down for narrow rolls
  const s = (n: number) => Math.round(n * k);
  const PAD = s(40);
  const RIGHT = W - PAD;
  const LEFT = PAD;
  const t = (x: number, anchor: string, y: number, text: string, size: number, fill: string, weight: number) =>
    `<text x="${x}" y="${y}" font-family="Noto Sans Arabic" font-size="${s(size)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(text)}</text>`;
  return {
    W,
    s,
    PAD,
    tRight: (y: number, text: string, size: number, fill: string, weight = 400) => t(RIGHT, "end", y, text, size, fill, weight),
    tLeft: (y: number, text: string, size: number, fill: string, weight = 400) => t(LEFT, "start", y, text, size, fill, weight),
    tMid: (y: number, text: string, size: number, fill: string, weight = 400) => t(W / 2, "middle", y, text, size, fill, weight),
    rule: (y: number, color = "#e4d8c8") => `<line x1="${LEFT}" y1="${y}" x2="${RIGHT}" y2="${y}" stroke="${color}" stroke-width="1.5"/>`,
  };
}

// --- customer receipt (branded) ---------------------------------------------
export function buildReceiptSvg(d: ReceiptData, width: ReceiptWidth = "standard"): { svg: string; width: number } {
  const { W, s, PAD, tRight, tLeft, tMid, rule } = layout(width);
  const parts: string[] = [];
  let y = s(80);
  parts.push(tMid(y, d.restaurantName, 38, "#2a211b", 600));
  y += s(34);
  parts.push(tMid(y, `إيصال طلب · ${ltr(d.orderNumber)}`, 20, "#b5502e", 500));
  y += s(26);
  parts.push(tMid(y, `${FULFILL_AR[d.fulfillment]} · ${fmtDate(d.createdAt)}`, 18, "#9b8b7c"));
  y += s(28);
  parts.push(rule(y));
  y += s(36);

  for (const it of d.items) {
    parts.push(tRight(y, `${it.quantity}×  ${it.name}`, 26, "#2a211b", 500));
    parts.push(tLeft(y, money(it.total, d.currency), 26, "#2a211b", 500));
    y += s(34);
    if (it.modifiers?.length) {
      parts.push(tRight(y, it.modifiers.join("، "), 20, "#9b8b7c"));
      y += s(28);
    }
    if (it.notes) {
      parts.push(tRight(y, `ملاحظة: ${it.notes}`, 20, "#9b8b7c"));
      y += s(28);
    }
  }

  y += s(6);
  parts.push(rule(y));
  y += s(36);
  const totalsRow = (label: string, amount: string, bold = false) => {
    parts.push(tRight(y, label, bold ? 28 : 22, bold ? "#2a211b" : "#6a5c4e", bold ? 600 : 400));
    parts.push(tLeft(y, amount, bold ? 28 : 22, bold ? "#b5502e" : "#6a5c4e", bold ? 600 : 400));
    y += bold ? s(40) : s(32);
  };
  totalsRow("المجموع الفرعي", money(d.subtotal, d.currency));
  if (d.fulfillment === "delivery") totalsRow("رسوم التوصيل", money(d.deliveryFee, d.currency));
  if (d.discountTotal && d.discountTotal > 0) totalsRow("الخصم", `- ${money(d.discountTotal, d.currency)}`);
  totalsRow("الإجمالي", money(d.total, d.currency), true);

  if (d.paymentStatus) {
    parts.push(tRight(y, `الدفع: ${PAYMENT_AR[d.paymentStatus] ?? d.paymentStatus}`, 20, "#6a5c4e"));
    y += s(30);
  }
  if (d.fulfillment === "delivery" && d.address) {
    parts.push(tRight(y, `العنوان: ${d.address}`, 20, "#6a5c4e"));
    y += s(30);
  }

  y += s(10);
  parts.push(rule(y));
  y += s(36);
  parts.push(tMid(y, `شكراً لطلبك من ${d.restaurantName}`, 20, "#b5502e", 500));
  y += s(30);

  const H = y + PAD;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#faf6ef"/>
<rect x="0" y="0" width="${W}" height="${s(10)}" fill="#b5502e"/>
${parts.join("\n")}
</svg>`;
  return { svg, width: W };
}

// --- kitchen ticket (high-contrast, operator-facing) ------------------------
export function buildKitchenTicketSvg(d: ReceiptData, width: ReceiptWidth = "standard"): { svg: string; width: number } {
  const { W, s, PAD, tRight, tLeft, rule } = layout(width);
  const parts: string[] = [];
  let y = s(70);
  parts.push(tRight(y, `طلب ${ltr(d.orderNumber)}`, 42, "#000", 700));
  parts.push(tLeft(y, FULFILL_AR[d.fulfillment], 30, "#000", 700));
  y += s(32);
  parts.push(tRight(y, fmtDate(d.createdAt), 20, "#444"));
  if (d.customerName) parts.push(tLeft(y, d.customerName, 20, "#444"));
  y += s(22);
  parts.push(rule(y, "#000"));
  y += s(44);

  for (const it of d.items) {
    parts.push(tRight(y, `${it.quantity}×  ${it.name}`, 34, "#000", 700));
    y += s(38);
    if (it.modifiers?.length) {
      parts.push(tRight(y, `+ ${it.modifiers.join("، ")}`, 24, "#333"));
      y += s(30);
    }
    if (it.notes) {
      parts.push(tRight(y, `ملاحظة: ${it.notes}`, 24, "#000", 700));
      y += s(30);
    }
    y += s(6);
  }

  parts.push(rule(y, "#000"));
  y += s(36);
  if (d.fulfillment === "delivery" && d.address) {
    parts.push(tRight(y, `العنوان: ${d.address}`, 22, "#000"));
    y += s(30);
  }
  if (d.customerPhone) {
    parts.push(tRight(y, `الهاتف: ${d.customerPhone}`, 22, "#000"));
    y += s(30);
  }

  const H = y + PAD;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#fff"/>
${parts.join("\n")}
</svg>`;
  return { svg, width: W };
}

export function renderReceiptPng(d: ReceiptData, width: ReceiptWidth = "standard"): Buffer {
  const { svg, width: w } = buildReceiptSvg(d, width);
  return rasterize(svg, w);
}
export function renderKitchenTicketPng(d: ReceiptData, width: ReceiptWidth = "standard"): Buffer {
  const { svg, width: w } = buildKitchenTicketSvg(d, width);
  return rasterize(svg, w);
}
