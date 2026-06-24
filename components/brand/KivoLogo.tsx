// ============================================================================
// Kivo brand logo — the real check-arrow mark + "Kivo" wordmark, ported from
// the design-tool sources (KivoMark.dc.html / KivoWordmark.dc.html) into clean,
// dependency-free React/SVG. No runtime (support.js) is used; this is the
// canonical brand component for the app (landing header, console sidebar,
// favicon generation reference, etc.).
//
//   <KivoMark />       — the standalone gradient check-arrow icon (square)
//   <KivoWordmark />   — "Kivo" wordmark, the check replacing the "v" (Sora)
//   <KivoLogo />       — horizontal lockup: tinted tile + mark + wordmark
//
// Gradient IDs are made unique per instance with useId() so multiple marks
// (different tones) can coexist on one page without ID collisions. Works in
// both Server and Client components.
// ============================================================================

import { useId } from "react";

export type KivoTone = "emerald" | "white" | "chrome" | "ink";

const TONES: Record<KivoTone, { rim: string; stops: [string, string, string, string] }> = {
  emerald: { rim: "#0a5238", stops: ["#4fe0a6", "#1fae77", "#138a5c", "#0c6644"] },
  white: { rim: "#c4cbb8", stops: ["#ffffff", "#f4f7ec", "#e4e9d8", "#cdd3bf"] },
  chrome: { rim: "#6c7760", stops: ["#ffffff", "#d9dfce", "#abb49a", "#828d75"] },
  ink: { rim: "#000000", stops: ["#3c4431", "#1d2015", "#11140a", "#060f0a"] },
};

// The single brand path, in a 0–100 box. (M14 49 L39 75 L92 13)
const CHECK_PATH = "M14 49 L39 75 L92 13";

export function KivoMark({
  size = 40,
  width,
  height,
  viewBox = "0 0 100 100",
  preserveAspectRatio,
  tone = "emerald",
  weight = 13,
  sheen = true,
  title = "Kivo",
  animated = false,
  drawDurationMs = 900,
  drawDelayMs = 120,
  className,
  style,
}: {
  size?: number | string;
  width?: number | string;
  height?: number | string;
  viewBox?: string;
  preserveAspectRatio?: string;
  tone?: KivoTone;
  weight?: number;
  sheen?: boolean;
  title?: string;
  /** when true, the check-arrow draws itself once (stroke-dash), then rests as
   *  the static mark. CSS-only; prefers-reduced-motion shows the final mark. */
  animated?: boolean;
  drawDurationMs?: number;
  drawDelayMs?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const uid = useId().replace(/[:]/g, "");
  const bodyId = `kvb-${uid}`;
  const sheenId = `kvs-${uid}`;
  const specId = `kvp-${uid}`;
  const t = TONES[tone];
  const sheenWeight = Math.max(2, weight * 0.32);
  const specR = Math.max(2, weight * 0.5);

  // animated variant: the three stroke paths draw via stroke-dashoffset 100→0,
  // the specular hot-spot fades in at the end. Scoped + unique per instance.
  const drawCls = `kvd-${uid}`;
  const specCls = `kvsp-${uid}`;
  const animCss = animated
    ? `@keyframes kvDraw-${uid}{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}`
      + `@keyframes kvSpec-${uid}{0%,55%{opacity:0}100%{opacity:1}}`
      + `.${drawCls}{stroke-dasharray:100;stroke-dashoffset:0;animation:kvDraw-${uid} ${drawDurationMs}ms cubic-bezier(.65,0,.3,1) ${drawDelayMs}ms both}`
      + `.${specCls}{animation:kvSpec-${uid} ${drawDurationMs}ms ease ${drawDelayMs}ms both}`
      + `@media (prefers-reduced-motion:reduce){.${drawCls}{animation:none!important;stroke-dashoffset:0}.${specCls}{animation:none!important;opacity:1}}`
    : null;
  const strokeAnim = animated ? { className: drawCls, pathLength: 100 } : {};

  return (
    <svg
      width={width ?? size}
      height={height ?? size}
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
      fill="none"
      className={className}
      style={{ display: "block", overflow: "visible", ...style }}
      role="img"
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      {animCss && <style dangerouslySetInnerHTML={{ __html: animCss }} />}
      <defs>
        <linearGradient id={bodyId} x1="0.1" y1="0.96" x2="0.86" y2="0.04">
          <stop offset="0" stopColor={t.stops[0]} />
          <stop offset="0.32" stopColor={t.stops[1]} />
          <stop offset="0.66" stopColor={t.stops[2]} />
          <stop offset="1" stopColor={t.stops[3]} />
        </linearGradient>
        <linearGradient id={sheenId} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="0.75" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={specId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* under-rim: gives the stroke physical thickness */}
      <path d={CHECK_PATH} stroke={t.rim} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" transform="translate(0 1.1)" {...strokeAnim} />
      {/* body */}
      <path d={CHECK_PATH} stroke={`url(#${bodyId})`} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" {...strokeAnim} />
      {/* top bevel sheen + specular hot-spot */}
      {sheen && (
        <path d={CHECK_PATH} stroke={`url(#${sheenId})`} strokeWidth={sheenWeight} strokeLinecap="round" strokeLinejoin="round" transform="translate(0 -2.6)" style={{ mixBlendMode: "screen" }} {...strokeAnim} />
      )}
      {sheen && <circle cx="84" cy="22" r={specR} fill={`url(#${specId})`} className={animated ? specCls : undefined} style={{ mixBlendMode: "screen" }} />}
    </svg>
  );
}

export function KivoWordmark({
  size = 28,
  ink = "#0e1f18",
  tone = "emerald",
  className,
  style,
  title = "Kivo",
}: {
  /** font-size in px; the mark scales to the cap height */
  size?: number;
  ink?: string;
  tone?: KivoTone;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <span
      className={className}
      role="img"
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "flex-end",
        direction: "ltr", // "Kivo" is a Latin wordmark — never reorder under RTL
        fontFamily: "'Sora', var(--font-arabic), system-ui, sans-serif",
        fontWeight: 700,
        letterSpacing: "-0.05em",
        lineHeight: 0.9,
        color: ink,
        fontSize: size,
        ...style,
      }}
    >
      <span aria-hidden style={{ display: "inline-block" }}>Ki</span>
      <span aria-hidden style={{ position: "relative", display: "inline-block", width: "0.6em", height: "1em", margin: "0 -0.02em" }}>
        <KivoMark
          tone={tone}
          title=""
          viewBox="8 8 92 74"
          preserveAspectRatio="xMidYMax meet"
          style={{
            position: "absolute",
            left: "-0.06em",
            bottom: "-0.02em",
            width: "1em",
            height: "1em",
            filter: "drop-shadow(0 0.02em 0.03em rgba(0,0,0,0.4)) drop-shadow(0 0 0.08em rgba(31,174,119,0.28))",
          }}
        />
      </span>
      <span aria-hidden style={{ display: "inline-block", marginInlineStart: "-0.04em" }}>o</span>
    </span>
  );
}

export function KivoLogo({
  size = 26,
  tone = "emerald",
  ink = "#0e1f18",
  tileTone,
  className,
  style,
}: {
  /** wordmark font-size in px; the tile + mark scale with it */
  size?: number;
  tone?: KivoTone;
  ink?: string;
  /** if set, renders a tinted tile around the mark (e.g. for app-bar lockups) */
  tileTone?: "brand" | "soft" | "translucent";
  className?: string;
  style?: React.CSSProperties;
}) {
  const tile =
    tileTone === "brand"
      ? { background: "linear-gradient(150deg,#13b07a,#0a6e4c)", border: "1px solid rgba(255,255,255,.1)" }
      : tileTone === "translucent"
      ? { background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.22)" }
      : tileTone === "soft"
      ? { background: "linear-gradient(150deg,#d6f4ea,#bdebda)", border: "1px solid #cdebe0" }
      : null;
  const markTone: KivoTone = tileTone === "brand" || tileTone === "translucent" ? "white" : tone;

  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 11, ...style }}>
      {tile && (
        <span
          style={{
            width: size * 1.55,
            height: size * 1.55,
            borderRadius: size * 0.5,
            display: "grid",
            placeItems: "center",
            flex: "none",
            ...tile,
          }}
        >
          <KivoMark size={size * 0.9} tone={markTone} title="" />
        </span>
      )}
      <KivoWordmark size={size} ink={ink} tone={tone} />
    </span>
  );
}

export default KivoLogo;
