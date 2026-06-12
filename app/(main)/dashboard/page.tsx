"use client";

// ============================================================================
// MaitreAI — الرئيسية / the Maître console (Amendment 04 §M3 + Amendment 05 §P2)
// The home IS a conversation with «المساعد». Fixed chips/intents are
// deterministic ($0, no LLM). Write intents (open/close, …) NEVER execute
// instantly — they render a PreviewDiff/confirm card and run only on explicit
// confirm (§P2). The assistant never claims success before the change applies.
// Card bodies are computed from real state (F3); full NL admin path is §P6 next.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConversationStore } from "@/lib/conversation-store";
import { useOrderStore } from "@/lib/order-store";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useOpsStore } from "@/lib/ops-store";
import { AlertTriangle, ArrowLeft, Send, Megaphone, Check, X } from "lucide-react";

type Card = "escalations" | "promo";
interface Confirm {
  action: "open" | "close";
  resolved?: boolean;
}
interface Msg {
  id: string;
  role: "assistant" | "user";
  text: string;
  card?: Card;
  confirm?: Confirm;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
const uid = () => Math.random().toString(36).slice(2);

export default function MaitreConsole() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const restaurantName = useRestaurantStore((s) => s.profile.name);
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
    setMessages([
      { id: uid(), role: "assistant", text: `${greet} 👋 ${proactive}`, card: escalations > 0 ? "escalations" : undefined },
    ]);
  }, [hydrated, escalations, isOpen, agentEnabled]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const reply = (text: string, extra?: Partial<Msg>) =>
    setMessages((m) => [...m, { id: uid(), role: "assistant", text, ...extra }]);

  function send(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setMessages((m) => [...m, { id: uid(), role: "user", text: t }]);
    setInput("");
    const has = (...w: string[]) => w.some((x) => t.includes(x));
    setTimeout(() => {
      if (has("تصعيد")) {
        reply(
          escalations > 0 ? `عندك ${escalations} محادثة محوّلة إليك من المساعد.` : "ما في تصعيدات تحتاج تدخّلك الآن 👌",
          escalations > 0 ? { card: "escalations" } : undefined
        );
      } else if (has("أرقام", "ارقام", "طلب", "اليوم", "مبيعات", "إيراد")) {
        reply(`اليوم: ${ordersToday} طلب · ${openConvs} محادثة مفتوحة · ${escalations} تصعيد.`);
      } else if (has("عرض", "خصم", "حملة")) {
        reply("إنشاء العروض عبر المساعد قريبًا. تقدر تجهّز عرضاً الآن من قسم العروض.", { card: "promo" });
      } else if (has("سكّر", "سكر", "اقفل", "اغلق", "أغلق")) {
        // §P2: write intent → confirm card, never instant execution.
        if (!isOpen) reply("المطعم مغلق بالفعل.");
        else reply("تبي تسكّر المطعم؟ راجع التغيير وأكّده:", { confirm: { action: "close" } });
      } else if (has("افتح")) {
        if (isOpen) reply("المطعم مفتوح بالفعل.");
        else reply("تبي تفتح المطعم؟ راجع التغيير وأكّده:", { confirm: { action: "open" } });
      } else {
        reply("أوامر المساعد الكاملة قريبًا. جرّب: «التصعيدات» · «أرقام اليوم» · «اعمل عرض» · «سكّر المطعم».");
      }
    }, 120);
  }

  function resolveConfirm(id: string, go: boolean) {
    setMessages((m) => m.map((x) => (x.id === id && x.confirm ? { ...x, confirm: { ...x.confirm, resolved: true } } : x)));
    const msg = messages.find((x) => x.id === id);
    const action = msg?.confirm?.action;
    if (!go) return reply("تم الإلغاء، لم يتغيّر شيء.");
    if (action === "close") {
      setOpen(false);
      reply("تم إغلاق المطعم 🌙 لن تُستقبل طلبات حتى تعيد فتحه.");
    } else if (action === "open") {
      setOpen(true);
      reply("تم فتح المطعم ✅");
    }
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

      {/* Thread */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.map((m) =>
          m.role === "assistant" ? (
            <div key={m.id} className="flex items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.svg" alt="" width={28} height={28} className="mt-0.5 h-7 w-7 shrink-0" />
              <div className="max-w-[85%] space-y-2">
                <div className="rounded-2xl rounded-tr-sm bg-white px-3.5 py-2.5 text-sm text-[#2a211b] shadow-sm">{m.text}</div>

                {m.confirm && !m.confirm.resolved && (
                  <div className="rounded-xl border border-[#e4d8c8] bg-white p-3">
                    <p className="text-[11px] font-semibold text-[#b5502e]">معاينة التغيير</p>
                    <p className="mt-1 text-sm text-[#2a211b]">
                      حالة المطعم: <b>{m.confirm.action === "close" ? "مفتوح" : "مغلق"}</b>{" "}
                      <ArrowLeft className="inline h-3.5 w-3.5 text-[#9b8b7c]" />{" "}
                      <b>{m.confirm.action === "close" ? "مغلق" : "مفتوح"}</b>
                    </p>
                    <p className="text-xs text-[#9b8b7c]">
                      {m.confirm.action === "close" ? "لن تُستقبل طلبات جديدة بعد الإغلاق." : "سيبدأ استقبال الطلبات."}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => resolveConfirm(m.id, true)} className="flex items-center gap-1 rounded-lg bg-[#b5502e] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95">
                        <Check className="h-3.5 w-3.5" /> تأكيد
                      </button>
                      <button onClick={() => resolveConfirm(m.id, false)} className="flex items-center gap-1 rounded-lg border border-[#e4d8c8] px-3 py-1.5 text-xs font-semibold text-[#6a5c4e] hover:bg-[#faf6ef]">
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

      {/* Chips + composer */}
      <div className="space-y-2 pt-2">
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c} onClick={() => send(c)} className="rounded-full border border-[#e4d8c8] bg-white px-3 py-1.5 text-xs font-medium text-[#6a5c4e] hover:bg-[#faf6ef]">
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#e4d8c8] bg-white px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="اكتب أمرك للمساعد…"
            className="w-full bg-transparent text-sm text-[#2a211b] outline-none placeholder:text-[#9b8b7c]"
          />
          <button onClick={() => send(input)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#b5502e] text-white hover:opacity-95" aria-label="إرسال">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
