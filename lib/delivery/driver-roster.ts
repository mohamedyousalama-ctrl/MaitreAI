// ============================================================================
// Kivo Delivery Network — manual driver roster labels (PURE).
// Assignment stays operator-picked. Active/inactive is roster management, NOT
// Day-2 ONLINE/OFFLINE presence.
// ============================================================================

export interface RosterDriver {
  name: string;
  phone: string;
  vehicle: string | null;
  active: boolean;
}

export function formatDriverChoice(d: RosterDriver, n: number): string {
  const vehicle = d.vehicle?.trim();
  const base = vehicle ? `${d.name} — ${vehicle} — ${d.phone}` : `${d.name} — ${d.phone}`;
  return `${n}. ${base}`;
}

export function rosterSummary(drivers: Array<{ active: boolean }>): {
  total: number;
  activeCount: number;
  inactiveCount: number;
} {
  const activeCount = drivers.filter((d) => d.active).length;
  return {
    total: drivers.length,
    activeCount,
    inactiveCount: drivers.length - activeCount,
  };
}

/** Arabic count line for the assign dropdown. Manual selection only. */
export function rosterSelectHint(activeCount: number): string {
  if (activeCount <= 0) return "لا يوجد مندوبون نشطون — فعّل مندوباً من القائمة أو أضِف مندوباً.";
  if (activeCount === 1) return "مندوب نشط واحد — الاختيار يدوي.";
  return `${activeCount} مندوبين نشطين — اختر يدوياً.`;
}
