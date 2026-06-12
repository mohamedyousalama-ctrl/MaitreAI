"use client";

// ============================================================================
// MaitreAI — الرئيسية / Maître console (Amendment 04 §M3 + Amendment 05 §P)
// Fixed chips = deterministic intents ($0, no LLM). Free text → the Admin Agent
// (/api/agent/admin): a small classifier routes to a COMPUTED read card or a
// write PREVIEW; writes execute only on explicit confirm (§P2) and are DB-backed
// + role-enforced server-side. Card bodies are computed, never LLM-written (§P5).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConversationStore } from "@/lib/conversation-store";
import { useOrderStore } from "@/lib/order-store";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useOpsStore } from "@/lib/ops-store";
import { AlertTriangle, ArrowLeft, Send, Megaphone, Check, X, Loader2, BarChart3 } from "lucide-react";

interface AdminPreview {
  intent: string;
  params: Record<string, unknown>;
  label: string;
  before: string;
  after: string;
  resolved?: boolean;
}
interface Msg {
  id: string;
  role: "assistant" | "user";
  text: string;
  card?: "escalations" | "promo";
  confirm?: { action: "open" | "close"; resolved?: boolean };
  adminCard?: { type: string; data: Record<string, number> };
  adminPreview?: AdminPreview;
  loading?: boolean;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const uid = () => Math.random().toString(36).slice(2);

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

  // Fixed chips — deterministic, no LLM ($0).
  function handleChip(label: string) {
    push({ role: "user", text: label });
    const has = (...w: string[]) => w.some((x) => label.includes(x));
    setTimeout(() => {
      if (has("تصعيد")) {
        replyA(escalations > 0 ? `عندك ${escalations} محادثة محوّلة إليك.` : "ما في تصعيدات تحتاج تدخّلك الآن 👌", escalations > 0 ? { card: "escalations" } : undefined);
      } else if (has("أرقام", "طلب")) {
        replyA(`اليوم: ${ordersToday} طلب · ${openConvs} محادثة مفتوحة · ${escalations} تصعيد.`);
      } else if (has("عرض")) {
        replyA("إنشاء العروض عبر المساعد قريبًا. تقدر تجهّزه من قسم العروض.", { card: "promo" });
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

  // Free text → Admin Agent (LLM router + computed cards / write previews).
  async function handleFreeText(raw: string) {
    const text = raw.trim();
    if (!text) return;
    push({ role: "user", text });
    setInput("");
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
      if (prev.intent === "set_open") setOpen(!!prev.params.open); // keep the strip in sync
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
              <div className="max-w-[85%] space-y-2">
                <div className="rounded-2xl rounded-tr-sm bg-white px-3.5 py-2.5 text-sm text-[#2a211b] shadow-sm">
                  {m.loading ? <Loader2 className="h-4 w-4 animate-spin text-[#b5502e]" /> : m.text}
                </div>

                {m.adminCard && (
                  <div className="flex items-center gap-2 rounded-xl border border-[#e4d8c8] bg-white px-3 py-2 text-sm text-[#2a211b]">
                    <BarChart3 className="h-4 w-4 text-[#b5502e]" />
                    {adminCardBody(m.adminCard)}
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
                {m.card === "promo" && (
                  <button onClick={() => router.push("/promotions")} className="flex w-full items-center gap-2 rounded-xl border border-[#e4d8c8] bg-white px-3 py-2 text-right text-sm">
                    <Megaphone className="h-4 w-4 text-[#b5502e]" />
                    <span className="flex-1 font-semibold text-[#2a211b]">قسم العروض</span>
                    <ArrowLeft className="h-3.5 w-3.5 text-[#6a5c4e]" />
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
            placeholder="اكتب أمرك للمساعد…"
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
