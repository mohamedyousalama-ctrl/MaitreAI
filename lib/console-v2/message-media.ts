// ============================================================================
// WO-CONSOLE-MEDIA-RENDER — pure classifier for rich message bubbles.
//
// The console thread view renders every message from ChatMessage.metadata (the
// messages.meta jsonb, surfaced by lib/db/conversations.ts toMessage). This module
// is the ONE decision point that turns that raw meta into a render model for the
// three non-text bubble kinds, so the view stays declarative and the logic is unit-
// testable (R4 pattern). Pure — no React, no I/O, display-only, no schema change.
//
//   • voice       — meta.voice === true (inbound: + stt_confidence in [0,1];
//                   the row text IS the STT transcript). 🎤 + transcript + confidence.
//   • photo       — meta.image (inbound customer image). id is a WhatsApp media id,
//                   NOT a public URL → placeholder + caption + provenance-marked
//                   model description (image.derived). No thumbnail (ruled scope).
//   • interactive — meta.presentation (the buttons/list Karim SENT). Structured.
//   • text        — everything else (the existing plain bubble).
// ============================================================================

import { toArabicDigits } from "../util/arabic-digits";

export type MediaKind = "voice" | "photo" | "interactive" | "text";

export interface PresentationButton { id: string; title: string }
export interface PresentationRow { id: string; title: string; description?: string }
export interface PresentationSection { title?: string; rows: PresentationRow[] }
export interface InteractiveView {
  kind: "buttons" | "list";
  header?: string;
  /** list trigger label (list only) */
  button?: string;
  buttons?: PresentationButton[];
  sections?: PresentationSection[];
}

export interface MediaView {
  kind: MediaKind;
  // voice
  /** STT confidence 0–100 (rounded), or null when absent (e.g. outbound TTS). */
  confidencePct?: number | null;
  // photo (inbound customer image)
  caption?: string;
  /** MODEL vision read of the image (provenance-marked when descriptionDerived). */
  description?: string;
  descriptionDerived?: boolean;
  // interactive
  interactive?: InteractiveView;
}

const asObj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const finiteNum = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** STT confidence is stored in [0,1]; render as a 0–100 integer percent. */
export function sttConfidencePct(raw: unknown): number | null {
  const c = finiteNum(raw);
  if (c == null) return null;
  const pct = c <= 1 ? c * 100 : c; // tolerate a legacy already-percent value
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** Arabic-Indic percent string, e.g. 82 → "٨٢٪". Arabic-Indic digits + the Arabic
 *  percent sign flow natively RTL, so this is composed by concatenation (no Latin
 *  name/number interpolation) and rendered as a plain span, never LTR-isolated. */
export function formatConfidence(pct: number): string {
  return toArabicDigits(pct) + "٪";
}

function normalizePresentation(p: Record<string, unknown>): InteractiveView | null {
  const header = str(p.header);
  if (p.kind === "buttons") {
    const buttons: PresentationButton[] = [];
    for (const b of Array.isArray(p.buttons) ? p.buttons : []) {
      const o = asObj(b);
      const title = o ? str(o.title) : undefined;
      if (o && title) buttons.push({ id: str(o.id) ?? "", title });
    }
    if (!buttons.length && !header) return null;
    return { kind: "buttons", header, buttons };
  }
  if (p.kind === "list") {
    const button = str(p.button);
    const sections: PresentationSection[] = [];
    for (const s of Array.isArray(p.sections) ? p.sections : []) {
      const o = asObj(s);
      if (!o) continue;
      const rows: PresentationRow[] = [];
      for (const r of Array.isArray(o.rows) ? o.rows : []) {
        const ro = asObj(r);
        const title = ro ? str(ro.title) : undefined;
        if (ro && title) {
          const description = str(ro.description);
          rows.push({ id: str(ro.id) ?? "", title, ...(description ? { description } : {}) });
        }
      }
      if (rows.length) {
        const sTitle = str(o.title);
        sections.push({ rows, ...(sTitle ? { title: sTitle } : {}) });
      }
    }
    if (!sections.length && !header) return null;
    return { kind: "list", header, button, sections };
  }
  return null;
}

/**
 * Classify a message's metadata into a render model. Priority: voice → photo →
 * interactive → text. Any malformed/absent meta falls through to plain text, so a
 * bubble NEVER crashes on unexpected data (graceful fallback is the whole point).
 */
export function classifyMessageMedia(metadata: unknown): MediaView {
  const m = asObj(metadata) ?? {};

  if (m.voice === true) {
    return { kind: "voice", confidencePct: sttConfidencePct(m.stt_confidence) };
  }

  const img = asObj(m.image);
  if (img) {
    return {
      kind: "photo",
      caption: str(img.caption),
      description: str(img.description),
      descriptionDerived: img.derived === true,
    };
  }

  const pres = asObj(m.presentation);
  if (pres) {
    const interactive = normalizePresentation(pres);
    if (interactive) return { kind: "interactive", interactive };
  }

  return { kind: "text" };
}
