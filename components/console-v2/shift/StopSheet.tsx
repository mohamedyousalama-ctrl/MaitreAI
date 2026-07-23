"use client";

// ============================================================================
// KIVO-SHIFT — Stop controls (WO-SHIFT-1). Explicit and SEPARATE stop actions —
// never a single ambiguous «إيقاف». «وقف كريم» is the one client-safe wired stop
// (setAssistant → /api/settings/ops, manager-gated server-side) and shows a preview
// of the customer-facing effect before it applies. «حوّل لبشري فقط» is the same
// underlying effect (pausing Karim routes conversations to the team) and is folded
// into that action's copy. «اقفل استقبال الطلبات» and «أنهِ الوردية» have no
// client-safe setter in this territory, so they are surfaced HONESTLY as deferred
// (to settings) rather than faked — never a button that lies about what it does.
// ============================================================================

import { useState } from "react";
import { Power, UserCog, Store, LogOut } from "lucide-react";
import { MiniModal } from "@/components/console-v2/kit";
import { useT } from "@/lib/i18n/lang";

export function StopSheet({
  open, onClose, karimOn, canStopKarim, stopReason, busy, onStopKarim, intakeOpen,
}: {
  open: boolean;
  onClose: () => void;
  karimOn: boolean;
  canStopKarim: boolean;
  stopReason: string | null;
  busy: boolean;
  onStopKarim: () => Promise<void>;
  intakeOpen: boolean;
}) {
  const t = useT();
  const [confirmKarim, setConfirmKarim] = useState(false);

  const close = () => {
    setConfirmKarim(false);
    onClose();
  };

  return (
    <MiniModal open={open} onClose={close}>
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--txt)", margin: 0, flex: 1 }}>{t("shift.v2.stop.title")}</h3>
          <button onClick={close} style={{ border: 0, background: "transparent", color: "var(--faint)", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            {t("shift.od.close")}
          </button>
        </div>

        {!confirmKarim ? (
          <>
            {/* Wired: stop Karim (humans-only). Manager-gated; shows a preview next. */}
            <StopRow
              icon={<Power size={17} />}
              title={t("shift.v2.stop.karim")}
              desc={t("shift.v2.stop.karimDesc")}
              tone="amber"
              disabled={!canStopKarim || !karimOn}
              reason={!karimOn ? null : stopReason}
              onClick={() => setConfirmKarim(true)}
            />
            {/* Same effect, distinct intent — folded into the Karim pause. */}
            <StopRow
              icon={<UserCog size={17} />}
              title={t("shift.v2.stop.humanOnly")}
              desc={t("shift.v2.stop.humanOnlyDesc")}
              tone="amber"
              disabled={!canStopKarim || !karimOn}
              reason={!karimOn ? null : stopReason}
              onClick={() => setConfirmKarim(true)}
            />
            {/* Deferred (no client-safe setter in this territory) — honest, not faked. */}
            <StopRow
              icon={<Store size={17} />}
              title={t("shift.v2.stop.closeIntake")}
              desc={t("shift.v2.stop.closeIntakeDesc")}
              tone="muted"
              statusText={intakeOpen ? t("shift.v2.stop.intakeOpen") : t("shift.v2.stop.intakeClosed")}
              disabled
              reason={t("shift.v2.stop.unavailable")}
            />
            <StopRow
              icon={<LogOut size={17} />}
              title={t("shift.v2.stop.endShift")}
              desc={t("shift.v2.stop.endShiftDesc")}
              tone="muted"
              disabled
              reason={t("shift.v2.stop.unavailable")}
            />
          </>
        ) : (
          // Preview before applying — the customer-facing effect, then confirm.
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".04em", color: "var(--faint)" }}>{t("shift.v2.stop.previewTitle")}</div>
            <div style={{ fontSize: 14, color: "var(--dim)", lineHeight: 1.7, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "12px 14px" }}>
              {t("shift.v2.stop.previewKarim")}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmKarim(false)} style={{ height: 46, padding: "0 18px", borderRadius: 12, border: "1px solid var(--stroke2)", background: "rgba(255,255,255,.04)", color: "var(--txt)", fontFamily: "var(--kvx-font-ar)", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                {t("shift.cancel")}
              </button>
              <button
                disabled={busy}
                onClick={async () => { await onStopKarim(); close(); }}
                style={{ height: 46, padding: "0 20px", borderRadius: 12, border: 0, background: "var(--amber)", color: "#3a2600", fontFamily: "var(--kvx-font-ar)", fontSize: 15, fontWeight: 900, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
              >
                {t("shift.v2.stop.confirm")}
              </button>
            </div>
          </div>
        )}
      </div>
    </MiniModal>
  );
}

function StopRow({
  icon, title, desc, tone, disabled, reason, onClick, statusText,
}: {
  icon: React.ReactNode; title: string; desc: string; tone: "amber" | "muted";
  disabled?: boolean; reason?: string | null; onClick?: () => void; statusText?: string;
}) {
  const accent = tone === "amber" ? "var(--amber)" : "var(--faint)";
  return (
    <button
      type="button" onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{
        display: "flex", alignItems: "flex-start", gap: 11, textAlign: "start",
        background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 14, padding: "12px 14px",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.66 : 1, width: "100%",
        borderInlineStart: `3px solid ${accent}`,
      }}
    >
      <span style={{ color: accent, display: "inline-flex", marginTop: 1 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: "var(--txt)" }}>{title}</span>
          {statusText && <span style={{ fontSize: 12, fontWeight: 800, color: "var(--dim)" }}>· {statusText}</span>}
        </span>
        <span style={{ display: "block", fontSize: 13.5, color: "var(--dim)", lineHeight: 1.6, marginTop: 3 }}>{desc}</span>
        {disabled && reason && <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--faint)", marginTop: 5 }}>{reason}</span>}
      </span>
    </button>
  );
}
