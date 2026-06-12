"use client";

// ============================================================================
// MaitreAI — الرئيسية / the Maître console (Amendment 04 §M3)
// The home IS a short conversation with «المساعد»: a warm greeting, a proactive
// line derived from REAL state (no fabricated numbers — F3), suggestion chips,
// a composer wired to navigation/command intents (full admin-agent write-tools
// arrive in Sprint 11), and summoned cards that appear only when there's
// something to act on.
// ============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConversationStore } from "@/lib/conversation-store";
import { useOrderStore } from "@/lib/order-store";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useOpsStore } from "@/lib/ops-store";
import { seedProfile } from "@/lib/seed-data";
import { AlertTriangle, ArrowLeft, Send, ShoppingBag, MessageCircle } from "lucide-react";

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const CHIPS: { label: string; route: string }[] = [
  { label: "التصعيدات", route: "/conversations" },
  { label: "طلبات اليوم", route: "/orders" },
  { label: "المنيو والذاكرة", route: "/restaurant-brain" },
  { label: "اعمل عرض", route: "/promotions" },
];

export default function HomeConsole() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const name = useRestaurantStore((s) => s.profile.name);
  const restaurantName = hydrated ? name : seedProfile.name;
  const conversations = useConversationStore((s) => s.conversations);
  const orders = useOrderStore((s) => s.orders);
  const { isOpen, agentEnabled, setOpen } = useOpsStore();

  const [input, setInput] = useState("");
  const [reply, setReply] = useState<string | null>(null);

  const escalations = conversations.filter(
    (c) => c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف" || c.owner === "human"
  ).length;
  const openConvs = conversations.filter((c) => c.status !== "طلب مكتمل").length;
  const since = startOfToday();
  const ordersToday = orders.filter((o) => o.createdAt >= since).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صباح الخير" : "مساء الخير";

  const proactive = !hydrated
    ? ""
    : escalations > 0
    ? `عندك ${escalations} محادثة تحتاج تدخّلك الآن.`
    : !isOpen
    ? "المطعم مغلق حالياً — افتحه من الشريط العلوي عندما تكون جاهزاً."
    : !agentEnabled
    ? "المساعد متوقف حالياً ولا يرد على العملاء."
    : "كل شيء يسير بسلاسة — لا توجد تصعيدات تحتاج تدخّلك.";

  // Command/navigation intents (Sprint 8.5). Full NL command set is Sprint 11.
  function runCommand() {
    const t = input.trim();
    if (!t) return;
    setReply(null);
    const has = (...w: string[]) => w.some((x) => t.includes(x));
    if (has("تصعيد")) return router.push("/conversations");
    if (has("طلب", "الطلبات")) return router.push("/orders");
    if (has("منيو", "قائمة", "ذاكرة")) return router.push("/restaurant-brain");
    if (has("عرض", "خصم", "حملة")) return router.push("/promotions");
    if (has("عميل", "العملاء")) return router.push("/customers");
    if (has("محادث")) return router.push("/conversations");
    if (has("إعداد", "الإعدادات")) return router.push("/settings");
    if (has("سكّر", "اقفل", "اغلق", "أغلق")) {
      setOpen(false);
      return setReply("تم إغلاق المطعم. لن تُستقبل طلبات حتى تعيد فتحه.");
    }
    if (has("افتح")) {
      setOpen(true);
      return setReply("تم فتح المطعم.");
    }
    setReply("أوامر المساعد الكاملة قريبًا. جرّب: «التصعيدات»، «الطلبات»، «اعمل عرض»، «سكّر المطعم».");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Maître greeting */}
      <div className="rounded-2xl border border-[#ece0d2] bg-white p-5">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="المساعد" width={44} height={44} className="h-11 w-11 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-[#9b8b7c]">{restaurantName}</p>
            <h1 className="text-xl font-bold text-[#2a211b]">{greeting} 👋</h1>
            <p className="mt-1 text-[#4a3f36]">{proactive}</p>
            {hydrated && (
              <p className="mt-1 text-sm text-[#9b8b7c]">
                اليوم: {ordersToday} طلب · {openConvs} محادثة مفتوحة.
              </p>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#e4d8c8] bg-[#faf6ef] px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runCommand()}
            placeholder="اكتب أمرك للمساعد…"
            className="w-full bg-transparent text-sm text-[#2a211b] outline-none placeholder:text-[#9b8b7c]"
          />
          <button
            onClick={runCommand}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#b5502e] text-white hover:opacity-95"
            aria-label="إرسال"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* Suggestion chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              onClick={() => router.push(c.route)}
              className="rounded-full border border-[#e4d8c8] bg-white px-3 py-1.5 text-xs font-medium text-[#6a5c4e] hover:bg-[#faf6ef]"
            >
              {c.label}
            </button>
          ))}
        </div>

        {reply && (
          <div className="mt-3 rounded-xl bg-[#faf6ef] px-3 py-2 text-sm text-[#4a3f36]">{reply}</div>
        )}
      </div>

      {/* Summoned cards — appear only when there's something to act on */}
      {hydrated && escalations > 0 && (
        <button
          onClick={() => router.push("/conversations")}
          className="flex w-full items-center gap-3 rounded-2xl border border-[#e7c9bf] bg-[#fbeee9] p-4 text-right"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#cc3a33] text-white">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-[#2a211b]">{escalations} محادثة تحتاج تدخّلك</span>
            <span className="block text-sm text-[#6a5c4e]">حوّلها المساعد إليك — تولَّ الرد من «المحادثات».</span>
          </span>
          <ArrowLeft className="h-4 w-4 text-[#a8432a]" />
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => router.push("/orders")}
          className="flex items-center gap-3 rounded-2xl border border-[#ece0d2] bg-white p-4 text-right"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0e7da] text-[#b5502e]">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-lg font-bold text-[#2a211b]">{hydrated ? ordersToday : "—"}</span>
            <span className="block text-xs text-[#9b8b7c]">طلبات اليوم</span>
          </span>
        </button>
        <button
          onClick={() => router.push("/conversations")}
          className="flex items-center gap-3 rounded-2xl border border-[#ece0d2] bg-white p-4 text-right"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f1ea] text-[#3c7a52]">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-lg font-bold text-[#2a211b]">{hydrated ? openConvs : "—"}</span>
            <span className="block text-xs text-[#9b8b7c]">محادثات مفتوحة</span>
          </span>
        </button>
      </div>
    </div>
  );
}
