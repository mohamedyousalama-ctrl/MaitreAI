"use client";

// ============================================================================
// MaitreAI — LiveMap: a tiny Leaflet + OpenStreetMap map (no API key, no paid
// secret). Leaflet is loaded from the public CDN on demand so it adds no npm
// dependency and never runs on the server. Renders one or more markers; when
// there are none it shows a neutral placeholder (truth-driven — no fake dot).
// ============================================================================

import { useEffect, useRef } from "react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// Load Leaflet once (shared promise across mounts).
let leafletPromise: Promise<unknown> | null = null;
function loadLeaflet(): Promise<unknown> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as unknown as { L?: unknown };
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve((window as unknown as { L: unknown }).L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
  return leafletPromise;
}

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
}

export function LiveMap({ markers, height = 280 }: { markers: MapMarker[]; height?: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const LL = L as any;
      if (cancelled || !LL || !elRef.current) return;
      if (!mapRef.current) {
        mapRef.current = LL.map(elRef.current, { zoomControl: true, attributionControl: true });
        LL.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(mapRef.current);
        layerRef.current = LL.layerGroup().addTo(mapRef.current);
        mapRef.current.setView([30.0444, 31.2357], 11); // Cairo default
      }
      layerRef.current.clearLayers();
      const pts = markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));
      if (pts.length) {
        for (const m of pts) {
          const mk = LL.marker([m.lat, m.lng]).addTo(layerRef.current);
          if (m.label) mk.bindPopup(m.label);
        }
        if (pts.length === 1) mapRef.current.setView([pts[0].lat, pts[0].lng], 15);
        else mapRef.current.fitBounds(pts.map((m) => [m.lat, m.lng]), { padding: [40, 40] });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [markers]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const hasPoints = markers.some((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#e4d8c8]" style={{ height }}>
      <div ref={elRef} style={{ height: "100%", width: "100%" }} />
      {!hasPoints && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#faf6ef]/80 text-sm text-[#9b8b7c]">
          الموقع غير متاح حالياً
        </div>
      )}
    </div>
  );
}
