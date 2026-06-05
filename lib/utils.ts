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
