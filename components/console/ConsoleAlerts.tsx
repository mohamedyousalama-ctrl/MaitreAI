"use client";

// DLV5 — mounts the layout-level audible-alert observer (sounds fire on ANY
// console page) and the per-operator mute toggle for the topbar.

import { Bell, BellOff } from "lucide-react";
import { useConsoleAlerts, useAlertSoundStore } from "@/lib/realtime/use-console-alerts";

/** Invisible mounter — runs the alert hook once for the whole console shell. */
export function ConsoleAlerts() {
  useConsoleAlerts();
  return null;
}

/** Topbar mute toggle. Default ON (sounds enabled); persists per-operator. */
export function AlertSoundToggle() {
  const muted = useAlertSoundStore((s) => s.muted);
  const toggle = useAlertSoundStore((s) => s.toggle);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? "تشغيل أصوات التنبيه" : "كتم أصوات التنبيه"}
      title={muted ? "أصوات التنبيه مكتومة — اضغط للتشغيل" : "أصوات التنبيه شغّالة — اضغط للكتم"}
      style={{
        position: "relative",
        width: 36,
        height: 36,
        borderRadius: 11,
        border: `1px solid ${muted ? "rgba(192,73,47,.3)" : "var(--kv-border)"}`,
        background: muted ? "rgba(192,73,47,.06)" : "var(--kv-card)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
      }}
    >
      {muted ? <BellOff size={17} color="#c0492f" /> : <Bell size={17} color="var(--kv-muted)" />}
    </button>
  );
}
