"use client";

// ============================================================================
// MaitreAI — المنيو وذاكرة المطعم (Menu & Memory) — Terracotta redesign.
// REUSES the existing DB-backed CRUD (useRestaurantStore: add/update/delete
// menu items, delivery areas, FAQ, policies — all write through to Supabase,
// the same data loadBrain feeds the agent) and the existing form modals
// (MenuItemForm / ModifierManager / DeliveryAreaForm / FaqForm). The availability
// «متاح» toggle calls updateMenuItem({available}) → persists.
// صحة الذاكرة is REAL: computeKnowledgeAreas / computeOverallScore from lib/knowledge
// (menu = item-data completeness, delivery/faq = active vs target, policy = % set).
// Truth rule: no fabricated %; the loyalty/illustrative bits are clearly marked.
// ============================================================================

import { useMemo, useState } from "react";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useRole } from "@/lib/use-role";
import { computeKnowledgeAreas, computeOverallScore } from "@/lib/knowledge";
import { MenuItemForm, type MenuItemFormValues } from "@/components/menu/MenuItemForm";
import { ModifierManager } from "@/components/menu/ModifierManager";
import { DeliveryAreaForm, type DeliveryAreaFormValues } from "@/components/restaurant-brain/DeliveryAreaForm";
import { FaqForm, type FaqFormValues } from "@/components/restaurant-brain/FaqForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { DeliveryArea, FaqItem, MenuItem, Policies } from "@/lib/types";
import { Plus, SlidersHorizontal, MapPin, HelpCircle, FileText, Sparkles, X, Trash2 } from "lucide-react";

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const POLICY_LABELS: Record<keyof Policies, string> = { refund: "سياسة الاسترجاع", cancellation: "سياسة الإلغاء", delivery: "سياسة التوصيل", replacement: "سياسة الاستبدال", payment: "سياسة الدفع" };
function catEmoji(c: string): string {
  if (/برجر/.test(c)) return "🍔"; if (/دجاج|بروست|فراخ/.test(c)) return "🍗"; if (/بيتزا/.test(c)) return "🍕";
  if (/وجب|عائل/.test(c)) return "🍱"; if (/جانب|بطاطس/.test(c)) return "🍟"; if (/مشروب/.test(c)) return "🥤";
  if (/حلو|حلويات/.test(c)) return "🍮"; if (/سلط/.test(c)) return "🥗"; return "🍽️";
}
const barColor = (s: number) => (s >= 80 ? "var(--kv-primary)" : s >= 50 ? "var(--kv-amber)" : "var(--kv-red)");

export default function MenuMemoryPage() {
  const hydrated = useHasHydrated();
  const s = useRestaurantStore();
  // Zone delete is a manager-only, destructive action (consistent with D2.1).
  const isManager = useRole() === "manager";
  const [tab, setTab] = useState<"menu" | "memory">("menu");
  const [category, setCategory] = useState("الكل");

  // form modals (existing components, persist via store handlers)
  const [itemForm, setItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [modOpen, setModOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MenuItem | null>(null);
  const [zoneForm, setZoneForm] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryArea | null>(null);
  const [zoneToDelete, setZoneToDelete] = useState<DeliveryArea | null>(null);
  const [faqForm, setFaqForm] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [editPolicy, setEditPolicy] = useState<keyof Policies | null>(null);
  const [policyDraft, setPolicyDraft] = useState("");

  const categories = useMemo(() => ["الكل", ...Array.from(new Set(s.menuItems.map((i) => i.category).filter(Boolean)))], [s.menuItems]);
  const items = category === "الكل" ? s.menuItems : s.menuItems.filter((i) => i.category === category);

  // REAL memory health
  const areas = useMemo(
    () => computeKnowledgeAreas({ menuItems: s.menuItems, modifiers: s.modifiers, branches: s.branches, faqs: s.faqs, policies: s.policies, deliveryAreas: s.deliveryAreas, aiTone: s.aiTone }),
    [s.menuItems, s.modifiers, s.branches, s.faqs, s.policies, s.deliveryAreas, s.aiTone]
  );
  const scoreOf = (k: string) => areas.find((a) => a.key === k)?.score ?? 0;
  const overall = computeOverallScore(areas);
  const HEALTH = [
    { label: "المنيو", score: scoreOf("menu") },
    { label: "مناطق التوصيل", score: scoreOf("delivery") },
    { label: "الأسئلة الشائعة", score: scoreOf("faq") },
    { label: "السياسات", score: scoreOf("policy") },
  ];
  const lowest = [...HEALTH].sort((a, b) => a.score - b.score)[0];

  // Real-time 86ing: route the one-tap toggle through the audited, tenant-scoped
  // availability path (writes a menu_availability_events row); «كريم» honors it
  // on the next turn. Optimistic flip + DB reconcile lives in the store action.
  const toggleAvail = (it: MenuItem) => s.setItemAvailability(it.id, !it.available);

  if (!hydrated) return <div className="h-[calc(100vh-8rem)] animate-pulse rounded-2xl border" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)" }} />;

  const C = 351.8, ringOff = C * (1 - overall / 100);

  return (
    <div dir="rtl" className="mx-auto max-w-[1320px]">
      {/* tab switch + add */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 rounded-[13px] border p-1.5" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)" }}>
          {(["menu", "memory"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="rounded-[9px] px-5 py-2 text-[13.5px] font-bold transition"
              style={tab === t ? { background: "var(--kv-primary)", color: "#fff", boxShadow: "0 6px 14px -6px rgba(14,159,110,.45)" } : { color: "var(--kv-muted)" }}>
              {t === "menu" ? "المنيو" : "ذاكرة المطعم"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {tab === "menu" && (
            <button onClick={() => setModOpen(true)} className="flex items-center gap-1.5 rounded-[11px] border px-3.5 py-2.5 text-[12.5px] font-semibold" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)" }}><SlidersHorizontal className="h-4 w-4" /> الإضافات</button>
          )}
          <button onClick={() => { if (tab === "menu") { setEditingItem(null); setItemForm(true); } else { setEditingZone(null); setZoneForm(true); } }}
            className="flex items-center gap-1.5 rounded-[11px] px-4 py-2.5 text-[13px] font-bold text-white" style={{ background: "var(--kv-grad-brand)", boxShadow: "0 8px 18px -8px rgba(14,159,110,.6)" }}>
            <Plus className="h-4 w-4" /> {tab === "menu" ? "صنف جديد" : "إضافة منطقة"}
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {tab === "menu" ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button key={c} onClick={() => setCategory(c)} className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition"
                    style={category === c ? { background: "var(--kv-primary)", color: "#fff" } : { background: "var(--kv-card)", border: "1px solid var(--kv-border)", color: "var(--kv-muted)" }}>{c}</button>
                ))}
              </div>
              {items.length === 0 ? (
                <div className="rounded-[16px] border p-12 text-center text-[13px]" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-faint)" }}>لا أصناف في هذا التصنيف.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((it) => (
                    <div key={it.id} className="group relative overflow-hidden rounded-[16px] border transition" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-panel)", opacity: it.available ? 1 : 0.72 }}>
                      <button onClick={(e) => { e.stopPropagation(); setToDelete(it); }} title="حذف الصنف" className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-[8px] bg-white/85 opacity-0 shadow transition group-hover:opacity-100" style={{ color: "var(--kv-red)" }}><Trash2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { setEditingItem(it); setItemForm(true); }} className="block h-[92px] w-full">
                        {it.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" style={it.available ? {} : { filter: "grayscale(.4)" }} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[40px]" style={{ background: "var(--kv-primary-tint)" }}>{catEmoji(it.category)}</div>
                        )}
                      </button>
                      <div className="p-3">
                        <div className="flex items-center justify-between">
                          <button onClick={() => { setEditingItem(it); setItemForm(true); }} className="truncate text-right text-[14px] font-bold" style={{ color: "var(--kv-text)" }}>{it.name}</button>
                          <span className="text-[14px] font-bold" style={{ color: "var(--kv-primary)" }}>{toAr(it.price)}</span>
                        </div>
                        <div className="mt-0.5 text-[11px]" style={{ color: "var(--kv-muted)" }}>{it.category || "—"}</div>
                        <div className="mt-2.5 flex items-center justify-between pt-2.5" style={{ borderTop: "1px solid var(--kv-border)" }}>
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: it.available ? "var(--kv-primary)" : "var(--kv-faint)" }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.available ? "var(--kv-primary)" : "var(--kv-border)" }} />{it.available ? "متاح" : "غير متوفر"}
                          </span>
                          {/* availability toggle → updateMenuItem (persists) */}
                          <button onClick={() => toggleAvail(it)} title={it.available ? "إيقاف الإتاحة" : "تفعيل الإتاحة"} className="relative h-[21px] w-9 rounded-full transition" style={{ background: it.available ? "var(--kv-primary)" : "var(--kv-border)" }}>
                            <span className="absolute top-[2px] h-[17px] w-[17px] rounded-full bg-white shadow" style={it.available ? { left: 2 } : { right: 2 }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-3.5">
              {/* delivery zones */}
              <Section icon={<MapPin className="h-4 w-4" style={{ color: "var(--kv-primary)" }} />} iconBg="var(--kv-primary-tint)" title="مناطق التوصيل" badge={`${toAr(s.deliveryAreas.length)} مناطق`} onAdd={() => { setEditingZone(null); setZoneForm(true); }} addLabel="إضافة منطقة">
                {s.deliveryAreas.length === 0 ? <Empty>لا مناطق توصيل بعد.</Empty> : (
                  <div className="flex flex-wrap gap-2">
                    {s.deliveryAreas.map((z) => (
                      <div key={z.id} className="inline-flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-[12.5px]" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card-soft)", color: "var(--kv-text)" }}>
                        <button onClick={() => { setEditingZone(z); setZoneForm(true); }} className="inline-flex items-center gap-2">
                          {z.name} <span className="text-[11px]" style={{ color: "var(--kv-muted)" }}>{toAr(z.deliveryFee)} {s.profile.currency}</span>{!z.active && <span className="text-[9.5px]" style={{ color: "var(--kv-faint)" }}>(موقوفة)</span>}
                        </button>
                        {isManager && (
                          <button onClick={() => setZoneToDelete(z)} title="حذف المنطقة" className="ms-1 flex h-5 w-5 items-center justify-center rounded-[6px] transition hover:bg-[rgba(192,73,47,.1)]" style={{ color: "var(--kv-red)" }}><Trash2 className="h-3 w-3" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                {/* FAQ */}
                <Section icon={<HelpCircle className="h-4 w-4" style={{ color: "var(--kv-primary)" }} />} iconBg="var(--kv-primary-tint)" title="الأسئلة الشائعة" onAdd={() => { setEditingFaq(null); setFaqForm(true); }} addLabel="إضافة سؤال">
                  {s.faqs.length === 0 ? <Empty>لا أسئلة بعد.</Empty> : (
                    <div className="flex flex-col gap-2.5">
                      {s.faqs.map((f) => (
                        <button key={f.id} onClick={() => { setEditingFaq(f); setFaqForm(true); }} className="rounded-[11px] border p-3 text-right" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card-soft)", opacity: f.active ? 1 : 0.6 }}>
                          <div className="text-[12.5px] font-semibold" style={{ color: "var(--kv-text)" }}>{f.question}</div>
                          <div className="mt-1 line-clamp-2 text-[11.5px]" style={{ color: "var(--kv-muted)" }}>{f.answer}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </Section>

                {/* policies — real completeness; edit reuses updatePolicies */}
                <Section icon={<FileText className="h-4 w-4" style={{ color: "var(--kv-primary)" }} />} iconBg="var(--kv-primary-tint)" title="السياسات">
                  <div className="flex flex-col gap-2">
                    {(Object.keys(POLICY_LABELS) as (keyof Policies)[]).map((k) => {
                      const set = (s.policies[k] ?? "").trim().length > 0;
                      return (
                        <button key={k} onClick={() => { setEditPolicy(k); setPolicyDraft(s.policies[k] ?? ""); }}
                          className="flex items-center justify-between rounded-[11px] border p-3 text-right transition"
                          style={set ? { background: "var(--kv-card-soft)", borderColor: "var(--kv-border)" } : { background: "rgba(216,151,43,.12)", borderColor: "rgba(216,151,43,.34)" }}>
                          <span className="text-[12.5px] font-semibold" style={{ color: "var(--kv-text)" }}>{POLICY_LABELS[k]}</span>
                          <span className="text-[10.5px] font-bold" style={{ color: set ? "var(--kv-primary)" : "var(--kv-amber)" }}>{set ? "مكتملة ✓" : "ناقصة"}</span>
                        </button>
                      );
                    })}
                  </div>
                </Section>
              </div>
            </div>
          )}
        </div>

        {/* صحة الذاكرة rail (REAL) */}
        <aside className="hidden w-[286px] flex-none rounded-[16px] border p-4 lg:block" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-panel)", alignSelf: "flex-start" }}>
          <div className="mb-4 text-[14px] font-bold" style={{ color: "var(--kv-text)" }}>اكتمال بيانات كريم</div>
          <div className="flex flex-col items-center pb-4">
            <div className="relative h-[132px] w-[132px]">
              <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="66" cy="66" r="56" fill="none" stroke="#E7EFEB" strokeWidth="13" />
                <circle cx="66" cy="66" r="56" fill="none" stroke="#0E9F6E" strokeWidth="13" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={ringOff} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[34px] font-bold tracking-tight" style={{ color: "var(--kv-text)" }}>{toAr(overall)}٪</span><span className="mt-0.5 text-[11px]" style={{ color: "var(--kv-muted)" }}>مكتملة</span></div>
            </div>
          </div>
          <div className="mb-4 flex flex-col gap-2.5">
            {HEALTH.map((h) => (
              <div key={h.label}>
                <div className="mb-1.5 flex justify-between text-[12px]"><span style={{ color: "var(--kv-muted)" }}>{h.label}</span><span className="font-bold" style={{ color: barColor(h.score) }}>{toAr(h.score)}٪</span></div>
                <div className="h-1.5 rounded-full" style={{ background: "var(--kv-border)" }}><div className="h-full rounded-full" style={{ width: `${h.score}%`, background: barColor(h.score) }} /></div>
              </div>
            ))}
          </div>
          {/* tip derived from the REAL lowest area (no fabricated count) */}
          {lowest.score < 100 && (
            <div className="rounded-[14px] border p-3" style={{ borderColor: "rgba(14,159,110,.2)", background: "var(--kv-primary-tint)" }}>
              <div className="mb-2 flex items-center gap-2"><span className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] text-white" style={{ background: "var(--kv-grad-brand)" }}><Sparkles className="h-3.5 w-3.5" /></span><span className="text-[12.5px] font-bold" style={{ color: "var(--kv-deep)" }}>كريم يقترح</span></div>
              <p className="mb-3 text-[12px] leading-relaxed" style={{ color: "var(--kv-muted)" }}>أكمِل <span className="font-bold">{lowest.label}</span> — اكتمالها الآن {toAr(lowest.score)}٪. كل ما الذاكرة تكتمل، المساعد يرد أصح.</p>
              <button onClick={() => setTab(lowest.label === "المنيو" ? "menu" : "memory")} className="w-full rounded-[9px] py-2 text-[12px] font-bold text-white" style={{ background: "var(--kv-grad-brand)" }}>افتح القسم</button>
            </div>
          )}
        </aside>
      </div>

      {/* ===== existing form modals (reused, persist) ===== */}
      <MenuItemForm open={itemForm} initial={editingItem} categories={categories.filter((c) => c !== "الكل")} modifiers={s.modifiers}
        onClose={() => setItemForm(false)}
        onSubmit={(v: MenuItemFormValues) => { if (editingItem) s.updateMenuItem(editingItem.id, v); else s.addMenuItem(v); setItemForm(false); }} />
      <ModifierManager open={modOpen} onClose={() => setModOpen(false)} />
      <DeliveryAreaForm open={zoneForm} initial={editingZone} branches={s.branches} currency={s.profile.currency} defaultBranchId={s.branches[0]?.id}
        onClose={() => setZoneForm(false)}
        onSubmit={(v: DeliveryAreaFormValues) => { if (editingZone) s.updateDeliveryArea(editingZone.id, v); else s.addDeliveryArea(v); setZoneForm(false); }} />
      <FaqForm open={faqForm} initial={editingFaq}
        onClose={() => setFaqForm(false)}
        onSubmit={(v: FaqFormValues) => { if (editingFaq) s.updateFaq(editingFaq.id, v); else s.addFaq(v); setFaqForm(false); }} />
      <ConfirmDialog open={!!toDelete} title="حذف الصنف" message={`سيتم حذف «${toDelete?.name}» من المنيو.`}
        onConfirm={() => { if (toDelete) s.deleteMenuItem(toDelete.id); setToDelete(null); }} onCancel={() => setToDelete(null)} />
      <ConfirmDialog open={!!zoneToDelete} title="حذف منطقة التوصيل"
        message={`سيتم حذف منطقة «${zoneToDelete?.name}» نهائيًا. الطلبات السابقة المرتبطة بها لن تتأثر — يُزال ربط المنطقة فقط.`}
        onConfirm={() => { if (zoneToDelete) s.deleteDeliveryArea(zoneToDelete.id); setZoneToDelete(null); }} onCancel={() => setZoneToDelete(null)} />

      {/* policy inline editor (reuses updatePolicies) */}
      {editPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditPolicy(null)} />
          <div className="relative w-full max-w-md rounded-2xl p-5" style={{ background: "var(--kv-card)" }}>
            <div className="mb-3 flex items-center justify-between"><span className="text-[15px] font-bold" style={{ color: "var(--kv-text)" }}>{POLICY_LABELS[editPolicy]}</span><button onClick={() => setEditPolicy(null)} style={{ color: "var(--kv-muted)" }}><X className="h-5 w-5" /></button></div>
            <textarea value={policyDraft} onChange={(e) => setPolicyDraft(e.target.value)} rows={5} placeholder="اكتب نص السياسة…" className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card-soft)", color: "var(--kv-text)" }} />
            <div className="mt-4 flex gap-2">
              <button onClick={() => { s.updatePolicies({ [editPolicy]: policyDraft } as Partial<Policies>); setEditPolicy(null); }} className="flex-1 rounded-lg py-2.5 text-[13px] font-bold text-white" style={{ background: "var(--kv-grad-brand)" }}>حفظ</button>
              <button onClick={() => setEditPolicy(null)} className="flex-1 rounded-lg border py-2.5 text-[13px]" style={{ borderColor: "var(--kv-border)", color: "var(--kv-muted)" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- pieces ----------------------------------------------------------------
function Section({ icon, iconBg, title, badge, onAdd, addLabel, children }: { icon: React.ReactNode; iconBg: string; title: string; badge?: string; onAdd?: () => void; addLabel?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border p-4" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-panel)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]" style={{ background: iconBg }}>{icon}</span>
          <span className="text-[15px] font-bold" style={{ color: "var(--kv-text)" }}>{title}</span>
          {badge && <span className="rounded-[6px] px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--kv-primary-tint)", color: "var(--kv-deep)" }}>{badge}</span>}
        </div>
        {onAdd && <button onClick={onAdd} className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--kv-primary)" }}><Plus className="h-3.5 w-3.5" />{addLabel}</button>}
      </div>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[11px] border p-4 text-center text-[12px]" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card-soft)", color: "var(--kv-faint)" }}>{children}</div>;
}
