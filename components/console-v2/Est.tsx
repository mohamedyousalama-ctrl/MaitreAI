"use client";

// ============================================================================
// console_v2 — <Est>: an ESTIMATED value, ALWAYS labelled «تقديري / est.», never a
// raw authoritative number (ratified doctrine — Outcomes est. values AND the
// capacity chip's remaining_est both render through this). `value == null` renders
// nothing (e.g. no cap / no estimate available). The number is LTR-isolated (<Num>).
// ============================================================================

import { useT } from "@/lib/i18n/lang";
import { Num } from "@/components/kivo";

export function Est({ value, currency }: { value: number | null | undefined; currency?: string }) {
  const t = useT();
  if (value == null) return null;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      ~<Num>{value.toLocaleString("en-US")}</Num>{currency ? ` ${currency}` : ""}{" "}
      <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>{t("out.est")}</span>
    </span>
  );
}
