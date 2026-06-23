"use client";

import { useEffect, useState } from "react";

/**
 * useRiseIn — SPEC 00 §7 rise-in entrance, ported as behavior (not the
 * abandoned CSS-keyframe `x-dc` wrapper that froze content blank on re-render).
 *
 * Returns an inline-style object to spread onto an element. The element starts
 * at `opacity:0; translateY(18px)` and transitions to its resting state on
 * mount: `~640ms`, `delay = index * 85ms`, `cubic-bezier(.2,.8,.2,1)`,
 * `fill: backwards` (the initial style is applied before the transition runs).
 *
 * If `prefers-reduced-motion` is set, the element renders at its final state
 * immediately with no transition — it never sits blank.
 *
 * @param index stagger position (0-based); multiplies the delay.
 */
export function useRiseIn(index = 0): { style: React.CSSProperties } {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduced) return;
    // Next frame so the initial (hidden) style commits before we animate.
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);

  if (reduced) {
    return { style: { opacity: 1, transform: "none" } };
  }

  return {
    style: {
      opacity: shown ? 1 : 0,
      transform: shown ? "translateY(0)" : "translateY(18px)",
      transition: `opacity 640ms cubic-bezier(.2,.8,.2,1), transform 640ms cubic-bezier(.2,.8,.2,1)`,
      transitionDelay: `${index * 85}ms`,
      willChange: "opacity, transform",
    },
  };
}

/** Tracks the user's reduced-motion preference (SSR-safe: defaults to false). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
