import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY = "ر.س";

/** Format a money amount with western digits + Saudi Riyal label. e.g. 85 ر.س */
export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString("en-US")} ${CURRENCY}`;
}

/** Format an order number with leading hash. e.g. Order #1042 -> طلب #1042 */
export function formatOrderId(id: string): string {
  return `#${id}`;
}

/** Clock time with western digits + Arabic meridiem, e.g. "3:05 م". */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const mer = h < 12 ? "ص" : "م";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${mer}`;
}

/** Whole minutes elapsed since the given timestamp (min 0). */
export function minutesAgo(ts: number): number {
  return Math.max(0, Math.round((Date.now() - ts) / 60000));
}
