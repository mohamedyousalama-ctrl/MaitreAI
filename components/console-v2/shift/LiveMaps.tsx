"use client";

// ============================================================================
// console_v2 Live Shift — the maps grid (v35 canon, dark). Three Leaflet
// map-cards inside the glass shell:
//   • Order Heat (hero) — LIVE from real order coordinates (0043 orders.lat/lng).
//     Renders a pin per located order on a dark basemap. When no order carries a
//     coordinate yet (WhatsApp / typed-address orders are null by design), the
//     card shows its honest GATHERING state — the DESIGNED map-card, never a flat
//     placeholder — until coordinates flow on the order stream.
//   • Losing Orders — GATHERING until the outcomes table (WO-1) feeds it.
//   • Ad Sources — GATHERING until ad-referral capture is on.
//
// Leaflet is loaded imperatively inside an effect (client-only) so there is no
// SSR shim and no react-leaflet version pin. CARTO dark tiles + attribution are
// REQUIRED (design law). No map timers — the pins are props, realtime-driven.
// prefers-reduced-motion: pan/zoom animations disabled.
// ============================================================================

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { useT } from "@/lib/i18n/lang";
import { TruthChip } from "@/components/console-v2/kit";

export interface HeatPoint { lat: number; lng: number }

// Neutral regional fallback center when no order is located yet (KSA-first).
const FALLBACK: [number, number] = [24.7136, 46.6753]; // Riyadh
const TILE = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function useLeaflet(points: HeatPoint[] | null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      map = L.map(ref.current, {
        zoomControl: false, attributionControl: true, dragging: true, scrollWheelZoom: false,
        fadeAnimation: !reduce, zoomAnimation: !reduce, markerZoomAnimation: !reduce,
      });
      L.tileLayer(TILE, { attribution: ATTRIB, maxZoom: 19, detectRetina: true }).addTo(map);
      const pts = points ?? [];
      if (pts.length > 0) {
        const layer = L.layerGroup().addTo(map);
        for (const p of pts) {
          L.circleMarker([p.lat, p.lng], {
            radius: 7, weight: 0, fillColor: "#e8b45a", fillOpacity: 0.55,
          }).addTo(layer);
        }
        const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]));
        map.fitBounds(bounds.pad(0.35), { animate: !reduce, maxZoom: 14 });
      } else {
        map.setView(FALLBACK, 10, { animate: false });
      }
      // Leaflet needs a size recalc once the glass card has laid out.
      setTimeout(() => map?.invalidateSize(), 60);
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [points]);
  return ref;
}

function MapCard({
  variant, title, tier, stat, live, points, gathering, gatheringNote, legend,
}: {
  variant: "heat" | "loss" | "ads";
  title: string; tier: "gold" | "coral" | "violet"; stat?: React.ReactNode;
  live?: React.ReactNode; points?: HeatPoint[] | null; gathering?: boolean;
  gatheringNote?: string; legend?: { color: string; label: string }[];
}) {
  const ref = useLeaflet(gathering ? [] : (points ?? []));
  const accent = tier === "gold" ? "#e8b45a" : tier === "coral" ? "#ff6b5e" : "#a878f0";
  return (
    <div className={`kvx-panel${variant === "heat" ? " kvx-mapHero" : ""}`} style={{ position: "relative", padding: 0, overflow: "hidden", minHeight: variant === "heat" ? 300 : 190 }}>
      <div ref={ref} style={{ position: "absolute", inset: 0, borderRadius: 18, filter: gathering ? "grayscale(.7) brightness(.7)" : undefined }} aria-hidden />
      {/* vignette for legibility of the overlaid chrome */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 0%,transparent 40%,rgba(10,13,20,.72) 100%)", borderRadius: 18 }} />
      <div style={{ position: "relative", padding: 14, display: "flex", flexDirection: "column", height: "100%", pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: accent, boxShadow: `0 0 8px ${accent}`, flex: "none" }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--txt)" }}>{title}</span>
          {stat && <span style={{ marginInlineStart: "auto", fontSize: 11, fontWeight: 700, color: "var(--dim)" }}>{stat}</span>}
        </div>
        {gathering ? (
          <div style={{ margin: "auto", textAlign: "center", pointerEvents: "auto" }}>
            <TruthChip state="gather" />
            {gatheringNote && <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8, maxWidth: 220, lineHeight: 1.6 }}>{gatheringNote}</div>}
          </div>
        ) : <div style={{ flex: 1 }} />}
        {legend && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {legend.map((l) => (
              <span key={l.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 700, color: "var(--dim)" }}>
                <i style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />{l.label}
              </span>
            ))}
          </div>
        )}
        {live && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, fontSize: 10.5, fontWeight: 700, color: "var(--dim)" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, boxShadow: `0 0 8px ${accent}` }} />{live}
          </div>
        )}
      </div>
    </div>
  );
}

/** The 3-map grid. `heatPoints` are real located-order coords (0043); null/empty →
 *  the heat card renders its honest GATHERING state, not a fabricated heat. */
export function LiveMaps({ heatPoints, ordersToday, hottestZone }: {
  heatPoints: HeatPoint[] | null; ordersToday?: number; hottestZone?: string;
}) {
  const t = useT();
  const located = heatPoints?.length ?? 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gridTemplateRows: "auto auto", gap: 14 }}>
      <div style={{ gridRow: "1 / 3" }}>
        <MapCard
          variant="heat" tier="gold" title={t("shift.map.heat")}
          stat={located > 0 ? <>{located} {t("shift.map.located")}</> : undefined}
          points={heatPoints} gathering={located === 0}
          gatheringNote={located === 0 ? t("shift.map.heatGather") : undefined}
          live={located > 0 && hottestZone ? <>{hottestZone}</> : (located > 0 && ordersToday ? <>{ordersToday} {t("shift.map.ordersToday")}</> : undefined)}
        />
      </div>
      <MapCard variant="loss" tier="coral" title={t("shift.map.loss")} gathering gatheringNote={t("shift.map.lossGather")} />
      <MapCard
        variant="ads" tier="violet" title={t("shift.map.ads")} gathering gatheringNote={t("shift.map.adsGather")}
        legend={[{ color: "#4b8bff", label: t("shift.map.lgFb") }, { color: "#e07bd0", label: t("shift.map.lgIg") }, { color: "#2ecc9a", label: t("shift.map.lgRet") }]}
      />
    </div>
  );
}
