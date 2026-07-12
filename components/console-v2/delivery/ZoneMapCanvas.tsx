"use client";

// ============================================================================
// MaitreAI — WO-DELIVERY-D1 / WO-ZONE-EDITOR-V2: the Leaflet canvas for the zone
// map editor. CLIENT-ONLY (react-leaflet breaks on the server) — imported via
// next/dynamic ssr:false from ZoneMapEditor. Reuses the repo's map conventions:
// react-leaflet interaction + the console_v2 CARTO DARK tiles (like LiveMaps), so
// this introduces NO new map stack.
//
// The zone is a CIRCLE: a draggable CENTER pin + a draggable RADIUS handle on the
// east edge. WO-ZONE-EDITOR-V2 precision fix (D2):
//   • The handle is placed by destinationEast (lib/delivery/zone-editor-geom) — the
//     exact point on the center's parallel at haversine distance = radius, which is
//     where Leaflet's metric Circle draws its edge. No more flat-offset drift.
//   • Radius COMMITS ONCE, on `dragend`. The old handler fired on the continuous
//     `drag` event and fed radius back into the marker's controlled position mid-
//     gesture — React fought Leaflet's drag, the marker lagged the pointer, and the
//     saved radius under-read what the operator aimed at (2.85km → 1.97/2.70). Now
//     `drag` only PREVIEWS imperatively (grow the circle + the handle's km label via
//     refs, no React state write), so nothing contests the drag; `dragend` writes
//     the single canonical value. Same haversine the router uses (radiusFromDrag).
// ============================================================================

import { useEffect, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { destinationEast, radiusFromDrag, roundRadiusKm, formatKm } from "@/lib/delivery/zone-editor-geom";
import { toArabicDigits } from "@/lib/util/arabic-digits";

// console_v2 canon: CARTO dark tiles (matches components/console-v2/shift/LiveMaps).
const CARTO_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const centerIcon = L.divIcon({
  className: "",
  html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z" fill="#e0b53a"/>
    <circle cx="15" cy="15" r="6" fill="#0b0f16"/>
  </svg>`,
  iconSize: [30, 42],
  iconAnchor: [15, 42],
});
// Larger, obviously-grabbable radius knob (mobile-friendly hit area).
const handleIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#e0b53a;border:3px solid #0b0f16;box-shadow:0 0 0 2px #e0b53a"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// The handle's live km label — concatenated (never interpolated) so the Arabic
// lint rule stays satisfied.
const kmLabel = (km: number) => toArabicDigits(formatKm(km)) + " كم";

function ClickToPlaceCenter({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPlace(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 13));
  }, [target, map]);
  return null;
}

// Leaflet inside a sheet computes size before layout settles → invalidate once
// (mirrors LiveMaps.tsx invalidateSize) so tiles fill the panel.
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export interface ZoneMapCanvasProps {
  center: { lat: number; lng: number };
  radiusKm: number;
  flyTarget: { lat: number; lng: number } | null;
  onCenterChange: (lat: number, lng: number) => void;
  onRadiusChange: (km: number) => void;
}

export default function ZoneMapCanvas({ center, radiusKm, flyTarget, onCenterChange, onRadiusChange }: ZoneMapCanvasProps) {
  const handlePos = destinationEast(center, radiusKm);
  const circleRef = useRef<L.Circle | null>(null);

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%", background: "#0b0f16" }}>
      <TileLayer attribution={CARTO_ATTR} url={CARTO_DARK} />
      <Circle
        ref={circleRef}
        center={[center.lat, center.lng]}
        radius={Math.max(roundRadiusKm(radiusKm), 0.05) * 1000}
        pathOptions={{ color: "#e0b53a", weight: 2, fillColor: "#e0b53a", fillOpacity: 0.12 }}
      />
      <Marker
        position={[center.lat, center.lng]}
        icon={centerIcon}
        draggable
        eventHandlers={{ dragend: (e) => { const m = e.target.getLatLng(); onCenterChange(m.lat, m.lng); } }}
      />
      <Marker
        position={[handlePos.lat, handlePos.lng]}
        icon={handleIcon}
        draggable
        eventHandlers={{
          // PREVIEW only — imperative, no React state write, so nothing contests the
          // live Leaflet drag (this is what killed the old feedback loop).
          drag: (e) => {
            const km = radiusFromDrag(center, e.target.getLatLng());
            circleRef.current?.setRadius(Math.max(km, 0.05) * 1000);
            e.target.setTooltipContent(kmLabel(km));
          },
          // COMMIT once — the single canonical write. React then snaps the handle back
          // to destinationEast(center, km) on the parallel.
          dragend: (e) => {
            const km = radiusFromDrag(center, e.target.getLatLng());
            onRadiusChange(km);
          },
        }}
      >
        <Tooltip permanent direction="top" offset={[0, -8]} className="kvx-zone-km">{kmLabel(radiusKm)}</Tooltip>
      </Marker>
      <ClickToPlaceCenter onPlace={onCenterChange} />
      <Recenter target={flyTarget} />
      <InvalidateOnMount />
    </MapContainer>
  );
}
