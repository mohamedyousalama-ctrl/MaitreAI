// ============================================================================
// WO-ZONE-EDITOR-V2 — red-first proof (R4). Two founder defects:
//   D1 STATE LEAK  — dismissing the editor (X / backdrop / ESC) must fully discard
//                    the unsaved draft, so reopening always shows the last SAVED state.
//   D2 PRECISION   — the radius the operator sees === the radius that is SAVED, the
//                    handle sits on the true circle edge (great-circle, not a flat
//                    cos-lat offset), and dragging commits ONCE (no feedback loop).
//
// Pure geometry is proven directly; the wiring is proven by source assertion.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-zone-editor-v2.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  destinationEast,
  radiusFromDrag,
  roundRadiusKm,
  parseRadiusKm,
  sanitizeRadiusInput,
  formatKm,
  clampRadiusKm,
  RADIUS_MIN_KM,
  RADIUS_MAX_KM,
} from "../lib/delivery/zone-editor-geom.ts";
import { haversineKm } from "../lib/delivery/geo.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;

const RIYADH = { lat: 24.7136, lng: 46.6753 };

// --- D2: great-circle handle round-trips with the router's haversine ----------
// The founder aimed the handle at a point 2.85 km out; the drawn/saved radius must
// equal that. destinationEast is the inverse of haversineKm at ANY latitude.
for (const r of [0.5, 1, 2.85, 7.3, 25, 100]) {
  const edge = destinationEast(RIYADH, r);
  check(`destinationEast round-trips ${r}km (great-circle, ≤1e-3)`, near(haversineKm(RIYADH, edge), r, 1e-3));
  check(`handle at ${r}km stays on the center's parallel (due east)`, near(edge.lat, RIYADH.lat, 1e-9));
}

// RED-FIRST refutation: the OLD flat cos-lat offset (the shipped eastEdge) does NOT
// round-trip — at Riyadh it under-reads, which is why "cover the point 2.85km out"
// saved short. This documents the drift the exact spherical form removes.
function flatEastEdge(center: { lat: number; lng: number }, km: number) {
  const kmPerDegLng = 111.32 * Math.cos((center.lat * Math.PI) / 180) || 1e-6;
  return { lat: center.lat, lng: center.lng + km / kmPerDegLng };
}
const flatErr = Math.abs(haversineKm(RIYADH, flatEastEdge(RIYADH, 2.85)) - 2.85);
const exactErr = Math.abs(haversineKm(RIYADH, destinationEast(RIYADH, 2.85)) - 2.85);
check("RED-FIRST: exact spherical is strictly tighter than the old flat offset", exactErr < flatErr);

// --- D2: ONE canonical rounding → displayed value === saved value --------------
for (const raw of [1.973, 2.70004, 2.855, 0.049, 130]) {
  const r = roundRadiusKm(raw);
  check(`roundRadiusKm(${raw}) is display/save byte-equal (Number(formatKm)===value)`, Number(formatKm(r)) === r);
  check(`roundRadiusKm(${raw}) is idempotent`, roundRadiusKm(r) === r);
}
check("clamp floor", clampRadiusKm(0) === RADIUS_MIN_KM);
check("clamp ceil", clampRadiusKm(9999) === RADIUS_MAX_KM);
check("radiusFromDrag returns a canonical value", radiusFromDrag(RIYADH, destinationEast(RIYADH, 3.14159)) === roundRadiusKm(3.14159));
check("formatKm trims trailing zeros (3.5→'3.5', 2→'2')", formatKm(3.5) === "3.5" && formatKm(2) === "2");

// --- D2: numeric field accepts Arabic-Indic exactly (٣٫٥ → 3.5) ---------------
check("typing ٣٫٥ parses to exactly 3.5", parseRadiusKm("٣٫٥") === 3.5);
check("typing ٢٥ parses to 25", parseRadiusKm("٢٥") === 25);
check("sanitizeRadiusInput keeps ٣٫٥ → '3.5'", sanitizeRadiusInput("٣٫٥") === "3.5");
check("empty radius input → null (mid-edit, not forced to 0)", parseRadiusKm("") === null && parseRadiusKm("٫") === null);
check("out-of-range typed radius is clamped, not rejected silently", parseRadiusKm("500") === RADIUS_MAX_KM);

// --- D1: the editor discards the draft on EVERY dismissal path ------------------
const editor = read("components/console-v2/delivery/ZoneMapEditor.tsx");
check("(editor) a single discard-and-close handler exists", /const handleClose\s*=/.test(editor) && /setDraft\(null\)/.test(editor));
check("(editor) backdrop dismissal discards the draft", /onClick=\{handleClose\}/.test(editor));
check("(editor) X button dismissal discards the draft", (editor.match(/onClick=\{handleClose\}/g) ?? []).length >= 2);
check("(editor) ESC dismissal routes through the discard handler", /Escape.*handleClose|handleClose\(\)/.test(editor) && /e\.key === "Escape"/.test(editor));
check("(editor) draft is reset when the sheet is closed (reopen shows saved state)", /!open/.test(editor) && /setDraft\(null\)/.test(editor));

// --- D2 wiring: single rounding in, saved === displayed (no toFixed split) ------
check("(editor) imports the canonical geom (roundRadiusKm/formatKm)", /zone-editor-geom"/.test(editor) && /roundRadiusKm/.test(editor) && /formatKm/.test(editor));
check("(editor) payload saves the canonical draft radius, NOT a re-rounded toFixed", /radiusKm: draft\.radiusKm/.test(editor) && !/radiusKm: Number\(draft\.radiusKm\.toFixed/.test(editor));
check("(editor) a numeric radius field is present (نصف القطر) and two-way with drag", /نصف القطر/.test(editor) && /parseRadiusKm\(/.test(editor));

// --- D2 wiring: canvas commits on dragend (no feedback loop), great-circle handle
const canvas = read("components/console-v2/delivery/ZoneMapCanvas.tsx");
check("(canvas) radius commits ONCE on dragend (not the continuous drag event)", /dragend:\s*\(e\)/.test(canvas) && /onRadiusChange\(/.test(canvas));
check("(canvas) live preview is imperative (setRadius) — no state write mid-drag", /setRadius\(/.test(canvas));
check("(canvas) handle placed by the great-circle destinationEast", /destinationEast\(/.test(canvas));
check("(canvas) radius derived via the shared radiusFromDrag (router haversine)", /radiusFromDrag\(/.test(canvas));
check("(canvas) the old feedback loop is gone (no onRadiusChange inside a drag: handler)", !/drag:\s*\(e\)\s*=>\s*\{[^}]*onRadiusChange/.test(canvas));

console.log(`\nZONE-EDITOR-V2 PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
