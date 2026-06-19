"use client";

// ============================================================================
// MaitreAI — العروض (Promotions) — Terracotta redesign.
// REAL data: the existing DB-backed `promotions` table via useRestaurantStore
// (promotions / addPromotion / togglePromotionActive / deletePromotion — all
// persist) and the existing promo ENGINE in lib/promo.ts (computeAffected is the
// pricing tool; draftToRow builds the row). The manual create form writes a real
// promo row (no migration). HONEST: the «كريم يقترح» AI-suggestion engine and the
// auto-publish to WhatsApp/Instagram do NOT exist yet → clearly «قريبًا». No fake
// active offers, no fabricated usage counts (the table has no usage-count field).
// NOTE: promos are loaded by loadBrain but NOT yet injected into the customer-
// agent prompt, so كريم can't quote them yet — that's a small agent-side follow-up
// (no migration). This page is operator-UI only.
// ============================================================================

import { useMemo, useState } from "react";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useRole } from "@/lib/use-role";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  computeAffected,
  draftToRow,
  offerSummary,
  OFFER_LABELS,
  type PromoDraft,
  type PromoOfferType,
  type PromoScopeType,
} from "@/lib/promo";
import type { OperatorPromotion } from "@/lib/types";
import { Sparkles, Plus, Tag, Trash2, Megaphone, X, Send } from "lucide-react";

// Stored promo `type` values (draftToRow maps fixed_price→"combo") → Arabic label.
const TYPE_LABEL: Record<string, string> = {
  percent_off: "خصم نسبة",
  amount_off: "خصم مبلغ",
  combo: "سعر ثابت",
  fixed_price: "سعر ثابت",
  bogo: "اشترِ ١ واحصل على ١",
};

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
}
function dateRange(p: OperatorPromotion): string {
  const s = p.schedule as { start?: string; end?: string };
  if (!s?.start && !s?.end) return "بدون تاريخ محدد";
  return `${fmtDate(s.start)} — ${fmtDate(s.end)}`;
}
function scopeLabel(p: OperatorPromotion): string {
  const c = p.config as { scopeLabel?: string };
  return c?.scopeLabel?.trim() || "على المطعم";
}

export default function PromotionsPage() {
  const hydrated = useHasHydrated();
  const canManage = useRole() === "manager";
  const promotions = useRestaurantStore((s) => s.promotions);
  const togglePromotionActive = useRestaurantStore((s) => s.togglePromotionActive);
  const deletePromotion = useRestaurantStore((s) => s.deletePromotion);

  const [showCreate, setShowCreate] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<OperatorPromotion | null>(null);

  const active = useMemo(() => promotions.filter((p) => p.state === "active"), [promotions]);
  const scheduled = useMemo(() => promotions.filter((p) => p.state !== "active"), [promotions]);

  if (!hydrated) return <div className="h-[calc(100vh-7rem)] animate-pulse rounded-2xl border border-[#ECE3D5] bg-white/60" />;

  return (
    <div dir="rtl" className="mx-auto max-w-[1180px]">
      {/* header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-bold text-[#2A2019]">العروض</h2>
          <p className="mt-1 text-[12.5px] text-[#9A8E7E]">
            {active.length} عرض نشط{scheduled.length ? ` · ${scheduled.length} مجدول/متوقف` : ""}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-[11px] bg-[#BE5238] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_18px_-8px_rgba(190,82,56,.6)] transition hover:bg-[#A8472F]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} /> عرض جديد
          </button>
        )}
      </div>

      {/* كريم يقترح — AI suggestion engine not built → قريبًا (action opens manual create) */}
      <div
        className="relative mb-5 overflow-hidden rounded-[18px] p-5"
        style={{ background: "linear-gradient(150deg,#BE5238 0%,#93381F 60%,#6E2A18 100%)", boxShadow: "0 18px 38px -22px rgba(110,42,24,.7)" }}
      >
        <div className="pointer-events-none absolute -left-6 -top-10 h-56 w-56" style={{ background: "radial-gradient(circle,rgba(231,199,126,.2),transparent 65%)" }} />
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(246,237,223,.2)] bg-[rgba(255,255,255,.13)] px-3 py-1">
              <Sparkles className="h-3.5 w-3.5 text-[#EDD49A]" fill="#EDD49A" />
              <span className="text-[11.5px] font-bold text-[#F4E6C5]">كريم يقترح عرض</span>
              <span className="rounded-full bg-[rgba(255,255,255,.16)] px-2 py-0.5 text-[10px] font-bold text-[#F4E6C5]">قريبًا</span>
            </div>
            <div className="mb-1.5 text-[19px] font-bold leading-snug text-white">
              كريم هيلاحظ الأصناف الراكدة وأوقات الهدوء ويقترح عرض في وقته
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-[#E9C7BA]">
              محرّك الاقتراح الذكي لسه قيد التطوير. لحد ما يجهز، تقدر تعمل عروضك يدويًا — والأسعار بتتحسب من المنيو الحقيقي.
            </p>
          </div>
          <div className="flex w-full flex-shrink-0 flex-col gap-2.5 sm:w-[180px]">
            {canManage && (
              <button
                onClick={() => setShowCreate(true)}
                className="rounded-[11px] bg-white py-3 text-center text-[13px] font-bold text-[#BE5238] transition hover:bg-[#FBF1ED]"
              >
                أنشئ عرض يدويًا
              </button>
            )}
            <div className="rounded-[11px] border border-[rgba(255,255,255,.2)] bg-[rgba(255,255,255,.12)] py-2.5 text-center text-[12px] font-semibold text-white/80">
              الاقتراح التلقائي · قريبًا
            </div>
          </div>
        </div>
      </div>

      {promotions.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[#D8C3B3] bg-white/50 p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#FBF1ED]">
            <Megaphone className="h-6 w-6 text-[#BE5238]" />
          </div>
          <div className="text-[15px] font-bold text-[#2A2019]">مفيش عروض مفعّلة</div>
          <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] text-[#9A8E7E]">أضف أول عرض — هيظهر هنا فورًا، وتقدر تفعّله أو توقفه في أي وقت.</p>
          {canManage && (
            <button onClick={() => setShowCreate(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-[11px] bg-[#BE5238] px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#A8472F]">
              <Plus className="h-4 w-4" /> أضف عرض
            </button>
          )}
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <div className="mb-3 text-[14px] font-bold text-[#2A2019]">العروض النشطة</div>
              <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {active.map((p) => (
                  <PromoCard key={p.id} p={p} canManage={canManage} onToggle={() => togglePromotionActive(p.id, false)} onDelete={() => setPendingDelete(p)} />
                ))}
              </div>
            </>
          )}

          <div className="mb-3 text-[14px] font-bold text-[#2A2019]">مجدولة ومتوقفة</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scheduled.map((p) => (
              <PromoCard key={p.id} p={p} canManage={canManage} onToggle={() => togglePromotionActive(p.id, true)} onDelete={() => setPendingDelete(p)} />
            ))}
            {canManage && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex flex-col items-center justify-center gap-2 rounded-[16px] border-[1.5px] border-dashed border-[#D8C3B3] p-5 text-[#A8907E] transition hover:border-[#BE5238] hover:bg-[#FBF6F0] hover:text-[#BE5238]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#FBF1ED]"><Plus className="h-5 w-5 text-[#BE5238]" /></span>
                <span className="text-[13px] font-bold">أنشئ عرض جديد</span>
                <span className="text-[11px] text-[#A99D8D]">الأسعار بتتحسب من المنيو</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* auto-publish: honest قريبًا */}
      <p className="mt-5 text-center text-[11.5px] text-[#A99D8D]">
        النشر التلقائي على واتساب وإنستجرام — <span className="text-[#C5871F]">قريبًا</span>
      </p>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف العرض؟"
        message={pendingDelete ? `هيتحذف «${pendingDelete.name}» نهائيًا من المطعم.` : ""}
        confirmLabel="حذف العرض"
        onConfirm={() => {
          if (pendingDelete) deletePromotion(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

// --- promo card -------------------------------------------------------------
function PromoCard({ p, canManage, onToggle, onDelete }: { p: OperatorPromotion; canManage: boolean; onToggle: () => void; onDelete: () => void }) {
  const isActive = p.state === "active";
  return (
    <div className="rounded-[16px] border border-[#ECE3D5] bg-white p-4 transition hover:border-[#E0C4B6]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px] bg-[#FBEAE5]">
            <Tag className="h-5 w-5 text-[#BE5238]" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-bold text-[#2A2019]">{p.name}</div>
            <div className="mt-0.5 truncate text-[11.5px] text-[#9A8E7E]">
              {TYPE_LABEL[p.type] ?? p.type} · {scopeLabel(p)}
            </div>
          </div>
        </div>
        {/* real activate/deactivate toggle (managers only) */}
        {canManage && (
          <button
            onClick={onToggle}
            aria-label={isActive ? "إيقاف" : "تفعيل"}
            className="relative h-[22px] w-[38px] flex-none rounded-full transition"
            style={{ background: isActive ? "#5C8A6B" : "#E2D8C7" }}
          >
            <span className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ [isActive ? "left" : "right"]: "2px" } as React.CSSProperties} />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-[#F2EBE0] pt-3">
        <div>
          <div className="text-[10.5px] text-[#9A8E7E]">{dateRange(p)}</div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold" style={{ color: isActive ? "#436B50" : "#9A8E7E" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: isActive ? "#5C8A6B" : "#C9BFAE" }} />
            {isActive ? "نشط" : "متوقف"}
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {!isActive && (
              <button onClick={onToggle} className="rounded-[9px] bg-[#BE5238] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#A8472F]">فعّل</button>
            )}
            <button onClick={onDelete} aria-label="حذف" className="flex h-8 w-8 items-center justify-center rounded-[9px] text-[#A99D8D] transition hover:bg-[#FBEAE5] hover:text-[#BE5238]">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- create modal (real promo via the existing engine) ----------------------
const OFFER_TYPES: PromoOfferType[] = ["percent_off", "amount_off", "fixed_price", "bogo"];

function CreateModal({ onClose }: { onClose: () => void }) {
  const menuItems = useRestaurantStore((s) => s.menuItems);
  const currency = useRestaurantStore((s) => s.profile.currency);
  const addPromotion = useRestaurantStore((s) => s.addPromotion);

  const categories = useMemo(
    () => [...new Set(menuItems.filter((i) => i.available && i.category).map((i) => i.category))],
    [menuItems]
  );
  const availItems = useMemo(() => menuItems.filter((i) => i.available), [menuItems]);

  const [scopeType, setScopeType] = useState<PromoScopeType>("category");
  const [scopeRef, setScopeRef] = useState<string>(categories[0] ?? "");
  const [offerType, setOfferType] = useState<PromoOfferType>("percent_off");
  const [amount, setAmount] = useState<string>("20");
  const [durationDays, setDurationDays] = useState<string>("7");
  const [name, setName] = useState<string>("");

  const scopeLabelText =
    scopeType === "all"
      ? "كل المنيو"
      : scopeType === "category"
        ? scopeRef
        : availItems.find((i) => i.id === scopeRef)?.name ?? "";

  const draft: PromoDraft = {
    scopeType,
    scopeRef: scopeType === "all" ? undefined : scopeRef,
    scopeLabel: scopeLabelText,
    offerType,
    amount: offerType === "bogo" ? undefined : Number(amount) || 0,
    durationDays: Number(durationDays) || 7,
    name: name.trim() || undefined,
  };

  const affected = useMemo(() => computeAffected(menuItems, draft), [menuItems, scopeType, scopeRef, offerType, amount]);
  const needsAmount = offerType !== "bogo";
  const valid =
    (scopeType === "all" || !!scopeRef) &&
    affected.length > 0 &&
    (!needsAmount || Number(amount) > 0);

  const submit = (state: "active" | "paused") => {
    if (!valid) return;
    const row = draftToRow(draft);
    addPromotion(row, state);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-[20px] border border-[#ECE3D5] bg-white p-5 sm:rounded-[20px]"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[16px] font-bold text-[#2A2019]">عرض جديد</div>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-8 w-8 items-center justify-center rounded-[9px] text-[#9A8E7E] hover:bg-[#F4EEE9]"><X className="h-4 w-4" /></button>
        </div>

        {/* scope */}
        <Label>على إيه؟</Label>
        <div className="mb-2 flex gap-2">
          {([["category", "تصنيف"], ["item", "صنف"], ["all", "كل المنيو"]] as [PromoScopeType, string][]).map(([v, l]) => (
            <Chip key={v} active={scopeType === v} onClick={() => { setScopeType(v); if (v === "category") setScopeRef(categories[0] ?? ""); if (v === "item") setScopeRef(availItems[0]?.id ?? ""); }}>{l}</Chip>
          ))}
        </div>
        {scopeType === "category" && (
          <select value={scopeRef} onChange={(e) => setScopeRef(e.target.value)} className="mb-4 w-full rounded-[11px] border border-[#EBE2D3] bg-[#F7F2EA] px-3.5 py-2.5 text-[13px] text-[#2A2019] outline-none focus:border-[#BE5238]">
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {scopeType === "item" && (
          <select value={scopeRef} onChange={(e) => setScopeRef(e.target.value)} className="mb-4 w-full rounded-[11px] border border-[#EBE2D3] bg-[#F7F2EA] px-3.5 py-2.5 text-[13px] text-[#2A2019] outline-none focus:border-[#BE5238]">
            {availItems.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.price} {currency}</option>)}
          </select>
        )}
        {scopeType === "all" && <div className="mb-4" />}

        {/* offer type */}
        <Label>نوع العرض</Label>
        <div className="mb-3 flex flex-wrap gap-2">
          {OFFER_TYPES.map((t) => <Chip key={t} active={offerType === t} onClick={() => setOfferType(t)}>{OFFER_LABELS[t]}</Chip>)}
        </div>

        {needsAmount && (
          <div className="mb-3">
            <Label>{offerType === "percent_off" ? "نسبة الخصم (٪)" : offerType === "amount_off" ? `قيمة الخصم (${currency})` : `السعر الثابت (${currency})`}</Label>
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="w-full rounded-[11px] border border-[#EBE2D3] bg-[#F7F2EA] px-3.5 py-2.5 text-[14px] text-[#2A2019] outline-none focus:border-[#BE5238]" dir="ltr" />
          </div>
        )}

        <div className="mb-3">
          <Label>المدة (أيام)</Label>
          <input inputMode="numeric" value={durationDays} onChange={(e) => setDurationDays(e.target.value.replace(/[^\d]/g, ""))} className="w-full rounded-[11px] border border-[#EBE2D3] bg-[#F7F2EA] px-3.5 py-2.5 text-[14px] text-[#2A2019] outline-none focus:border-[#BE5238]" dir="ltr" />
        </div>

        <div className="mb-3">
          <Label>اسم العرض (اختياري)</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={offerSummary(draft, currency)} className="w-full rounded-[11px] border border-[#EBE2D3] bg-[#F7F2EA] px-3.5 py-2.5 text-[13.5px] text-[#2A2019] outline-none placeholder:text-[#B9AE9D] focus:border-[#BE5238]" />
        </div>

        {/* live affected preview — prices from the real menu (the pricing tool) */}
        <div className="mb-4 rounded-[12px] border border-[#EFE7DA] bg-[#F7F2EA] p-3">
          <div className="mb-1.5 text-[11.5px] font-semibold text-[#7C7163]">الأصناف المتأثرة ({affected.length}) — الأسعار محسوبة من المنيو</div>
          {affected.length === 0 ? (
            <div className="text-[12px] text-[#A99D8D]">اختر نطاقًا فيه أصناف متاحة.</div>
          ) : (
            <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
              {affected.slice(0, 8).map((a) => (
                <div key={a.name} className="flex items-center justify-between text-[12px]">
                  <span className="truncate text-[#514538]">{a.name}</span>
                  <span dir="ltr" className="flex-none font-semibold">
                    <span className="text-[#A99D8D] line-through">{a.before}</span>{" "}
                    <span className="text-[#436B50]">{Math.round(a.after * 100) / 100} {currency}</span>
                  </span>
                </div>
              ))}
              {affected.length > 8 && <div className="text-[11px] text-[#A99D8D]">+{affected.length - 8} صنف</div>}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => submit("active")} disabled={!valid} className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-[#BE5238] py-3 text-[13px] font-bold text-white transition enabled:hover:bg-[#A8472F] disabled:opacity-50">
            <Send className="h-4 w-4" /> فعّل العرض
          </button>
          <button onClick={() => submit("paused")} disabled={!valid} className="rounded-[11px] border border-[#EBE2D3] bg-white px-4 py-3 text-[13px] font-semibold text-[#514538] transition enabled:hover:border-[#E0C4B6] disabled:opacity-50">
            احفظه مجدول
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[12px] font-semibold text-[#514538]">{children}</label>;
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold transition" style={active ? { background: "#BE5238", color: "#fff" } : { background: "#fff", border: "1px solid #EBE2D3", color: "#514538" }}>
      {children}
    </button>
  );
}
