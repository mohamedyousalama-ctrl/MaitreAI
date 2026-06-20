"use client";

// ============================================================================
// MaitreAI — Karim Pro P2: operator customer-memory card (READ-ONLY, operator eyes)
// Fetches /api/customer-memory (P2-gated) and renders the memory record with the
// FACTS and the LABELED INFERENCE visually distinct (the honesty convention):
//   • Facts (orders/spend/favorites/pref/channels/tier) — solid, plain.
//   • Inference (preferences/allergy/sentiment/flags) — marked «قراءة آلية · غير
//     مؤكدة». allergy_notes carry an explicit operator-hint-only caveat and are
//     NEVER a basis for telling the customer something is safe.
// Renders nothing when P2 is off for the tenant or no memory exists yet — so a
// non-enabled tenant (e.g. Wesaya until P2 is switched on) sees no card at all.
// This is shown ONLY to the operator; the customer never sees it.
// ============================================================================

import { useEffect, useState } from "react";
import { useRestaurantStore } from "@/lib/store";
import { Sparkles, Crown, AlertTriangle, Clock } from "lucide-react";

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const money = (n: number) => toAr(String(Math.round(Number(n || 0))));

interface Favorite { name: string; qty: number }
interface SentimentEntry { conversation_id: string; sentiment: string; at: string }
interface MemoryInferred {
  preferences?: string[];
  allergy_notes?: string[];
  sentiment_history?: SentimentEntry[];
  notable_flags?: string[];
  last_summary?: string | null;
}
interface Memory {
  order_count: number;
  total_spent: number;
  avg_order_value: number | null;
  first_seen: string | null;
  last_seen: string | null;
  fulfillment_pref: "delivery" | "pickup" | null;
  favorite_items: Favorite[];
  channels_used: string[];
  value_tier: "vip" | "regular" | "new" | "at_risk" | null;
  inferred: MemoryInferred | null;
}

const TIER_META: Record<string, { label: string; bg: string; fg: string; icon?: "crown" | "risk" }> = {
  vip: { label: "عميل مميّز", bg: "#FBF1DD", fg: "#946312", icon: "crown" },
  regular: { label: "عميل منتظم", bg: "#EAF1E9", fg: "#436B50" },
  new: { label: "عميل جديد", bg: "#E7EAF2", fg: "#475584" },
  at_risk: { label: "عميل متعرّض للفقد", bg: "#FBEAE5", fg: "#BE5238", icon: "risk" },
};

function daysAgo(iso: string | null): string | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - Date.parse(iso)) / (24 * 60 * 60 * 1000));
  if (d <= 0) return "اليوم";
  if (d === 1) return "أمس";
  return `منذ ${toAr(d)} يوم`;
}

const CHANNEL_AR: Record<string, string> = { whatsapp: "واتساب", web: "ويب" };
const FULFILL_AR: Record<string, string> = { delivery: "توصيل", pickup: "استلام" };

export function CustomerMemoryCard({ customerId }: { customerId?: string }) {
  const currency = useRestaurantStore((s) => s.profile.currency) || "ج.م";
  const [memory, setMemory] = useState<Memory | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setMemory(null);
    if (!customerId) { setLoaded(true); return; }
    fetch(`/api/customer-memory?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { setMemory(d?.enabled ? (d.memory as Memory | null) : null); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [customerId]);

  // P2 off, no identity, or no memory yet → render nothing (card stays hidden).
  if (!loaded || !memory) return null;

  const inf = memory.inferred ?? {};
  const hasInference =
    (inf.preferences?.length ?? 0) > 0 ||
    (inf.allergy_notes?.length ?? 0) > 0 ||
    (inf.notable_flags?.length ?? 0) > 0 ||
    (inf.sentiment_history?.length ?? 0) > 0 ||
    !!inf.last_summary;
  const tier = memory.value_tier ? TIER_META[memory.value_tier] : null;
  const lastSeen = daysAgo(memory.last_seen);

  return (
    <div className="mt-3.5 rounded-[14px] border border-[#ECE3D5] p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12px] font-bold text-[#2A2019]">ذاكرة العميل</span>
        {tier && (
          <span className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[10px] font-bold" style={{ background: tier.bg, color: tier.fg }}>
            {tier.icon === "crown" && <Crown className="h-2.5 w-2.5" />}
            {tier.icon === "risk" && <AlertTriangle className="h-2.5 w-2.5" />}
            {tier.label}
          </span>
        )}
      </div>

      {/* ===== FACTS (solid; recomputed from real orders) ===== */}
      <div className="grid grid-cols-2 gap-2">
        <Fact label="عدد الطلبات" value={toAr(memory.order_count)} />
        <Fact label="إجمالي الإنفاق" value={`${money(memory.total_spent)} ${currency}`} />
        <Fact label="متوسط الفاتورة" value={memory.avg_order_value != null ? `${money(memory.avg_order_value)} ${currency}` : "—"} />
        <Fact label="الأكثر استخداماً" value={memory.fulfillment_pref ? FULFILL_AR[memory.fulfillment_pref] : "—"} />
      </div>

      {memory.favorite_items.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 text-[10.5px] text-[#9A8E7E]">الأصناف المفضّلة</div>
          <div className="flex flex-wrap gap-1.5">
            {memory.favorite_items.map((f) => (
              <span key={f.name} className="inline-flex items-center gap-1 rounded-[7px] border border-[#EFE7DA] bg-[#F7F2EA] px-2 py-0.5 text-[11px] text-[#514538]">
                {f.name} <span className="text-[#A99D8D]">×{toAr(f.qty)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-[#9A8E7E]">
        <span>القنوات: {memory.channels_used.map((c) => CHANNEL_AR[c] ?? c).join(" · ") || "—"}</span>
        {lastSeen && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> آخر طلب {lastSeen}</span>}
      </div>

      {/* ===== LABELED INFERENCE (distinct; AI read, unverified) ===== */}
      {hasInference && (
        <div className="mt-3 rounded-[11px] border border-dashed border-[#E0C4B6] bg-[#FBF7F0] p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-[#BE5238]" />
            <span className="text-[10.5px] font-bold text-[#A8472F]">قراءة آلية · غير مؤكدة</span>
          </div>

          {(inf.preferences?.length ?? 0) > 0 && (
            <InferRow label="تفضيلات" items={inf.preferences!} />
          )}
          {(inf.allergy_notes?.length ?? 0) > 0 && (
            <div className="mt-1.5">
              <InferRow label="حساسية (تنبيه تشغيلي فقط)" items={inf.allergy_notes!} tone="warn" />
              <div className="mt-1 text-[9.5px] leading-relaxed text-[#A8472F]">تنبيه للموظف فقط — لا يُعتمد عليه لتأكيد سلامة أي صنف للعميل.</div>
            </div>
          )}
          {(inf.notable_flags?.length ?? 0) > 0 && (
            <InferRow label="ملاحظات" items={inf.notable_flags!} />
          )}
          {(inf.sentiment_history?.length ?? 0) > 0 && (
            <div className="mt-1.5 text-[11px] text-[#6B6055]">
              <span className="text-[#9A8E7E]">المزاج الأخير: </span>
              {inf.sentiment_history!.slice(-3).map((s) => s.sentiment).join(" → ")}
            </div>
          )}
          {inf.last_summary && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#6B6055]">{inf.last_summary}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[#EFE7DA] bg-[#F7F2EA] p-2">
      <div className="text-[10px] text-[#9A8E7E]">{label}</div>
      <div className="mt-0.5 text-[12.5px] font-bold text-[#2A2019]">{value}</div>
    </div>
  );
}

function InferRow({ label, items, tone }: { label: string; items: string[]; tone?: "warn" }) {
  return (
    <div className="text-[11px]">
      <span className="text-[#9A8E7E]">{label}: </span>
      <span style={{ color: tone === "warn" ? "#A8472F" : "#514538" }}>{items.join("، ")}</span>
    </div>
  );
}
