"use client";

// ============================================================================
// console_v2 — StateChip: the ONE renderer for a display state (PR 1 app shell).
//
// A page derives a state through the mapping table (lib/console-v2/display-state)
// and hands the resulting DisplayState here. This component is the only place a
// derived state becomes pixels: it reads the tone → TONE_TOKENS color and the
// labelKey → dictionary string. Because tone comes from the table and the only
// red tone is `safety`, the "red = safety only" law holds automatically — a chip
// cannot pick red for a cancellation or a failed payment.
//
// Text is rendered as a plain text node from the dictionary (XSS: text nodes only,
// no dangerouslySetInnerHTML anywhere in this path).
// ============================================================================

import type { CSSProperties, ReactNode } from "react";
import { useT } from "@/lib/i18n/lang";
import { TONE_TOKENS, type DisplayState, type Tone } from "@/lib/console-v2/display-state";

export function StateChip<S extends string>({
  display,
  dot = true,
  leading,
  className,
  style,
}: {
  display: DisplayState<S>;
  /** Show the leading tone dot (default on). Ignored when `leading` is given. */
  dot?: boolean;
  /** Optional leading glyph (e.g. an attribution icon) shown instead of the dot. */
  leading?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useT();
  const token = TONE_TOKENS[display.tone];

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: "var(--kv-r-pill)",
        fontFamily: "var(--kv-font)",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        color: token.fg,
        background: token.bg,
        ...style,
      }}
    >
      {leading
        ? <span aria-hidden style={{ display: "inline-flex", flex: "0 0 auto" }}>{leading}</span>
        : dot && (
            <span
              aria-hidden
              style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", flex: "0 0 auto" }}
            />
          )}
      {t(display.labelKey)}
    </span>
  );
}

/** Direct tone → color access for non-chip surfaces (e.g. a left border on a card).
 *  Still routes through TONE_TOKENS so nothing picks a color outside the palette. */
export function toneColor(tone: Tone): { fg: string; bg: string } {
  return TONE_TOKENS[tone];
}
