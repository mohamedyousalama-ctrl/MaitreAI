"use client";

// ============================================================================
// Kivo — العملاء (Customers). SPEC 05. Inside <ConsoleLayout>. Not a CRM — a
// conversation-memory layer per customer. Two-pane: list (left) + profile (right).
//
// Real data only (existing client reads): customers are derived from real orders
// (grouped by customerId) + conversations (for complaint/escalation + the live
// conversation link). Facts strip + favorites + order history come from real
// order totals/items — never recomputed money. Karim's memory + allergy hint come
// from the existing gated /api/customer-memory (honest-empty). No hardcoded counts.
//
// Allergy hint is an OPERATOR HINT, not a guarantee — exact mandatory wording:
// «ده تلميح تشغيلي مش ضمان سلامة …». Never presented as "safe".
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, AlertTriangle } from "lucide-react";
import { useOrderStore } from "@/lib/order-store";
import { useConversationStore } from "@/lib/conversation-store";
import { useHasHydrated } from "@/lib/store";
import { isEscalated } from "@/lib/escalation";
import { useConsoleUi } from "@/components/console/console-ui-store";
import { useRiseIn } from "@/components/kivo";
import type { LocalOrder, Conversation } from "@/lib/types";

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const money = (n: number) => toAr(Math.round(Number(n || 0)).toLocaleString("en-US")).replace(/,/g, "٬");
const DAY_MS = 86400000;

function recency(ms: number | null): string {
  if (ms == null) return "—";
  const d = Math.floor((Date.now() - ms) / DAY_MS);
  if (d <= 0) return "النهارده";
  if (d === 1) return "من يوم";
  if (d === 2) return "من يومين";
  return `من ${toAr(d)} يوم`;
}

type Customer = {
  key: string;
  customerId?: string;
  name: string;
  phone: string;
  orders: LocalOrder[];
  count: number;
  total: number;
  avg: number;
  lastMs: number | null;
  favorites: { name: string; qty: number }[];
  returning: boolean;
  complaint: boolean;
  conversationId?: string;
};

export default function CustomersPage() {
  const hydrated = useHasHydrated();
  const orders = useOrderStore((s) => s.orders);
  const conversations = useConversationStore((s) => s.conversations);
  const query = useConsoleUi((s) => s.query);
  const [filter, setFilter] = useState<"all" | "returning" | "new">("all");
  const [selKey, setSelKey] = useState<string | null>(null);
  const rHead = useRiseIn(0);
  const rBody = useRiseIn(1);

  const customers = useMemo<Customer[]>(() => {
    if (!hydrated) return [];
    // escalated/complaint conversations + the conversation link, keyed by customerId
    const convByCustomer = new Map<string, Conversation>();
    const complaintCustomers = new Set<string>();
    for (const c of conversations) {
      if (!c.customerId) continue;
      if (!convByCustomer.has(c.customerId)) convByCustomer.set(c.customerId, c);
      if (isEscalated(c)) complaintCustomers.add(c.customerId);
    }

    const map = new Map<string, Customer>();
    for (const o of orders) {
      const key = o.customerId || o.customerPhone || o.customerName;
      if (!key) continue;
      let c = map.get(key);
      if (!c) {
        c = {
          key, customerId: o.customerId, name: o.customerName || o.customerPhone || "عميل",
          phone: o.customerPhone || "", orders: [], count: 0, total: 0, avg: 0, lastMs: null,
          favorites: [], returning: false, complaint: false,
          conversationId: o.conversationId,
        };
        map.set(key, c);
      }
      c.orders.push(o);
      c.total += o.total || 0;
      c.lastMs = Math.max(c.lastMs ?? 0, o.createdAt);
      if (!c.conversationId && o.conversationId) c.conversationId = o.conversationId;
    }

    // include customers known only from conversations (no orders yet)
    for (const [cid, conv] of convByCustomer) {
      if ([...map.values()].some((c) => c.customerId === cid)) continue;
      map.set(`conv:${cid}`, {
        key: `conv:${cid}`, customerId: cid, name: conv.customer || conv.phone || "عميل",
        phone: conv.phone || "", orders: [], count: 0, total: 0, avg: 0, lastMs: null,
        favorites: [], returning: false, complaint: complaintCustomers.has(cid), conversationId: conv.id,
      });
    }

    for (const c of map.values()) {
      c.count = c.orders.length;
      c.avg = c.count ? Math.round(c.total / c.count) : 0;
      c.returning = c.count >= 2;
      if (c.customerId && complaintCustomers.has(c.customerId)) c.complaint = true;
      // favorites from real order items (top by qty)
      const items = new Map<string, number>();
      for (const o of c.orders) for (const it of o.items) items.set(it.name, (items.get(it.name) ?? 0) + (it.quantity || 1));
      c.favorites = [...items.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, qty]) => ({ name, qty }));
    }

    return [...map.values()].sort((a, b) => (b.lastMs ?? 0) - (a.lastMs ?? 0));
  }, [orders, conversations, hydrated]);

  const list = useMemo(() => {
    const q = query.trim();
    return customers.filter((c) => {
      if (filter === "returning" && !c.returning) return false;
      if (filter === "new" && c.returning) return false;
      if (q && !(c.name.includes(q) || c.phone.includes(q))) return false;
      return true;
    });
  }, [customers, filter, query]);

  // deeplink: /customers?c=<customerId> pre-selects that customer (from Orders).
  // Matched on the real customerId; applied once. `selected` searches the full
  // set so a filtered-out customer still opens.
  const deepKey = useRef<string | null>(null);
  const deepRef = useRef(false);
  useEffect(() => {
    if (deepRef.current || !hydrated) return;
    const id = new URLSearchParams(window.location.search).get("c");
    if (id) {
      const match = customers.find((c) => c.customerId === id || c.key === id);
      if (match) {
        deepKey.current = match.key;
        setSelKey(match.key);
      }
    }
    deepRef.current = true;
  }, [hydrated, customers]);

  useEffect(() => {
    // don't auto-pick the first customer while a deeplink owns the selection.
    if (!selKey && !deepKey.current && list.length) setSelKey(list[0].key);
    if (selKey && !list.some((c) => c.key === selKey) && selKey !== deepKey.current) {
      setSelKey(list[0]?.key ?? null);
    }
  }, [list, selKey]);

  const selected = customers.find((c) => c.key === selKey) ?? null;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "var(--kv-text)", display: "flex", flexDirection: "column", gap: 18 }}>
      <header style={{ ...rHead.style }}>
        <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 11px", borderRadius: 99, background: "rgba(14,159,110,.10)", color: "var(--kv-deep)", fontSize: 10.5, fontWeight: 800 }}>العملاء · اللي كريم بيعرفهم</span>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 0" }}>مين بيطلب منك</h1>
        <p style={{ fontSize: 12.5, color: "var(--kv-muted)", fontWeight: 600, margin: "6px 0 0", maxWidth: 560, lineHeight: 1.6 }}>
          العملاء اللي كريم اتعامل معاهم، وذاكرته عنهم. حقائق من طلباتهم، وملاحظات كريم كتلميحات للفريق — مش ضمانات.
        </p>
      </header>

      <section style={{ ...rBody.style, display: "grid", gridTemplateColumns: "340px 1fr", gap: 18, alignItems: "start" }}>
        {/* LIST */}
        <div style={{ borderRadius: 18, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-card)", overflow: "hidden" }}>
          <div style={{ padding: "15px 16px 11px", borderBottom: "1px solid #eef2f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, fontWeight: 800 }}>العملاء</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>{toAr(customers.length)} عميل</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 11 }}>
              {([["all", "الكل"], ["returning", "عائدون"], ["new", "جدد"]] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setFilter(k)} style={{
                  height: 25, padding: "0 11px", borderRadius: 99, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 800,
                  border: filter === k ? "0" : "1px solid var(--kv-border)",
                  background: filter === k ? "var(--kv-primary)" : "var(--kv-card)",
                  color: filter === k ? "#fff" : "var(--kv-muted)",
                }}>{lbl}</button>
              ))}
            </div>
          </div>
          <div className="kv-scroll" style={{ maxHeight: 520, overflowY: "auto", padding: 8 }}>
            {!hydrated || list.length === 0 ? (
              <div style={{ padding: "48px 12px", textAlign: "center", color: "var(--kv-faint)", fontSize: 12.5, fontWeight: 600 }}>
                {hydrated ? "مفيش عملاء لسه" : "بنحمّل…"}
              </div>
            ) : list.map((c) => {
              const sel = c.key === selKey;
              return (
                <button key={c.key} onClick={() => setSelKey(c.key)} style={{
                  display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "start", cursor: "pointer", fontFamily: "inherit",
                  padding: 11, borderRadius: 13, marginBottom: 6,
                  background: sel ? "linear-gradient(155deg,rgba(14,159,110,.08),rgba(14,159,110,.02))" : "transparent",
                  border: sel ? "1px solid rgba(14,159,110,.22)" : "1px solid transparent",
                }}>
                  <span style={{ width: 38, height: 38, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", color: "var(--kv-deep)" }}>{c.name.trim().charAt(0) || "ع"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                      {c.complaint ? <Badge tone="amber">شكوى</Badge> : c.returning ? <Badge tone="green">عائد</Badge> : null}
                    </div>
                    <div style={{ fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 600, marginTop: 2, direction: "ltr", textAlign: "right" }}>{c.phone || "—"}</div>
                  </div>
                  <div style={{ textAlign: "left", flex: "none" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: c.returning ? "var(--kv-deep)" : "#3e4b45" }}>{toAr(c.count)} {c.count === 1 ? "طلب" : "طلبات"}</div>
                    <div style={{ fontSize: 9, color: "var(--kv-faint)", fontWeight: 700, marginTop: 2 }}>{recency(c.lastMs)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* PROFILE */}
        {selected ? <Profile key={selected.key} c={selected} /> : (
          <div style={{ borderRadius: 18, background: "var(--kv-card)", border: "1px solid var(--kv-border)", minHeight: 300, display: "grid", placeItems: "center", color: "var(--kv-faint)", fontWeight: 600 }}>اختر عميل</div>
        )}
      </section>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" }) {
  const green = tone === "green";
  return <span style={{ height: 16, display: "inline-flex", alignItems: "center", padding: "0 6px", borderRadius: 99, background: green ? "rgba(14,159,110,.12)" : "rgba(201,138,31,.16)", color: green ? "#0a8a5f" : "#9a6a14", fontSize: 8, fontWeight: 800 }}>{children}</span>;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "0 16px 40px -34px rgba(16,60,44,.3)", padding: "18px 20px", ...style }}>{children}</div>;
}
function Tag({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "slate" }) {
  const green = tone === "green";
  return <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 5, height: 20, padding: "0 9px", borderRadius: 99, background: green ? "rgba(14,159,110,.1)" : "rgba(100,116,139,.12)", color: green ? "var(--kv-deep)" : "#51637a", fontSize: 9, fontWeight: 800 }}>{children}</span>;
}

function Profile({ c }: { c: Customer }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* header card */}
      <div style={{ borderRadius: 18, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-card)", padding: "22px 24px", display: "flex", alignItems: "center", gap: 18, position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(300px 160px at 92% 0%,rgba(14,159,110,.08),transparent 70%)", pointerEvents: "none" }} />
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "var(--kv-grad-brand)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 24, boxShadow: "0 16px 30px -16px rgba(10,138,95,.7)", flex: "none" }}>{c.name.trim().charAt(0) || "ع"}</div>
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{c.name}</h2>
            <span style={{ height: 21, display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: 99, background: "rgba(14,159,110,.12)", color: "#0a8a5f", fontSize: 10, fontWeight: 800 }}>{c.returning ? "عميل عائد" : "عميل جديد"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 7 }}>
            <span style={{ fontSize: 11.5, color: "var(--kv-muted)", fontWeight: 700, direction: "ltr" }}>{c.phone || "—"}</span>
          </div>
        </div>
        {c.conversationId && (
          <Link href={`/conversations?c=${c.conversationId}`} style={{ position: "relative", height: 36, padding: "0 15px", borderRadius: 11, background: "var(--kv-primary)", color: "#fff", fontSize: 11.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none", boxShadow: "0 14px 26px -16px rgba(14,159,110,.7)", flex: "none" }}>
            <MessageCircle size={14} /> افتح المحادثة
          </Link>
        )}
      </div>

      {/* facts strip — all from real orders */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Fact label="عدد الطلبات" value={toAr(c.count)} />
        <Fact label="إجمالي الإنفاق" value={c.count ? money(c.total) : "—"} unit={c.count ? "ج.م" : undefined} />
        <Fact label="متوسط الطلب" value={c.count ? money(c.avg) : "—"} unit={c.count ? "ج.م" : undefined} />
        <Fact label="آخر طلب" value={recency(c.lastMs)} />
      </div>

      {/* memory + favorites */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14 }}>
        <MemoryCard customerId={c.customerId} />
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>أصنافها المفضّلة</h3>
            <Tag>حقائق</Tag>
          </div>
          {c.favorites.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {c.favorites.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 11px", borderRadius: 11, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)" }}>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{f.name}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>×{toAr(f.qty)}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600 }}>لسه مفيش أصناف متكررة.</div>}
        </Card>
      </div>

      {/* order history — real orders */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>سجل طلباتها</h3>
          <Tag>حقائق</Tag>
        </div>
        {c.orders.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...c.orders].sort((a, b) => b.createdAt - a.createdAt).map((o) => {
              const summary = o.items.length ? `${o.items[0].name}${o.items.length > 1 ? ` +${toAr(o.items.length - 1)}` : ""}` : "—";
              return (
                <Link key={o.id} href={`/orders?o=${o.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 12, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", textDecoration: "none", color: "inherit" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-deep)" }}>#{toAr(o.orderNumber)}</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summary}</span>
                  <span style={{ fontSize: 10.5, color: "var(--kv-faint)", fontWeight: 700 }}>{recency(o.createdAt)}</span>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{money(o.total)} {o.currency}</span>
                </Link>
              );
            })}
          </div>
        ) : <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600 }}>مفيش طلبات سابقة للعميل ده لسه.</div>}
      </Card>
    </div>
  );
}

function Fact({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{ borderRadius: 14, background: "var(--kv-card)", border: "1px solid var(--kv-border)", padding: "14px 16px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginTop: 6 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
        {unit && <div style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-faint)", paddingBottom: 3 }}>{unit}</div>}
      </div>
    </div>
  );
}

// Karim memory — real /api/customer-memory (gated, honest-empty). Allergy hint is
// an operator HINT with the exact mandatory wording, never a safety guarantee.
type Memory = { preferences?: string[]; allergy_notes?: string[] };
function MemoryCard({ customerId }: { customerId?: string }) {
  const [mem, setMem] = useState<Memory | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!customerId) { setLoaded(true); setMem(null); return; }
    let alive = true;
    setLoaded(false);
    fetch(`/api/customer-memory?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { const m = d?.memory ?? d ?? null; setMem(m?.inferred ?? m ?? null); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [customerId]);

  const prefs = mem?.preferences ?? [];
  const allergy = mem?.allergy_notes ?? [];

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>ذاكرة كريم عنها</h3>
        <Tag tone="slate">قراءة كريم</Tag>
      </div>
      {!loaded ? (
        <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600 }}>بنحمّل…</div>
      ) : prefs.length === 0 && allergy.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600, lineHeight: 1.6 }}>لسه مفيش ذاكرة محفوظة للعميل ده — مش هنخمّن تفضيلات.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {prefs.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 11.5, color: "#3e4b45", fontWeight: 600, lineHeight: 1.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--kv-primary)", marginTop: 6, flex: "none" }} />{p}
            </div>
          ))}
        </div>
      )}
      {allergy.length > 0 && (
        <div style={{ marginTop: 14, borderRadius: 12, border: "1px solid rgba(192,73,47,.22)", background: "rgba(192,73,47,.05)", padding: "11px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <AlertTriangle size={15} color="#c0492f" />
            <span style={{ fontSize: 11.5, fontWeight: 800, color: "#a8412c" }}>تلميح حساسية للفريق</span>
          </div>
          <div style={{ fontSize: 10.5, color: "#7a4a3d", fontWeight: 600, marginTop: 6, lineHeight: 1.55 }}>
            {allergy.join("، ")} — <b>ده تلميح تشغيلي مش ضمان سلامة</b>، لازم الفريق يتأكّد من المكوّنات بنفسه قبل أي تأكيد.
          </div>
        </div>
      )}
    </Card>
  );
}
