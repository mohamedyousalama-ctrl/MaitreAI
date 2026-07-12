"use client";

// ============================================================================
// MaitreAI — WO-DELIVERY-D1: the Leaflet canvas for the zone map editor.
// CLIENT-ONLY (react-leaflet breaks on the server) — imported via next/dynamic
// ssr:false from ZoneMapEditor. Reuses the repo's map conventions: react-leaflet
// interaction (like storefront/LocationPicker) + the console_v2 CARTO DARK tiles
// (like console-v2/shift/LiveMaps), so this introduces NO new map stack.
//
// The zone is a CIRCLE: a draggable CENTER pin + a draggable RADIUS handle on the
// east edge. Dragging the handle sets radius = haversine(center, handle) — the same
// pure distance the router uses (lib/delivery/geo), so the on-screen circle and the
// pin-matching math can never disagree.
// ============================================================================

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { haversineKm } from "@/lib/delivery/geo";

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
const handleIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#e0b53a;border:3px solid #0b0f16;box-shadow:0 0 0 2px #e0b53a"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// A point `radiusKm` due EAST of the center — where the radius handle sits. Uses the
// local degrees-per-km at this latitude so the handle lands on the drawn circle edge.
function eastEdge(center: { lat: number; lng: number }, radiusKm: number): { lat: number; lng: number } {
  const kmPerDegLng = 111.32 * Math.cos((center.lat * Math.PI) / 180) || 1e-6;
  return { lat: center.lat, lng: center.lng + radiusKm / kmPerDegLng };
}

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
  const handlePos = eastEdge(center, radiusKm);
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%", background: "#0b0f16" }}>
      <TileLayer attribution={CARTO_ATTR} url={CARTO_DARK} />
      <Circle
        center={[center.lat, center.lng]}
        radius={Math.max(radiusKm, 0.05) * 1000}
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
          drag: (e) => {
            const m = e.target.getLatLng();
            const km = haversineKm(center, { lat: m.lat, lng: m.lng });
            onRadiusChange(Math.min(100, Math.max(0.1, km)));
          },
        }}
      />
      <ClickToPlaceCenter onPlace={onCenterChange} />
      <Recenter target={flyTarget} />
      <InvalidateOnMount />
    </MapContainer>
  );
}
