"use client";

// ============================================================================
// MaitreAI — Storefront location picker (Phase 3 Step 3.5). Public, no auth.
// A Leaflet/OpenStreetMap pin picker. CLIENT-ONLY — loaded via next/dynamic with
// ssr:false from StorefrontMenu (react-leaflet breaks on the server). It captures
// a lat/lng (drag or tap, or "use my location") and reverse-geocodes to an Arabic
// address via the FREE OSM Nominatim service (debounced, graceful on failure).
// It ONLY improves the address — it never touches the delivery zone or fee.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { X, LocateFixed, Loader2, MapPin } from "lucide-react";

// Default center: الهرم / Giza (Cairo area) — used when no prior pin.
const DEFAULT_CENTER = { lat: 29.9911, lng: 31.1313 };

// Self-contained pin (inline SVG via divIcon) so we never depend on Leaflet's
// default marker image files (which break under bundlers) or any CDN/API key.
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z" fill="#0f172a"/>
    <circle cx="15" cy="15" r="6" fill="#ffffff"/>
  </svg>`,
  iconSize: [30, 42],
  iconAnchor: [15, 42],
});

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Flies the map ONLY to an explicit target (e.g. "use my location") — not on
// every pin drag, so dragging/tapping doesn't fight the camera.
function FlyTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16));
  }, [target, map]);
  return null;
}

export default function LocationPicker({
  initial,
  onClose,
  onConfirm,
}: {
  initial: { lat: number; lng: number } | null;
  onClose: () => void;
  onConfirm: (r: { lat: number; lng: number; address: string }) => void;
}) {
  const [pos, setPos] = useState(initial ?? DEFAULT_CENTER);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced reverse geocode (Nominatim — free, no API key). Debounced ~1.2s to
  // respect the usage policy (≤1 req/s). On any failure we keep coords only.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setGeocoding(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}&accept-language=ar&zoom=18`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (res.ok) {
          const data = (await res.json()) as { display_name?: string };
          if (data?.display_name) setAddress(data.display_name);
        }
      } catch {
        /* keep coords only */
      } finally {
        setGeocoding(false);
      }
    }, 1200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pos.lat, pos.lng]);

  const useMyLocation = () => {
    setGeoError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("تحديد الموقع غير متاح على هذا الجهاز.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(next);
        setFlyTarget(next);
        setLocating(false);
      },
      () => {
        setGeoError("تعذّر الحصول على موقعك. يمكنك تحريك الدبوس على الخريطة يدوياً.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const confirm = () => {
    const coordsLine = `📍 ${pos.lat.toFixed(6)}، ${pos.lng.toFixed(6)}`;
    const full = address.trim() ? `${address.trim()}\n${coordsLine}` : coordsLine;
    onConfirm({ lat: pos.lat, lng: pos.lng, address: full });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <MapPin className="h-5 w-5" /> اختر موقعك على الخريطة
          </h2>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Map */}
        <div className="h-72 w-full">
          <MapContainer center={[pos.lat, pos.lng]} zoom={15} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker
              position={[pos.lat, pos.lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target.getLatLng();
                  setPos({ lat: m.lat, lng: m.lng });
                },
              }}
            />
            <ClickToPlace onPick={(lat, lng) => setPos({ lat, lng })} />
            <FlyTo target={flyTarget} />
          </MapContainer>
        </div>

        {/* Controls */}
        <div className="space-y-3 p-4">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            استخدم موقعي الحالي
          </button>
          {geoError && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{geoError}</p>}

          <p className="text-xs text-slate-500">اسحب الدبوس أو اضغط على الخريطة لتحديد المكان بدقة.</p>

          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold text-slate-500">العنوان المقترح</p>
            <p className="mt-0.5 min-h-[1.25rem] text-sm text-slate-700">
              {geocoding ? "جارٍ تحديد العنوان…" : address || "سيُستخدم الموقع (الإحداثيات) عند تعذّر العنوان."}
            </p>
          </div>

          <button
            type="button"
            onClick={confirm}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:opacity-90"
          >
            تأكيد الموقع
          </button>
        </div>
      </div>
    </div>
  );
}
