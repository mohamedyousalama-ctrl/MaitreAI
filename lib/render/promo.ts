// ============================================================================
// MaitreAI — Template promo image (Phase 1) — SERVER ONLY
// A branded promo graphic rendered with @resvg/resvg-js (Arabic RTL, brand
// palette, tenant name) from the COMPUTED draft — headline + items + before/
// after prices + dates. No AI image generation in Phase 1 (that's Phase 2,
// backlog). Numbers come from the tool-computed draft, never the LLM.
// ============================================================================

import { readFileSync } from "fs";
import { join } from "path";
import { Resvg } from "@resvg/resvg-js";

const FONT_DIR = join(process.cwd(), "public", "fonts");
let fontFilesCache: string[] | null = null;
function fontFiles(): string[] {
  if (!fontFilesCache) {
    fontFilesCache = [join(FONT_DIR, "NotoSansArabic-Regular.ttf"), join(FONT_DIR, "ReadexPro.ttf")];
    for (const f of fontFilesCache) readFileSync(f);
  }
  return fontFilesCache;
}

export interface PromoImageData {
  restaurantName: string;
  headline: string; // e.g. «خصم ٢٠٪» / «اشترِ ١ واحصل على ١»
  scopeLabel: string; // e.g. «على البرجر»
  caption?: string;
  items: { name: string; before: number; after: number }[];
  currency: string;
  dateLabel: string; // e.g. «ساري حتى ٢٠/٠٦»
  showPrices: boolean; // bogo → no before/after column
}

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ltr = (s: string) => `‪${s}‬`;
const W = 720;
const PAD = 56;

export function renderPromoPng(d: PromoImageData): Buffer {
  const parts: string[] = [];
  const RIGHT = W - PAD;
  const tMid = (y: number, t: string, size: number, fill: string, weight = 400) =>
    `<text x="${W / 2}" y="${y}" font-family="Noto Sans Arabic" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${esc(t)}</text>`;
  const tRight = (y: number, t: string, size: number, fill: string, weight = 400) =>
    `<text x="${RIGHT}" y="${y}" font-family="Noto Sans Arabic" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="end">${esc(t)}</text>`;
  const tLeft = (y: number, t: string, size: number, fill: string, weight = 400) =>
    `<text x="${PAD}" y="${y}" font-family="Noto Sans Arabic" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="start">${esc(t)}</text>`;

  // Header band (terracotta) with the restaurant name.
  parts.push(tMid(78, d.restaurantName, 34, "#ffffff", 600));

  let y = 210;
  parts.push(tMid(y, d.headline, 84, "#b5502e", 700));
  y += 56;
  parts.push(tMid(y, d.scopeLabel, 34, "#3a2f26", 500));
  y += 40;

  // Items with before/after (skipped for bogo).
  if (d.showPrices && d.items.length) {
    parts.push(`<line x1="${PAD}" y1="${y}" x2="${RIGHT}" y2="${y}" stroke="#e4d8c8" stroke-width="2"/>`);
    y += 50;
    for (const it of d.items.slice(0, 4)) {
      parts.push(tRight(y, it.name, 30, "#2a211b", 500));
      // before (strikethrough via overlay line) + after
      const beforeStr = `${ltr(String(it.before))} ${d.currency}`;
      const afterStr = `${ltr(String(it.after))} ${d.currency}`;
      parts.push(`<text x="${PAD + 150}" y="${y}" font-family="Noto Sans Arabic" font-size="24" fill="#b9a892" text-anchor="start">${esc(beforeStr)}</text>`);
      parts.push(`<line x1="${PAD + 150}" y1="${y - 8}" x2="${PAD + 150 + 92}" y2="${y - 8}" stroke="#cc3a33" stroke-width="2"/>`);
      parts.push(tLeft(y, afterStr, 32, "#3c7a52", 700));
      y += 46;
    }
    if (d.items.length > 4) {
      parts.push(tMid(y, `+${d.items.length - 4} أصناف أخرى`, 22, "#9b8b7c"));
      y += 40;
    }
    y += 6;
    parts.push(`<line x1="${PAD}" y1="${y}" x2="${RIGHT}" y2="${y}" stroke="#e4d8c8" stroke-width="2"/>`);
    y += 50;
  } else {
    y += 20;
  }

  // Strip emoji (the brand fonts can't render them — they'd tofu in the PNG).
  const caption = d.caption ? d.caption.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "").trim() : "";
  if (caption) {
    parts.push(tMid(y, caption, 30, "#6a5c4e", 500));
    y += 50;
  }
  parts.push(tMid(y, d.dateLabel, 24, "#9b8b7c"));
  y += 44;

  const H = Math.max(560, y + PAD);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#faf6ef"/>
<rect x="0" y="0" width="${W}" height="120" fill="#b5502e"/>
<rect x="0" y="${H - 14}" width="${W}" height="14" fill="#e0912e"/>
${parts.join("\n")}
</svg>`;

  const r = new Resvg(svg, {
    background: "white",
    fitTo: { mode: "width", value: W * 2 },
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Noto Sans Arabic" },
  });
  return Buffer.from(r.render().asPng());
}
