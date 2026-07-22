"use client";

// ============================================================================
// KIVO-SHIFT — Reject sheet (WO-SHIFT-1). Rejection lives behind «المزيد», never
// beside «قبول» (a mis-tap during a rush must not reject a real order). It requires
// a REASON and shows the operator exactly what the customer will be told before
// confirming. The interface authors no safety text and no money.
//
// Rejection is wired to the existing manager-gated order-cancel route (the only
// server primitive that ends an order). For a non-manager the route returns 403 —
// surfaced as a plain "manager required" message, never a silent failure. The
// chosen reason drives the customer-preview copy; the underlying cancel route does
// not persist the reason text (a server limitation, noted in the handback).
// ============================================================================

import { useState } from "react";
import { MiniModal, SectionHeader } from "@/components/console-v2/kit";
import { Ban } from "lucide-react";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";

export type RejectReason = "unavailable" | "outOfRange" | "closed" | "payment" | "other";

const REASONS: { key: RejectReason; label: DictKey; preview: DictKey }[] = [
  { key: "unavailable", label: "shift.v2.reject.unavailable", preview: "shift.v2.reject.previewUnavailable" },
  { key: "outOfRange", label: "shift.v2.reject.outOfRange", preview: "shift.v2.reject.previewOutOfRange" },
  { key: "closed", label: "shift.v2.reject.closed", preview: "shift.v2.reject.previewClosed" },
  { key: "payment", label: "shift.v2.reject.payment", preview: "shift.v2.reject.previewPayment" },
  { key: "other", label: "shift.v2.reject.other", preview: "shift.v2.reject.previewOther" },
];

export function RejectSheet({
  open, orderNumber, canReject, managerReason, busy, onClose, onConfirm,
}: {
  open: boolean;
  orderNumber?: string;
  canReject: boolean;
  managerReason: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: RejectReason) => Promise<void>;
}) {
  const t = useT();
  const [sel, setSel] = useState<RejectReason | null>(null);

  const close = () => { setSel(null); onClose(); };
  const preview = REASONS.find((r) => r.key === sel)?.preview;

  return (
    <MiniModal open={open} onClose={close}>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader
          tier="coral" icon={<Ban size={15} />}
          title={t("shift.v2.reject.title")}
          sub={orderNumber ? `#${orderNumber}` : undefined}
          right={<button onClick={close} style={{ border: 0, background: "transparent", color: "var(--faint)", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{t("shift.od.close")}</button>}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {REASONS.map((r) => {
            const active = sel === r.key;
            return (
              <button
                key={r.key} type="button" onClick={() => setSel(r.key)}
                style={{
                  textAlign: "start", fontFamily: "var(--kvx-font-ar)", fontSize: 15, fontWeight: 800,
                  padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                  background: active ? "rgba(232,180,90,.14)" : "var(--inset)",
                  border: `1px solid ${active ? "rgba(232,180,90,.5)" : "var(--stroke)"}`,
                  color: "var(--txt)",
                }}
              >
                {t(r.label)}
              </button>
            );
          })}
        </div>

        {preview && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--faint)", marginBottom: 6 }}>{t("shift.v2.reject.previewTitle")}</div>
            <div style={{ fontSize: 14, color: "var(--dim)", lineHeight: 1.7, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "12px 14px" }}>
              {t(preview)}
            </div>
          </div>
        )}

        {!canReject && <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--faint)" }}>{managerReason ?? t("shift.v2.reject.managerOnly")}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={close} style={{ height: 46, padding: "0 18px", borderRadius: 12, border: "1px solid var(--stroke2)", background: "rgba(255,255,255,.04)", color: "var(--txt)", fontFamily: "var(--kvx-font-ar)", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            {t("shift.cancel")}
          </button>
          <button
            disabled={!sel || !canReject || busy}
            onClick={async () => { if (sel) await onConfirm(sel); }}
            /* Rejection is OPERATIONAL, not a safety hold → amber, never safety red (#B4232C). */
            style={{ height: 46, padding: "0 20px", borderRadius: 12, border: 0, background: "var(--amber)", color: "#3a2600", fontFamily: "var(--kvx-font-ar)", fontSize: 15, fontWeight: 900, cursor: !sel || !canReject || busy ? "default" : "pointer", opacity: !sel || !canReject || busy ? 0.5 : 1 }}
          >
            {t("shift.v2.reject.confirm")}
          </button>
        </div>
      </div>
    </MiniModal>
  );
}
