// ============================================================================
// MaitreAI — Item 12: bidi primitives (Bdi / Num / Phone) — Kivo console.
// Mixed Arabic (RTL) + Latin/numbers/phones (LTR) is the #1 source of scrambled
// UI in an Arabic-first app: an unisolated «بهاء 6m test · +20» reorders the
// number/phone and reads wrong. These primitives ISOLATE each foreign fragment
// so the surrounding RTL flow can't reorder it — the safe way to render a name,
// a count, or a phone inside Arabic copy WITHOUT string interpolation.
// ============================================================================

import type { ReactNode } from "react";

/**
 * Bdi — isolate arbitrary user content (a customer name, a free-form label) from
 * the surrounding text's bidi flow. Renders a real <bdi> so the browser applies
 * the Unicode isolate algorithm. Use for ANY runtime string of unknown direction.
 */
export function Bdi({ children }: { children: ReactNode }): JSX.Element {
  return <bdi>{children}</bdi>;
}

/**
 * Num — render a number LTR-isolated so it never reorders inside RTL text (e.g.
 * «٦m» / durations / counts). `dir="ltr"` + isolation keeps digits + unit intact.
 * Accepts a number or a preformatted string (e.g. "6m", "2/25").
 */
export function Num({ children }: { children: number | string }): JSX.Element {
  return (
    <bdi dir="ltr" style={{ unicodeBidi: "isolate" }}>
      {children}
    </bdi>
  );
}

/**
 * Phone — render a phone number LTR-isolated (a phone is ALWAYS LTR, even in RTL
 * copy). Keeps the leading «+» and country/trunk digits in the correct visual
 * order (an unisolated "+20…" renders the + on the wrong side).
 */
export function Phone({ children }: { children: string }): JSX.Element {
  return (
    <bdi dir="ltr" style={{ unicodeBidi: "isolate", whiteSpace: "nowrap" }}>
      {children}
    </bdi>
  );
}
