"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./useRiseIn";

type CountUpProps = {
  /** The real, final value. Only ever animate over real data (SPEC 00 §7). */
  value: number;
  /** Animation length in ms. Default 700. */
  duration?: number;
  /** Decimal places to render. Default 0. */
  decimals?: number;
  /**
   * Set false for static data that should not animate (renders final value
   * immediately). Also forced when prefers-reduced-motion is set.
   */
  animate?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Custom formatter; receives the current numeric value. */
  format?: (n: number) => string;
};

/**
 * CountUp — SPEC 00 §7 count-up. Animates from 0 → `value` with an ease-out
 * curve. Renders the final value immediately when motion is off or `animate`
 * is false, so a frozen/static state shows the finished design, never blank.
 */
export function CountUp({
  value,
  duration = 700,
  decimals = 0,
  animate = true,
  prefix = "",
  suffix = "",
  className,
  format,
}: CountUpProps) {
  const reduced = usePrefersReducedMotion();
  const shouldAnimate = animate && !reduced;
  const [display, setDisplay] = useState(shouldAnimate ? 0 : value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, shouldAnimate]);

  const rendered = format
    ? format(display)
    : display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <span className={className}>
      {prefix}
      {rendered}
      {suffix}
    </span>
  );
}
