"use client";

// ============================================================================
// MaitreAI — SR1 global console search (topbar). Debounced server search over
// orders + customers + conversations via GET /api/search (tenant-scoped, phone
// normalized server-side). Grouped dropdown; each row navigates on click (URL
// deep-link + a console-ui focus signal so same-page clicks re-select reactively).
// Keeps the shared `query` (the per-page .includes filter still narrows the list).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { useConsoleUi } from "./console-ui-store";

interface OrderHit { id: string; orderNumber: string; customerName: string | null; total: number | null; currency: string | null }
interface CustomerHit { id: string; name: string | null; phone: string | null }
interface ConversationHit { id: string; customerName: string; snippet: string | null }
interface Results { orders: OrderHit[]; customers: CustomerHit[]; conversations: ConversationHit[] }

const EMPTY: Results = { orders: [], customers: [], conversations: [] };
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

export function GlobalSearch() {
  const query = useConsoleUi((s) => s.query);
  const setQuery = useConsoleUi((s) => s.setQuery);
  const setFocus = useConsoleUi((s) => s.setFocus);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Results>(EMPTY);
  const ref = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);

  // Debounced server search (≥2 chars).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(EMPTY); setLoading(false); return; }
    setLoading(true);
    const seq = ++reqSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = res.ok ? ((await res.json()) as Results) : EMPTY;
        if (seq === reqSeq.current) { setResults({ orders: j.orders ?? [], customers: j.customers ?? [], conversations: j.conversations ?? [] }); }
      } catch {
        if (seq === reqSeq.current) setResults(EMPTY);
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Close on outside-click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const go = (kind: "order" | "customer" | "conversation", id: string, href: string) => {
    setFocus(kind, id);   // reactive selection (same-page + cross-page)
    router.push(href);    // URL deep-link (shareable / fresh-load read)
    setOpen(false);
  };

  const q = query.trim();
  const hasAny = results.orders.length || results.customers.length || results.conversations.length;
  const showDropdown = open && q.length >= 2;

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, maxWidth: 420 }}>
      {/* Search pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, height: 38, padding: "0 14px", borderRadius: 99, border: "1px solid var(--kv-border)", background: "var(--kv-card-soft)" }}>
        <Search size={15} color="#9aa8a0" style={{ flex: "none" }} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="دوّر برقم الطلب أو اسم العميل أو رقم الموبايل"
          style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--kv-text)" }}
        />
        {loading && <Loader2 size={14} className="animate-spin" color="#9aa8a0" style={{ flex: "none" }} />}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div style={{ position: "absolute", insetInlineStart: 0, top: 44, width: "min(440px, 92vw)", maxHeight: 420, overflowY: "auto", background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: 14, boxShadow: "var(--kv-shadow-panel)", zIndex: 40, padding: 6 }}>
          {!hasAny && !loading ? (
            <div style={{ padding: "22px 12px", textAlign: "center", color: "var(--kv-faint)", fontSize: 12, fontWeight: 600 }}>مفيش نتائج</div>
          ) : (
            <>
              <Group label="الطلبات" show={results.orders.length > 0}>
                {results.orders.map((o) => (
                  <Row key={o.id} onClick={() => go("order", o.id, `/orders?o=${o.id}`)}
                    title={`#${toAr(o.orderNumber)}${o.customerName ? ` · ${o.customerName}` : ""}`}
                    sub={o.total != null ? `${toAr(Math.round(Number(o.total)))} ${o.currency ?? ""}` : undefined} />
                ))}
              </Group>
              <Group label="العملاء" show={results.customers.length > 0}>
                {results.customers.map((c) => (
                  <Row key={c.id} onClick={() => go("customer", c.id, `/customers?c=${c.id}`)}
                    title={c.name || c.phone || "عميل"} sub={c.phone ? toAr(c.phone) : undefined} />
                ))}
              </Group>
              <Group label="المحادثات" show={results.conversations.length > 0}>
                {results.conversations.map((c) => (
                  <Row key={c.id} onClick={() => go("conversation", c.id, `/conversations?c=${c.id}`)}
                    title={c.customerName} sub={c.snippet ?? undefined} />
                ))}
              </Group>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, show, children }: { label: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ padding: "6px 10px 4px", fontSize: 10, fontWeight: 800, color: "var(--kv-faint)" }}>{label}</div>
      {children}
    </div>
  );
}

function Row({ title, sub, onClick }: { title: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "block", width: "100%", textAlign: "start", cursor: "pointer", fontFamily: "inherit", padding: "8px 10px", borderRadius: 10, border: 0, background: "transparent" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--kv-card-soft)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 600, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", direction: "rtl" }}>{sub}</div>}
    </button>
  );
}
