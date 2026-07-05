"use client";

// console_v2 item 4 — the honest home placeholder shown until the role's landing
// surface (Live Shift, item 5) ships. Uses real i18n copy + the SOON truth chip;
// fabricates no numbers. Renders inside <AppFrame> (rail already present).

import { useT } from "@/lib/i18n/lang";
import { TruthChip } from "@/components/console-v2";

export function HomeLanding() {
  const t = useT();
  return (
    <div style={{ maxWidth: 640, margin: "8vh auto 0", textAlign: "center" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--kv-text)", margin: 0 }}>{t("home.title")}</h1>
      <p style={{ fontSize: 14, color: "var(--kv-muted)", lineHeight: 1.8, margin: "12px 0 20px" }}>{t("home.arriving")}</p>
      <div style={{ display: "inline-flex", gap: 8 }}>
        <TruthChip state="soon" label={t("nav.liveShift")} />
        <TruthChip state="soon" label={t("nav.conversations")} />
      </div>
    </div>
  );
}
