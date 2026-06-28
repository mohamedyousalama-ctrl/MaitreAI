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
  variant?: string;
  choices?: string[];
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
  taxAmount?: number; // VAT (0 / undefined when tax-inclusive)
  taxRate?: number;
  taxRegNo?: string;
  total: number;
  currency: string;
  paymentStatus?: string;
  /** "cod" | "vodafone_cash" | … — drives the amount-to-collect vs VF-pending line. */
  paymentMethod?: string;
  /** "whatsapp" | "web" — order source, shown small on the ticket. */
  source?: string;
  /** TRUE when the linked conversation is on an allergy/safety hold (don't prepare). */
  safetyHold?: boolean;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  zoneName?: string;
  driverName?: string;
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
    const opts = [it.variant, ...(it.choices ?? []), ...(it.modifiers ?? [])].filter(Boolean) as string[];
    if (opts.length) {
      parts.push(tRight(y, opts.join("، "), 20, "#9b8b7c"));
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
  if (d.taxAmount && d.taxAmount > 0) totalsRow(`ضريبة القيمة المضافة (${d.taxRate}%)`, money(d.taxAmount, d.currency));
  totalsRow("الإجمالي", money(d.total, d.currency), true);

  if (d.taxRegNo) {
    parts.push(tRight(y, `الرقم الضريبي: ${ltr(d.taxRegNo)}`, 18, "#9b8b7c"));
    y += s(28);
  }

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

const SOURCE_AR: Record<string, string> = { whatsapp: "واتساب", web: "الموقع" };

// --- kitchen / delivery ticket (Audit-13 §14: operational hierarchy) --------
// High-contrast, RTL, 80mm-first. The driver navigates from the TYPED ADDRESS +
// phone (no map pin in V1), so address+phone are prominent and NEVER truncated
// (word-wrapped). Money is shown from STORED values — never recomputed here.
export function buildKitchenTicketSvg(d: ReceiptData, width: ReceiptWidth = "standard"): { svg: string; width: number } {
  const { W, s, PAD, tRight, tLeft, tMid, rule } = layout(width);
  const LEFT = PAD;
  const CW = W - 2 * PAD;
  const cur = d.currency;
  const parts: string[] = [];

  // Word-wrap (resvg <text> doesn't wrap): greedy split by an estimated chars/line
  // for the given font size, so long typed addresses/notes show in full.
  const wrap = (text: string, size: number): string[] => {
    const max = Math.max(8, Math.floor(CW / (s(size) * 0.52)));
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let c = "";
    for (const w of words) {
      const cand = c ? `${c} ${w}` : w;
      if (cand.length <= max) { c = cand; continue; }
      if (c) lines.push(c);
      if (w.length <= max) { c = w; continue; }
      let rest = w; // hard-split an over-long token
      while (rest.length > max) { lines.push(rest.slice(0, max)); rest = rest.slice(max); }
      c = rest;
    }
    if (c) lines.push(c);
    return lines.length ? lines : [""];
  };
  const boxRect = (yTop: number, h: number, fill: string, stroke: string) =>
    `<rect x="${LEFT}" y="${yTop}" width="${CW}" height="${h}" rx="${s(8)}" fill="${fill}" stroke="${stroke}" stroke-width="${s(2)}"/>`;

  let y = s(48);
  // 1. Restaurant + branch + print timestamp (small, top).
  parts.push(tRight(y, d.restaurantName || "", 22, "#000", 700));
  if (d.branchName) parts.push(tLeft(y, d.branchName, 18, "#444"));
  y += s(24);
  parts.push(tRight(y, `طُبع: ${fmtDate()}`, 16, "#666"));
  if (d.createdAt) parts.push(tLeft(y, `الطلب: ${fmtDate(d.createdAt)}`, 16, "#666"));
  y += s(18);
  parts.push(rule(y, "#000"));
  y += s(46);

  // 2. Order # (large) + fulfillment (large) + source.
  parts.push(tRight(y, `طلب ${ltr(d.orderNumber)}`, 42, "#000", 800));
  parts.push(tLeft(y, d.fulfillment === "delivery" ? "توصيل" : "استلام من الفرع", 26, "#000", 800));
  y += s(26);
  if (d.source) { parts.push(tRight(y, `المصدر: ${SOURCE_AR[d.source] ?? d.source}`, 16, "#666")); y += s(18); }

  // 2b. Allergy/safety hold — ⚠️ at TOP when flagged (red/boxed).
  if (d.safetyHold) {
    const h = s(42);
    parts.push(boxRect(y, h, "#fdecec", "#c0392b"));
    parts.push(tMid(y + s(27), "⚠️ حساسية — لا يتم التحضير قبل مراجعة المطعم", 19, "#a01b0b", 800));
    y += h + s(12);
  }
  y += s(8);
  parts.push(rule(y, "#000"));
  y += s(42);

  // 3. Payment + amount-to-collect (large / boxed), by variant.
  const isPaid = d.paymentStatus === "paid";
  const method = d.paymentMethod || "cod"; // COD-only pilot default
  if (isPaid) {
    parts.push(tRight(y, "الدفع: مدفوع — لا تحصيل", 26, "#0a7a33", 800));
    y += s(38);
  } else if (method === "vodafone_cash") {
    parts.push(tRight(y, "فودافون كاش — بانتظار التأكيد", 25, "#000", 800));
    y += s(32);
    parts.push(tRight(y, "لا تُحصّل نقداً", 20, "#a01b0b", 700));
    y += s(32);
  } else {
    // COD / unknown → collect cash. Amount = STORED order total.
    const h = s(50);
    parts.push(boxRect(y, h, "#fff7e6", "#000"));
    parts.push(tRight(y + s(32), `${d.fulfillment === "delivery" ? "المطلوب تحصيله نقداً" : "يُحصّل عند الاستلام"}:`, 23, "#000", 800));
    parts.push(tLeft(y + s(34), money(d.total, cur), 34, "#000", 800));
    y += h + s(14);
  }
  // Subtotal | delivery-fee split (small, stored values).
  parts.push(tRight(y, "المجموع الفرعي", 18, "#444")); parts.push(tLeft(y, money(d.subtotal, cur), 18, "#444")); y += s(24);
  if (d.fulfillment === "delivery") { parts.push(tRight(y, "رسوم التوصيل", 18, "#444")); parts.push(tLeft(y, money(d.deliveryFee, cur), 18, "#444")); y += s(24); }
  if (d.discountTotal && d.discountTotal > 0) { parts.push(tRight(y, "الخصم", 18, "#444")); parts.push(tLeft(y, `- ${money(d.discountTotal, cur)}`, 18, "#444")); y += s(24); }
  parts.push(tRight(y, "الإجمالي", 22, "#000", 800)); parts.push(tLeft(y, money(d.total, cur), 22, "#000", 800)); y += s(30);
  parts.push(rule(y, "#000"));
  y += s(42);

  // 4. Items + quantities + modifiers (large, readable).
  for (const it of d.items) {
    parts.push(tRight(y, `${it.quantity}×  ${it.name}`, 32, "#000", 700));
    y += s(38);
    const opts = [it.variant, ...(it.choices ?? []), ...(it.modifiers ?? [])].filter(Boolean) as string[];
    if (opts.length) { for (const ln of wrap(`+ ${opts.join("، ")}`, 22)) { parts.push(tRight(y, ln, 22, "#333")); y += s(28); } }
    if (it.notes) { for (const ln of wrap(`ملاحظة: ${it.notes}`, 22)) { parts.push(tRight(y, ln, 22, "#000", 700)); y += s(28); } }
    y += s(6);
  }
  parts.push(rule(y, "#000"));
  y += s(40);

  // 5. Address (full, wrapped) + zone + phone — the driver's only navigation.
  if (d.fulfillment === "delivery") {
    if (d.address && d.address.trim()) {
      parts.push(tRight(y, "العنوان:", 22, "#000", 800));
      y += s(30);
      for (const ln of wrap(d.address, 24)) { parts.push(tRight(y, ln, 24, "#000")); y += s(32); }
    } else {
      const h = s(40);
      parts.push(boxRect(y, h, "#fdecec", "#c0392b"));
      parts.push(tMid(y + s(26), "⚠️ العنوان ناقص — تواصل مع العميل", 19, "#a01b0b", 800));
      y += h + s(12);
    }
    if (d.zoneName) { parts.push(tRight(y, `المنطقة: ${d.zoneName}`, 20, "#000")); y += s(28); }
  }
  if (d.customerName) { parts.push(tRight(y, `العميل: ${d.customerName}`, 20, "#000")); y += s(28); }
  if (d.customerPhone) {
    parts.push(tRight(y, `الهاتف: ${ltr(d.customerPhone)}`, 24, "#000", 700));
    y += s(32);
  } else if (d.fulfillment === "delivery") {
    parts.push(tRight(y, "⚠️ رقم الهاتف ناقص", 20, "#a01b0b", 700));
    y += s(28);
  }
  if (d.driverName) { parts.push(tRight(y, `المندوب: ${d.driverName}`, 20, "#000")); y += s(28); }

  // 6. Allergy line ALWAYS present — explicit "no report" when not flagged
  // (a blank line could be misread as "no allergy" when it's unknown).
  if (!d.safetyHold) { parts.push(tRight(y, "لا يوجد بلاغ حساسية", 18, "#0a7a33")); y += s(26); }

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
