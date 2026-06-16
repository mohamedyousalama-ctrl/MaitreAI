"use client";

// ============================================================================
// MaitreAI — Operator deliveries client. Live list of deliveries + a map of
// in-progress drivers (reuses the customer LiveMap), driver assignment /
// reassignment, and a simple driver roster (add / deactivate). Polls for fresh
// driver locations. Operator-only (the page is flag-gated + session-guarded).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LiveMap, type MapMarker } from "@/components/delivery/LiveMap";
import { Truck, Plus, Loader2, Link2, Check } from "lucide-react";

interface Driver { id: string; name: string; phone: string; vehicle: string | null; active: boolean }
interface Delivery {
  id: string;
  status: string;
  driver_id: string | null;
  drivers: { name: string; phone: string } | null;
  orders: { order_number: string | null; total: number | null; currency: string | null; address: string | null } | null;
  latestLocation?: { lat: number; lng: number } | null;
}

const STATUS_AR: Record<string, string> = {
  pending: "بانتظار التعيين",
  assigned: "تم التعيين",
  picked_up: "استلمها المندوب",
  on_the_way: "في الطريق",
  delivered: "تم التوصيل",
  failed: "مشكلة",
  cancelled: "ملغي",
};
const CHIP: Record<string, string> = {
  pending: "bg-[#fdf3e7] text-[#b5732e]",
  assigned: "bg-[#eef2fb] text-[#3a5bbf]",
  picked_up: "bg-[#eef2fb] text-[#3a5bbf]",
  on_the_way: "bg-[#fbf1ea] text-[#b5502e]",
  delivered: "bg-[#f0f7f2] text-[#3c7a52]",
  failed: "bg-[#fbeee9] text-[#a8432a]",
  cancelled: "bg-[#f1ede7] text-[#9b8b7c]",
};
const POLL_MS = 6000;

export function DeliveriesClient() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, { driverLink: string; customerLink: string; whatsapp: string }>>({});
  const [form, setForm] = useState({ name: "", phone: "", vehicle: "" });
  const [adding, setAdding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadDrivers() {
    const r = await fetch("/api/drivers", { cache: "no-store" });
    if (r.ok) setDrivers((await r.json()).drivers ?? []);
  }
  async function loadDeliveries() {
    const r = await fetch("/api/deliveries", { cache: "no-store" });
    if (r.ok) setDeliveries((await r.json()).deliveries ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadDrivers();
    let alive = true;
    async function poll() {
      await loadDeliveries();
      if (alive) timer.current = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function assign(deliveryId: string) {
    const driverId = pick[deliveryId];
    if (!driverId) return;
    setAssigning(deliveryId);
    try {
      const r = await fetch(`/api/deliveries/${deliveryId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      const j = await r.json();
      if (r.ok) {
        setLinks((x) => ({ ...x, [deliveryId]: { driverLink: j.driverLink, customerLink: j.customerLink, whatsapp: j.whatsapp } }));
        await loadDeliveries();
      }
    } finally {
      setAssigning(null);
    }
  }

  async function addDriver() {
    if (!form.name.trim() || !form.phone.trim()) return;
    setAdding(true);
    try {
      const r = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (r.ok) {
        setForm({ name: "", phone: "", vehicle: "" });
        await loadDrivers();
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggleDriver(d: Driver) {
    await fetch(`/api/drivers/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !d.active }) });
    loadDrivers();
  }

  const markers: MapMarker[] = deliveries
    .filter((d) => d.latestLocation)
    .map((d) => ({ lat: d.latestLocation!.lat, lng: d.latestLocation!.lng, label: d.drivers?.name ?? "مندوب" }));
  const activeDrivers = drivers.filter((d) => d.active);

  return (
    <div>
      <PageHeader title="التوصيل" subtitle="إدارة المندوبين وتعيين الطلبات وتتبّعها مباشرة" icon={Truck} accentBg="bg-orders" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Live map + deliveries */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-3">
            <p className="mb-2 px-1 text-xs font-semibold text-[#9b8b7c]">المندوبون في الطريق الآن</p>
            <LiveMap markers={markers} height={260} />
          </div>

          <div className="card divide-y divide-[#f0e7da] p-0">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#b5502e]" /></div>
            ) : deliveries.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[#9b8b7c]">لا توجد طلبات توصيل بعد.</p>
            ) : (
              deliveries.map((d) => {
                const canAssign = d.status === "pending" || d.status === "assigned";
                return (
                  <div key={d.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#2a211b]">طلب {d.orders?.order_number ?? "—"}</p>
                        {d.orders?.address && <p className="text-xs text-[#9b8b7c]">{d.orders.address}</p>}
                      </div>
                      <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (CHIP[d.status] ?? "bg-[#f1ede7] text-[#9b8b7c]")}>
                        {STATUS_AR[d.status] ?? d.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-[#6a5c4e]">
                      <span>{d.orders?.total != null ? `${d.orders.total} ${d.orders.currency}` : ""}</span>
                      {d.drivers?.name && <span>المندوب: {d.drivers.name}</span>}
                    </div>

                    {canAssign && (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={pick[d.id] ?? ""}
                          onChange={(e) => setPick((x) => ({ ...x, [d.id]: e.target.value }))}
                          className="flex-1 rounded-lg border border-[#e4d8c8] bg-white px-2 py-1.5 text-sm text-[#2a211b]"
                        >
                          <option value="">اختر مندوباً…</option>
                          {activeDrivers.map((dr) => (
                            <option key={dr.id} value={dr.id}>{dr.name} — {dr.phone}</option>
                          ))}
                        </select>
                        <button
                          disabled={!pick[d.id] || assigning === d.id}
                          onClick={() => assign(d.id)}
                          className="flex items-center gap-1 rounded-lg bg-[#b5502e] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
                        >
                          {assigning === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          {d.status === "assigned" ? "إعادة تعيين" : "تعيين"}
                        </button>
                      </div>
                    )}

                    {links[d.id] && (
                      <div className="mt-2 space-y-1 rounded-lg bg-[#faf6ef] p-2 text-[11px] text-[#6a5c4e]">
                        <p className="flex items-center gap-1"><Link2 className="h-3 w-3" /> رابط المندوب: <span className="truncate font-mono">{links[d.id].driverLink}</span></p>
                        <p className="flex items-center gap-1"><Link2 className="h-3 w-3" /> رابط العميل: <span className="truncate font-mono">{links[d.id].customerLink}</span></p>
                        <p>الإرسال عبر واتساب: {links[d.id].whatsapp === "sent" ? "تم ✅" : links[d.id].whatsapp === "skipped" ? "وضع تجريبي (لم يُرسل)" : "فشل الإرسال"}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Driver roster */}
        <div className="space-y-3">
          <div className="card p-4">
            <p className="mb-3 text-sm font-bold text-[#2a211b]">إضافة مندوب</p>
            <div className="space-y-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم" className="w-full rounded-lg border border-[#e4d8c8] px-3 py-2 text-sm" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="رقم واتساب" className="w-full rounded-lg border border-[#e4d8c8] px-3 py-2 text-sm" />
              <input value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="المركبة (اختياري)" className="w-full rounded-lg border border-[#e4d8c8] px-3 py-2 text-sm" />
              <button onClick={addDriver} disabled={adding} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#b5502e] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إضافة
              </button>
            </div>
          </div>

          <div className="card p-0">
            <p className="border-b border-[#f0e7da] p-4 text-sm font-bold text-[#2a211b]">المندوبون</p>
            {drivers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[#9b8b7c]">لا يوجد مندوبون بعد.</p>
            ) : (
              <ul className="divide-y divide-[#f0e7da]">
                {drivers.map((d) => (
                  <li key={d.id} className="flex items-center justify-between p-3">
                    <div>
                      <p className={"text-sm font-semibold " + (d.active ? "text-[#2a211b]" : "text-[#bcae9e] line-through")}>{d.name}</p>
                      <p className="text-xs text-[#9b8b7c]">{d.phone}{d.vehicle ? ` · ${d.vehicle}` : ""}</p>
                    </div>
                    <button onClick={() => toggleDriver(d)} className="rounded-lg border border-[#e4d8c8] px-2.5 py-1 text-xs font-semibold text-[#6a5c4e] hover:bg-[#faf6ef]">
                      {d.active ? "إيقاف" : "تفعيل"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
