// ============================================================================
// Kivo — first-load intro reveal for the public site. A brief (~1.4s) overlay:
// the check-arrow draws itself centered on a clean Kivo background, then the
// overlay fades to reveal the page. CSS-only (the draw is KivoMark's animated
// variant; the fade is a keyframe) — NO JS timers. The overlay is
// pointer-events:none the whole time, so the page underneath is interactive
// immediately and is never blocked or delayed. prefers-reduced-motion skips it
// entirely (display:none → no draw, no fade, page shows instantly).
// ============================================================================

import { KivoMark } from "./KivoLogo";

const INTRO_CSS = `
.kv-intro{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;
  background:radial-gradient(120% 90% at 50% 42%,#f5fbf8 0%,#e9f4ee 55%,#ddeee6 100%);
  pointer-events:none;animation:kvIntroOut .5s ease .95s both}
@keyframes kvIntroOut{0%{opacity:1}99%{opacity:0;visibility:visible}100%{opacity:0;visibility:hidden}}
.kv-intro-mark{animation:kvIntroPop .55s cubic-bezier(.2,.8,.2,1) both;
  filter:drop-shadow(0 18px 40px rgba(14,159,110,.28))}
@keyframes kvIntroPop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.kv-intro{display:none}}
`;

export function IntroReveal() {
  return (
    <div className="kv-intro" aria-hidden>
      <style dangerouslySetInnerHTML={{ __html: INTRO_CSS }} />
      <div className="kv-intro-mark">
        <KivoMark size={104} tone="emerald" animated drawDurationMs={760} drawDelayMs={150} title="" />
      </div>
    </div>
  );
}

export default IntroReveal;
