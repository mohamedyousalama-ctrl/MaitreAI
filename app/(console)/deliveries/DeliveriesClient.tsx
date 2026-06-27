"use client";

// ============================================================================
// MaitreAI — Operator deliveries client (Kivo-styled). Live list of deliveries,
// driver assignment / reassignment, and a simple driver roster (add / activate /
// deactivate). Polls every 6s. Operator-only (the page is flag-gated +
// session-guarded). No map. Styling uses Kivo tokens (var(--kv-*)); logic is
// unchanged.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { Truck, Plus, Loader2, Link2, Check } from "lucide-react";

interface Driver { id: string; name: string; phone: string; vehicle: string | null; active: boolean }
interface Delivery {
  id: string;
  status: string;
  driver_id: string | null;
  drivers: { name: string; phone: string } | null;
  orders: { order_number: string | null; total: number | null; currency: string | null; address: string | null } | null;
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
// Semantic status chips, aligned to the Kivo palette.
const CHIP: Record<string, { bg: string; color: string }> = {
  pending: { bg: "rgba(216,151,43,.14)", color: "#9a6a14" },
  assigned: { bg: "rgba(43,143,181,.14)", color: "#1d6f8e" },
  picked_up: { bg: "rgba(43,143,181,.14)", color: "#1d6f8e" },
  on_the_way: { bg: "rgba(124,92,208,.14)", color: "#6243b0" },
  delivered: { bg: "var(--kv-primary-tint)", color: "var(--kv-deep)" },
  failed: { bg: "rgba(192,73,47,.12)", color: "var(--kv-red)" },
  cancelled: { bg: "rgba(100,116,139,.14)", color: "var(--kv-muted)" },
};
const POLL_MS = 6000;

// Kivo card + field frames.
const cardStyle: React.CSSProperties = { borderRadius: 16, border: "1px solid var(--kv-border)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-panel)" };
const fieldStyle: React.CSSProperties = { borderRadius: 8, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-text)" };

export function DeliveriesClient() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, { driverLink: string; customerLink: string; whatsapp: string }>>({});
  const [form, setForm] = useState({ name: "", phone: "", vehicle: "" });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", vehicle: "" });
  const [savingEdit, setSavingEdit] = useState(false);
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

  function startEdit(d: Driver) {
    setEditId(d.id);
    setEditForm({ name: d.name, phone: d.phone, vehicle: d.vehicle ?? "" });
  }
  async function saveEdit(id: string) {
    if (!editForm.name.trim() || !editForm.phone.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const r = await fetch(`/api/drivers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name, phone: editForm.phone, vehicle: editForm.vehicle }),
      });
      if (r.ok) { setEditId(null); await loadDrivers(); }
    } finally {
      setSavingEdit(false);
    }
  }

  const activeDrivers = drivers.filter((d) => d.active);

  return (
    <div dir="rtl" style={{ maxWidth: 1320, margin: "0 auto", color: "var(--kv-text)" }}>
      {/* header (inline Kivo — replaces the terracotta PageHeader) */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 99, background: "var(--kv-primary-tint)", color: "var(--kv-deep)", fontSize: 11, fontWeight: 800 }}>
          <Truck size={13} /> التوصيل
        </span>
        <div style={{ width: "100%" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "8px 0 0" }}>التوصيل</h1>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--kv-muted)", marginTop: 4 }}>إدارة المندوبين وتعيين الطلبات</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Deliveries list */}
        <div className="space-y-4 lg:col-span-2">
          <div className="divide-y p-0" style={{ ...cardStyle, borderColor: "var(--kv-border)" }}>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--kv-primary)" }} /></div>
            ) : deliveries.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--kv-muted)" }}>لا توجد طلبات توصيل بعد.</p>
            ) : (
              deliveries.map((d) => {
                const canAssign = d.status === "pending" || d.status === "assigned";
                const chip = CHIP[d.status] ?? { bg: "rgba(100,116,139,.14)", color: "var(--kv-muted)" };
                return (
                  <div key={d.id} className="p-4" style={{ borderColor: "var(--kv-border)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold" style={{ color: "var(--kv-text)" }}>طلب {d.orders?.order_number ?? "—"}</p>
                        {d.orders?.address && <p className="text-xs" style={{ color: "var(--kv-muted)" }}>{d.orders.address}</p>}
                      </div>
                      <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: chip.bg, color: chip.color }}>
                        {STATUS_AR[d.status] ?? d.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs" style={{ color: "var(--kv-muted)" }}>
                      <span>{d.orders?.total != null ? `${d.orders.total} ${d.orders.currency}` : ""}</span>
                      {d.drivers?.name && <span>المندوب: {d.drivers.name}</span>}
                    </div>

                    {canAssign && (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={pick[d.id] ?? ""}
                          onChange={(e) => setPick((x) => ({ ...x, [d.id]: e.target.value }))}
                          className="flex-1 px-2 py-1.5 text-sm"
                          style={fieldStyle}
                        >
                          <option value="">اختر مندوباً…</option>
                          {activeDrivers.map((dr) => (
                            <option key={dr.id} value={dr.id}>{dr.name} — {dr.phone}</option>
                          ))}
                        </select>
                        <button
                          disabled={!pick[d.id] || assigning === d.id}
                          onClick={() => assign(d.id)}
                          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
                          style={{ background: "var(--kv-grad-brand)" }}
                        >
                          {assigning === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          {d.status === "assigned" ? "إعادة تعيين" : "تعيين"}
                        </button>
                      </div>
                    )}

                    {links[d.id] && (
                      <div className="mt-2 space-y-1 rounded-lg p-2 text-[11px]" style={{ background: "var(--kv-card-soft)", color: "var(--kv-muted)" }}>
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
          <div className="p-4" style={cardStyle}>
            <p className="mb-3 text-sm font-bold" style={{ color: "var(--kv-text)" }}>إضافة مندوب</p>
            <div className="space-y-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="رقم واتساب" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
              <input value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="المركبة (اختياري)" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
              <button onClick={addDriver} disabled={adding} className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-50" style={{ background: "var(--kv-grad-brand)" }}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إضافة
              </button>
            </div>
          </div>

          <div className="p-0" style={cardStyle}>
            <p className="p-4 text-sm font-bold" style={{ color: "var(--kv-text)", borderBottom: "1px solid var(--kv-border)" }}>المندوبون</p>
            {drivers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--kv-muted)" }}>لا يوجد مندوبون بعد.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--kv-border)" }}>
                {drivers.map((d) => (
                  <li key={d.id} className="p-3" style={{ borderColor: "var(--kv-border)" }}>
                    {editId === d.id ? (
                      // inline edit (manager) — name/phone required; reuses add-form styling
                      <div className="space-y-2">
                        <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="الاسم" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                        <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="رقم واتساب" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                        <input value={editForm.vehicle} onChange={(e) => setEditForm({ ...editForm, vehicle: e.target.value })} placeholder="المركبة (اختياري)" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(d.id)} disabled={!editForm.name.trim() || !editForm.phone.trim() || savingEdit} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50" style={{ background: "var(--kv-grad-brand)" }}>
                            {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} حفظ
                          </button>
                          <button onClick={() => setEditId(null)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--kv-border)", color: "var(--kv-muted)" }}>إلغاء</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold" style={d.active ? { color: "var(--kv-text)" } : { color: "var(--kv-faint)", textDecoration: "line-through" }}>{d.name}</p>
                          <p className="text-xs" style={{ color: "var(--kv-muted)" }}>{d.phone}{d.vehicle ? ` · ${d.vehicle}` : ""}</p>
                        </div>
                        <div className="flex flex-none items-center gap-1.5">
                          <button onClick={() => startEdit(d)} className="rounded-lg border px-2.5 py-1 text-xs font-semibold transition" style={{ borderColor: "var(--kv-border)", color: "var(--kv-muted)" }}>
                            تعديل
                          </button>
                          <button onClick={() => toggleDriver(d)} className="rounded-lg border px-2.5 py-1 text-xs font-semibold transition" style={{ borderColor: "var(--kv-border)", color: "var(--kv-muted)" }}>
                            {d.active ? "إيقاف" : "تفعيل"}
                          </button>
                        </div>
                      </div>
                    )}
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
