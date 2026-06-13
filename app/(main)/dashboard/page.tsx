"use client";

// ============================================================================
// MaitreAI — الرئيسية / Maître console (Amendment 04 §M3 + Amendment 05 §P)
// Fixed chips = deterministic intents ($0, no LLM). Free text → the Admin Agent
// (/api/agent/admin). The in-chat PROMOTION builder (Phase 1, §T) lives entirely
// here — conceive → design → price → preview → approve → launch without ever
// leaving the thread. Prices are tool-computed (lib/promo), the LLM only drafts
// caption voice, and publish is manager-gated server-side (§P2).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConversationStore } from "@/lib/conversation-store";
import { useOrderStore } from "@/lib/order-store";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useOpsStore } from "@/lib/ops-store";
import {
  computeAffected,
  nextStep,
  offerSummary,
  type PromoDraft,
} from "@/lib/promo";
import type { MenuItem } from "@/lib/types";
import { AlertTriangle, ArrowLeft, Send, Megaphone, Check, X, Loader2, BarChart3, Tag, Sparkles } from "lucide-react";

interface AdminPreview {
  intent: string;
  params: Record<string, unknown>;
  label: string;
  before: string;
  after: string;
  resolved?: boolean;
}
type PromoChip = { label: string; patch: Partial<PromoDraft> };
interface PromoMenu {
  items: { id: string; name: string; category: string; price: number }[];
  categories: string[];
  currency: string;
  restaurantName: string;
}
interface Msg {
  id: string;
  role: "assistant" | "user";
  text: string;
  card?: "escalations";
  confirm?: { action: "open" | "close"; resolved?: boolean };
  adminCard?: { type: string; data: Record<string, number> };
  adminPreview?: AdminPreview;
  promoChips?: PromoChip[];
  promoReview?: boolean; // render the live preview card from the active draft
  promoSuccess?: string;
  loading?: boolean;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const uid = () => Math.random().toString(36).slice(2);

const OFFER_CHIPS: PromoChip[] = [
  { label: "خصم نسبة ٪", patch: { offerType: "percent_off" } },
  { label: "خصم مبلغ", patch: { offerType: "amount_off" } },
  { label: "سعر ثابت", patch: { offerType: "fixed_price" } },
  { label: "اشترِ 1 واحصل على 1", patch: { offerType: "bogo" } },
];
const PCT_CHIPS: PromoChip[] = [10, 15, 20, 25, 30].map((n) => ({ label: `${n}٪`, patch: { amount: n } }));
const DUR_CHIPS: PromoChip[] = [
  { label: "يوم", patch: { durationDays: 1 } },
  { label: "3 أيام", patch: { durationDays: 3 } },
  { label: "أسبوع", patch: { durationDays: 7 } },
  { label: "أسبوعين", patch: { durationDays: 14 } },
];

export default function MaitreConsole() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const restaurantName = useRestaurantStore((s) => s.profile.name);
  const currency = useRestaurantStore((s) => s.profile.currency);
  const conversations = useConversationStore((s) => s.conversations);
  const orders = useOrderStore((s) => s.orders);
  const { isOpen, agentEnabled, setOpen } = useOpsStore();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const seeded = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  // In-chat promo builder state (single active draft).
  const promoMenuRef = useRef<PromoMenu | null>(null);
  const [promoDraft, setPromoDraft] = useState<PromoDraft | null>(null);
  const promoDraftRef = useRef<PromoDraft | null>(null);
  const [promoImg, setPromoImg] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const setDraft = (d: PromoDraft | null) => {
    promoDraftRef.current = d;
    setPromoDraft(d);
  };

  const escalations = conversations.filter(
    (c) => c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف" || c.owner === "human"
  ).length;
  const openConvs = conversations.filter((c) => c.status !== "طلب مكتمل").length;
  const ordersToday = orders.filter((o) => o.createdAt >= startOfToday()).length;

  useEffect(() => {
    if (!hydrated || seeded.current) return;
    seeded.current = true;
    const hour = new Date().getHours();
    const greet = hour < 12 ? "صباح الخير" : "مساء الخير";
    const proactive =
      escalations > 0
        ? `عندك ${escalations} محادثة تحتاج تدخّلك الآن.`
        : !isOpen
        ? "المطعم مغلق حالياً — تقدر تفتحه وقت ما تكون جاهز."
        : !agentEnabled
        ? "المساعد متوقف حالياً ولا يرد على العملاء."
        : "كل شيء يسير بسلاسة — لا توجد تصعيدات تحتاج تدخّلك.";
    setMessages([{ id: uid(), role: "assistant", text: `${greet} 👋 ${proactive}`, card: escalations > 0 ? "escalations" : undefined }]);
  }, [hydrated, escalations, isOpen, agentEnabled]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const push = (m: Omit<Msg, "id">) => {
    const id = uid();
    setMessages((x) => [...x, { id, ...m }]);
    return id;
  };
  const update = (id: string, patch: Partial<Msg>) => setMessages((x) => x.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const replyA = (text: string, extra?: Partial<Msg>) => push({ role: "assistant", text, ...extra });

  // ---- in-chat promo builder ------------------------------------------------
  async function startPromo() {
    if (!promoMenuRef.current) {
      setPromoBusy(true);
      try {
        const res = await fetch("/api/agent/promo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "menu" }) });
        promoMenuRef.current = await res.json();
      } catch {
        /* ignore */
      }
      setPromoBusy(false);
    }
    if (!promoMenuRef.current?.items?.length) {
      replyA("تعذّر تحميل المنيو لإنشاء العرض. تأكد من إضافة أصناف أولاً.");
      return;
    }
    setPromoImg(null);
    const d: PromoDraft = {};
    setDraft(d);
    replyA("تمام، خلّنا نجهّز العرض مع بعض 🎯", { promoChips: [] });
    askStep(d);
  }

  function scopeChips(): PromoChip[] {
    const cats = (promoMenuRef.current?.categories ?? []).slice(0, 6).map((c) => ({ label: c, patch: { scopeType: "category" as const, scopeRef: c, scopeLabel: c } }));
    return [{ label: "كل المنيو", patch: { scopeType: "all" as const, scopeLabel: "كل المنيو" } }, ...cats];
  }

  function askStep(d: PromoDraft) {
    const step = nextStep(d);
    if (step === "scope") return void replyA("على إيش يكون العرض؟", { promoChips: scopeChips() });
    if (step === "offer") return void replyA("نوع العرض؟", { promoChips: OFFER_CHIPS });
    if (step === "amount") {
      if (d.offerType === "percent_off") return void replyA("نسبة الخصم؟ (اختر أو اكتب رقم)", { promoChips: PCT_CHIPS });
      const cur = promoMenuRef.current?.currency ?? currency;
      return void replyA(d.offerType === "fixed_price" ? `السعر الثابت بالـ${cur}؟ اكتب الرقم.` : `قيمة الخصم بالـ${cur}؟ اكتب الرقم.`);
    }
    if (step === "duration") return void replyA("مدة العرض؟", { promoChips: DUR_CHIPS });
    if (step === "caption") return void draftCaption(d);
    void showReview(d);
  }

  function applyChip(chip: PromoChip) {
    const cur = promoDraftRef.current;
    if (!cur) return;
    push({ role: "user", text: chip.label });
    const d = { ...cur, ...chip.patch };
    setDraft(d);
    askStep(d);
  }

  async function draftCaption(d: PromoDraft) {
    setPromoBusy(true);
    let caption = offerSummary(d, promoMenuRef.current?.currency ?? currency);
    try {
      const res = await fetch("/api/agent/promo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "caption", draft: d }) });
      const j = await res.json();
      if (j.caption) caption = j.caption;
    } catch {
      /* fallback to summary */
    }
    setPromoBusy(false);
    const d2 = { ...d, caption };
    setDraft(d2);
    replyA(`اقترحت كابشن: «${caption}» — تقدر تكتب وحدة بديلة، أو نكمل للمعاينة.`);
    void showReview(d2);
  }

  async function showReview(d: PromoDraft) {
    // Render the branded template image from the computed draft.
    setPromoImg(null);
    setPromoBusy(true);
    try {
      const res = await fetch("/api/agent/promo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "image", draft: d }) });
      if (res.ok) setPromoImg(URL.createObjectURL(await res.blob()));
    } catch {
      /* image optional */
    }
    setPromoBusy(false);
    replyA("جاهز للمراجعة — راجع التفاصيل وانشر العرض:", { promoReview: true });
  }

  // Free text routed into an active promo. Operator-appropriate (Layer A) — it
  // NEVER dead-ends to a canned line; a request for a suggestion gets a grounded
  // one, anything else a varied re-ask, and «إلغاء» exits the flow.
  function handlePromoText(text: string): boolean {
    const d = promoDraftRef.current;
    if (!d) return false;
    push({ role: "user", text });
    if (/إلغاء|الغاء|خروج|بطّل|بطل|كنسل/.test(text)) {
      cancelPromo();
      return true;
    }
    const items = promoMenuRef.current?.items ?? [];
    const cats = promoMenuRef.current?.categories ?? [];
    const wantsSuggestion = /رأي|راي|اقترح|اقتراح|نصيح|توصي|الأفضل|الافضل|إيش الأنسب|ايش الانسب|أنت|انت|إنت/.test(text);
    const step = nextStep(d);

    if (step === "amount") {
      const n = parseFloat(text.replace(/[^\d.]/g, ""));
      if (!isNaN(n)) {
        const nd = { ...d, amount: n };
        setDraft(nd);
        askStep(nd);
      } else {
        replyA("اكتب نسبة أو مبلغاً رقمياً، أو اختر قيمة من الأزرار 👆 (أو «إلغاء» للخروج).");
      }
      return true;
    }

    if (step === "scope") {
      const item = items.find((i) => text.includes(i.name) || i.name.includes(text.trim()));
      if (item) {
        const nd = { ...d, scopeType: "item" as const, scopeRef: item.id, scopeLabel: item.name };
        setDraft(nd);
        askStep(nd);
        return true;
      }
      const cat = cats.find((c) => text.includes(c) || c.includes(text.trim()));
      if (cat) {
        const nd = { ...d, scopeType: "category" as const, scopeRef: cat, scopeLabel: cat };
        setDraft(nd);
        askStep(nd);
        return true;
      }
      if (wantsSuggestion) {
        const counts = new Map<string, number>();
        for (const i of items) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        replyA(
          top
            ? `أقترح نبدأ العرض على «${top}» — من أكثر تصنيفاتك تنوّعاً. تحب؟ أو اختر تصنيفاً، أو «كل المنيو».`
            : "تحب العرض على تصنيف معيّن، ولا على كل المنيو؟",
          { promoChips: scopeChips() }
        );
        return true;
      }
      replyA("حدّد نطاق العرض: اختر تصنيفاً من الأزرار، أو «كل المنيو»، أو اكتب «إلغاء» للخروج.", { promoChips: scopeChips() });
      return true;
    }

    // caption / review step → treat the text as the caption.
    const nd = { ...d, caption: text };
    setDraft(nd);
    void showReview(nd);
    return true;
  }

  async function publishPromo() {
    const d = promoDraftRef.current;
    if (!d) return;
    setPromoBusy(true);
    try {
      const res = await fetch("/api/agent/promo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", draft: d }) });
      const j = await res.json();
      if (!res.ok) {
        replyA(j.message || (j.error === "forbidden" ? "نشر العروض متاح للمدير فقط." : "تعذّر نشر العرض."));
      } else {
        push({ role: "assistant", text: "تم نشر العرض ✅", promoSuccess: j.promo?.name ?? d.name });
        setDraft(null);
        setPromoImg(null);
      }
    } catch {
      replyA("تعذّر الاتصال لنشر العرض.");
    }
    setPromoBusy(false);
  }

  function cancelPromo() {
    setDraft(null);
    setPromoImg(null);
    replyA("تم إلغاء العرض، لم يُنشر شيء.");
  }

  // ---- ops chips ------------------------------------------------------------
  function handleChip(label: string) {
    push({ role: "user", text: label });
    const has = (...w: string[]) => w.some((x) => label.includes(x));
    setTimeout(() => {
      if (has("تصعيد")) {
        replyA(escalations > 0 ? `عندك ${escalations} محادثة محوّلة إليك.` : "ما في تصعيدات تحتاج تدخّلك الآن 👌", escalations > 0 ? { card: "escalations" } : undefined);
      } else if (has("أرقام", "طلب")) {
        replyA(`اليوم: ${ordersToday} طلب · ${openConvs} محادثة مفتوحة · ${escalations} تصعيد.`);
      } else if (has("عرض", "خصم")) {
        void startPromo();
      } else if (has("سكّر", "اقفل")) {
        isOpen ? replyA("تبي تسكّر المطعم؟ أكّد التغيير:", { confirm: { action: "close" } }) : replyA("المطعم مغلق بالفعل.");
      } else if (has("افتح")) {
        !isOpen ? replyA("تبي تفتح المطعم؟ أكّد التغيير:", { confirm: { action: "open" } }) : replyA("المطعم مفتوح بالفعل.");
      }
    }, 100);
  }

  function resolveOpsConfirm(id: string, go: boolean) {
    const msg = messages.find((x) => x.id === id);
    update(id, { confirm: { ...(msg?.confirm as Msg["confirm"]), resolved: true } as Msg["confirm"] });
    if (!go) return replyA("تم الإلغاء، لم يتغيّر شيء.");
    const action = msg?.confirm?.action;
    if (action === "close") {
      setOpen(false);
      replyA("تم إغلاق المطعم 🌙 لن تُستقبل طلبات حتى تعيد فتحه.");
    } else if (action === "open") {
      setOpen(true);
      replyA("تم فتح المطعم ✅");
    }
  }

  async function handleFreeText(raw: string) {
    const text = raw.trim();
    if (!text) return;
    setInput("");
    // Active promo builder consumes free text (amount/caption/scope).
    if (promoDraftRef.current) {
      handlePromoText(text);
      return;
    }
    // Promo intent in free text → start the in-chat builder (no navigation).
    if (/عرض|خصم|تخفيض|بروموشن/.test(text)) {
      push({ role: "user", text });
      void startPromo();
      return;
    }
    push({ role: "user", text });
    const loadingId = push({ role: "assistant", text: "…", loading: true });
    try {
      const res = await fetch("/api/agent/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await res.json();
      if (!res.ok) {
        update(loadingId, { loading: false, text: j.error === "unauthorized" ? "مساعد اللوحة متاح في الوضع المباشر فقط." : "تعذّر تنفيذ الطلب." });
        return;
      }
      if (j.card) update(loadingId, { loading: false, text: j.sentence, adminCard: j.card });
      else if (j.preview) update(loadingId, { loading: false, text: j.sentence, adminPreview: j.preview });
      else update(loadingId, { loading: false, text: j.sentence });
    } catch {
      update(loadingId, { loading: false, text: "تعذّر الاتصال بالمساعد." });
    }
  }

  async function resolveAdminPreview(id: string, prev: AdminPreview, go: boolean) {
    update(id, { adminPreview: { ...prev, resolved: true } });
    if (!go) return replyA("تم الإلغاء، لم يتغيّر شيء.");
    try {
      const res = await fetch("/api/agent/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: { intent: prev.intent, params: prev.params } }) });
      const j = await res.json();
      if (!res.ok) return replyA(j.message || "تعذّر تنفيذ التغيير.");
      if (prev.intent === "set_open") setOpen(!!prev.params.open);
      replyA(j.result || "تم.");
    } catch {
      replyA("تعذّر تنفيذ التغيير.");
    }
  }

  function adminCardBody(c: { type: string; data: Record<string, number> }) {
    const d = c.data;
    if (c.type === "daily_ops") return `طلبات اليوم: ${d.ordersToday} · الإيرادات: ${d.revenue} ${currency}`;
    if (c.type === "payments") return `إيرادات اليوم: ${d.revenue} ${currency} · طلبات: ${d.ordersToday}`;
    if (c.type === "escalations") return `تصعيدات مفتوحة: ${d.count}`;
    if (c.type === "agent_health") return `تشغيلات المساعد اليوم: ${d.turns} · التكلفة: $${(d.cost ?? 0).toFixed(4)} · متوسط الزمن: ${d.avgLatency}ms`;
    return "";
  }

  const chips = ["التصعيدات", "أرقام اليوم", "اعمل عرض", isOpen ? "سكّر المطعم" : "افتح المطعم"];

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <div className="mb-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.svg" alt="المساعد" width={40} height={40} className="h-10 w-10" />
        <div>
          <h1 className="font-bold leading-tight text-[#2a211b]">المساعد</h1>
          <p className="text-xs text-[#9b8b7c]">{hydrated ? restaurantName : ""}</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.map((m) =>
          m.role === "assistant" ? (
            <div key={m.id} className="flex items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.svg" alt="" width={28} height={28} className="mt-0.5 h-7 w-7 shrink-0" />
              <div className="max-w-[88%] space-y-2">
                <div className="rounded-2xl rounded-tr-sm bg-white px-3.5 py-2.5 text-sm text-[#2a211b] shadow-sm">
                  {m.loading ? <Loader2 className="h-4 w-4 animate-spin text-[#b5502e]" /> : m.text}
                </div>

                {m.adminCard && (
                  <div className="flex items-center gap-2 rounded-xl border border-[#e4d8c8] bg-white px-3 py-2 text-sm text-[#2a211b]">
                    <BarChart3 className="h-4 w-4 text-[#b5502e]" />
                    {adminCardBody(m.adminCard)}
                  </div>
                )}

                {/* Promo step chips (deterministic, $0) */}
                {m.promoChips && m.promoChips.length > 0 && promoDraft && (
                  <div className="flex flex-wrap gap-2">
                    {m.promoChips.map((c) => (
                      <button key={c.label} onClick={() => applyChip(c)} className="rounded-full border border-[#e0c3b3] bg-[#fbf1ea] px-3 py-1.5 text-xs font-semibold text-[#b5502e] hover:bg-[#f7e3d7]">
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Live promo preview card (the in-chat design) */}
                {m.promoReview && promoDraft && <PromoPreviewCard draft={promoDraft} menu={promoMenuRef.current} img={promoImg} busy={promoBusy} onPublish={publishPromo} onCancel={cancelPromo} />}

                {m.promoSuccess && (
                  <div className="flex items-center gap-2 rounded-xl border border-[#cde3d4] bg-[#f0f7f2] px-3 py-2.5 text-sm">
                    <Tag className="h-4 w-4 text-[#3c7a52]" />
                    <span className="flex-1 font-semibold text-[#2a211b]">{m.promoSuccess} — فعّال الآن</span>
                  </div>
                )}

                {((m.confirm && !m.confirm.resolved) || (m.adminPreview && !m.adminPreview.resolved)) && (
                  <div className="rounded-xl border border-[#e4d8c8] bg-white p-3">
                    <p className="text-[11px] font-semibold text-[#b5502e]">معاينة التغيير</p>
                    {m.adminPreview ? (
                      <p className="mt-1 text-sm text-[#2a211b]">
                        {m.adminPreview.label}: <b>{m.adminPreview.before}</b> <ArrowLeft className="inline h-3.5 w-3.5 text-[#9b8b7c]" /> <b>{m.adminPreview.after}</b>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-[#2a211b]">
                        حالة المطعم: <b>{m.confirm!.action === "close" ? "مفتوح" : "مغلق"}</b> <ArrowLeft className="inline h-3.5 w-3.5 text-[#9b8b7c]" /> <b>{m.confirm!.action === "close" ? "مغلق" : "مفتوح"}</b>
                      </p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => (m.adminPreview ? resolveAdminPreview(m.id, m.adminPreview, true) : resolveOpsConfirm(m.id, true))}
                        className="flex items-center gap-1 rounded-lg bg-[#b5502e] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                      >
                        <Check className="h-3.5 w-3.5" /> تأكيد
                      </button>
                      <button
                        onClick={() => (m.adminPreview ? resolveAdminPreview(m.id, m.adminPreview, false) : resolveOpsConfirm(m.id, false))}
                        className="flex items-center gap-1 rounded-lg border border-[#e4d8c8] px-3 py-1.5 text-xs font-semibold text-[#6a5c4e] hover:bg-[#faf6ef]"
                      >
                        <X className="h-3.5 w-3.5" /> إلغاء
                      </button>
                    </div>
                  </div>
                )}

                {m.card === "escalations" && (
                  <button onClick={() => router.push("/conversations")} className="flex w-full items-center gap-2 rounded-xl border border-[#e7c9bf] bg-[#fbeee9] px-3 py-2 text-right text-sm">
                    <AlertTriangle className="h-4 w-4 text-[#cc3a33]" />
                    <span className="flex-1 font-semibold text-[#2a211b]">{escalations} محادثة تحتاج تدخّلك</span>
                    <span className="flex items-center gap-1 text-xs text-[#a8432a]">افتح المحادثات <ArrowLeft className="h-3.5 w-3.5" /></span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#f0e7da] px-3.5 py-2.5 text-sm text-[#2a211b]">{m.text}</div>
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 pt-2">
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c} onClick={() => handleChip(c)} className="rounded-full border border-[#e4d8c8] bg-white px-3 py-1.5 text-xs font-medium text-[#6a5c4e] hover:bg-[#faf6ef]">
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#e4d8c8] bg-white px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFreeText(input)}
            placeholder={promoDraft ? "اكتب ردّك للعرض…" : "اكتب أمرك للمساعد…"}
            className="w-full bg-transparent text-sm text-[#2a211b] outline-none placeholder:text-[#9b8b7c]"
          />
          <button onClick={() => handleFreeText(input)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#b5502e] text-white hover:opacity-95" aria-label="إرسال">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- in-chat promo preview card (the live design) ---------------------------
function PromoPreviewCard({
  draft,
  menu,
  img,
  busy,
  onPublish,
  onCancel,
}: {
  draft: PromoDraft;
  menu: PromoMenu | null;
  img: string | null;
  busy: boolean;
  onPublish: () => void;
  onCancel: () => void;
}) {
  const cur = menu?.currency ?? "ج.م";
  const affected = menu ? computeAffected(menu.items as unknown as MenuItem[], draft) : [];
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e4d8c8] bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-[#f0e7da] bg-[#fbf1ea] px-3 py-2 text-[11px] font-semibold text-[#b5502e]">
        <Megaphone className="h-3.5 w-3.5" /> معاينة العرض
      </div>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="معاينة العرض" className="w-full" />
      ) : (
        <div className="flex h-28 items-center justify-center text-[#b9a892]">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        </div>
      )}
      <div className="space-y-2 p-3">
        <p className="text-sm font-bold text-[#2a211b]">{offerSummary(draft, cur)}</p>
        {affected.length > 0 && (
          <div className="space-y-1">
            {affected.slice(0, 4).map((a) => (
              <div key={a.name} className="flex items-center justify-between text-xs text-[#6a5c4e]">
                <span>{a.name}</span>
                <span>
                  <span className="text-[#b9a892] line-through">{a.before}</span> ← <b className="text-[#3c7a52]">{a.after} {cur}</b>
                </span>
              </div>
            ))}
          </div>
        )}
        {draft.caption && <p className="text-xs text-[#9b8b7c]">«{draft.caption}»</p>}
        <p className="text-[11px] text-[#b9a892]">المدة: {draft.durationDays} يوم · الأسعار محسوبة من المنيو</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onPublish} disabled={busy} className="flex items-center gap-1 rounded-lg bg-[#b5502e] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60">
            <Check className="h-3.5 w-3.5" /> انشر العرض
          </button>
          <button onClick={onCancel} className="flex items-center gap-1 rounded-lg border border-[#e4d8c8] px-3 py-1.5 text-xs font-semibold text-[#6a5c4e] hover:bg-[#faf6ef]">
            <X className="h-3.5 w-3.5" /> إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
