"use client";

// ============================================================================
// MaitreAI — المحادثات (Conversations) — Terracotta workspace.
// Rebuilds the page to the Terracotta mockup REUSING the real engine/store:
//   useConversationEngine → useConversationStore (DB-backed, realtime). Real
//   handlers reused as-is: selectConversation, sendHuman (operator reply, E3
//   takeover-on-send preserved), takeover (owner→human, AI stops), returnToAi,
//   and createdOrder (the conversation's linked order, money from the row).
// Truth rule: النية/الثقة are NOT populated for real conversations → «—»/«قريبًا»,
// never fabricated. Customer loyalty stats have no real backend → «قريبًا».
// ============================================================================

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConversationEngine } from "@/lib/ai/useConversationEngine";
import { useHasHydrated } from "@/lib/store";
import type { ChatMessage, Conversation } from "@/lib/types";
import { Search, Send, User, AlertTriangle, Sparkles, ArrowRight, X, MessageSquare, Bot } from "lucide-react";

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const money = (n: number) => toAr(String(Math.round(Number(n || 0))));

function isEscalated(c: Conversation) { return c.status === "يحتاج تدخل موظف"; }
function isWithHuman(c: Conversation) { return c.owner === "human"; }

// status tag per conversation (matches the mockup pills)
function tagFor(c: Conversation): { label: string; bg: string; border: string; fg: string; icon?: "alert" | "human" | "ai" } {
  if (isEscalated(c)) return { label: "يحتاج تدخل", bg: "#FBEAE5", border: "#F1D2C8", fg: "#BE5238", icon: "alert" };
  if (isWithHuman(c)) return { label: "مع موظف", bg: "#EFEAF7", border: "#DAD0EC", fg: "#6B4F91", icon: "human" };
  return { label: "المساعد نشط", bg: "#EAF1E9", border: "#CFE2D3", fg: "#436B50", icon: "ai" };
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={null}>
      <ConversationsInner />
    </Suspense>
  );
}

function ConversationsInner() {
  const hydrated = useHasHydrated();
  const params = useSearchParams();
  const { conversations, selectedId, selected, selectConversation, sendHuman, takeover, returnToAi, createdOrder } = useConversationEngine();

  const [filter, setFilter] = useState<"all" | "needs" | "unread">("all");
  const [search, setSearch] = useState("");
  const [mobileChat, setMobileChat] = useState(false);
  const [draftMsg, setDraftMsg] = useState("");
  const linkedRef = useRef(false);

  // Cross-link from Orders: /conversations?c=<conversationId> → open it once.
  useEffect(() => {
    if (linkedRef.current || !hydrated) return;
    const c = params.get("c");
    if (c && conversations.some((x) => x.id === c)) { selectConversation(c); setMobileChat(true); linkedRef.current = true; }
  }, [params, hydrated, conversations, selectConversation]);

  if (!hydrated) return <div className="h-[calc(100vh-8rem)] animate-pulse rounded-2xl border border-[#ECE3D5] bg-white/60" />;

  // «مفتوحة» = genuinely OPEN conversations: everything except a completed order
  // («طلب مكتمل», the only terminal status). S3: was counting ALL conversations.
  const openCount = conversations.filter((c) => c.status !== "طلب مكتمل").length;
  const list = conversations.filter((c) => {
    if (filter === "needs" && !isEscalated(c)) return false;
    if (filter === "unread" && !(c.unread > 0)) return false;
    if (search.trim() && !c.customer.includes(search.trim())) return false;
    return true;
  });

  const sendReply = () => {
    const t = draftMsg.trim();
    if (!t || !selected) return;
    if (selected.owner !== "human") takeover(); // E3: replying takes over
    sendHuman(t);
    setDraftMsg("");
  };

  return (
    <div dir="rtl" className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-[#ECE3D5] bg-white" style={{ boxShadow: "0 14px 30px -22px rgba(50,32,20,.25)" }}>
      {/* ===== conversation list ===== */}
      <aside className={`${mobileChat ? "hidden" : "flex"} w-full flex-col border-l border-[#ECE3D5] bg-white lg:flex lg:w-[300px] lg:flex-none`}>
        <div className="border-b border-[#F0E9DD] p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[17px] font-bold text-[#2A2019]">المحادثات</span>
            <span className="rounded-full bg-[#BE5238] px-2.5 py-0.5 text-[11px] font-bold text-white">{toAr(openCount)} مفتوحة</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-[11px] border border-[#F0E9DD] bg-[#F7F2EA] px-3 py-2">
            <Search className="h-4 w-4 text-[#AEA391]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن عميل…" className="w-full bg-transparent text-[12.5px] text-[#2A2019] outline-none placeholder:text-[#AEA391]" />
          </div>
          <div className="mt-2.5 flex gap-1.5">
            {([["all", "الكل"], ["needs", "يحتاج تدخل"], ["unread", "غير مقروء"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition"
                style={filter === k ? { background: "#BE5238", color: "#fff" } : { background: "#F6F0E7", color: "#7C7163" }}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 && <div className="px-4 py-12 text-center text-[12.5px] text-[#A99D8D]">لا محادثات في هذا الفلتر.</div>}
          {list.map((c) => {
            const tag = tagFor(c);
            const active = c.id === selectedId;
            return (
              <button key={c.id} onClick={() => { selectConversation(c.id); setMobileChat(true); }}
                className="flex w-full gap-2.5 px-3.5 py-3 text-right transition hover:bg-[#FBF8F3]"
                style={active ? { background: "#FBF1ED", borderRight: "3px solid #BE5238" } : {}}>
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] text-[17px] font-bold text-white" style={{ background: c.avatarColor || "#BE5238" }}>{c.customer.trim().charAt(0) || "ع"}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between"><span className="truncate text-[14px] font-bold text-[#2A2019]">{c.customer}</span><span className="text-[10.5px]" style={{ color: isEscalated(c) ? "#BE5238" : "#A99D8D", fontWeight: isEscalated(c) ? 700 : 400 }}>{c.lastTime}</span></span>
                  <span className="mt-0.5 block truncate text-[12px] text-[#6B6055]">{c.lastMessage}</span>
                  <span className="mt-1.5 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[10px] font-bold" style={{ background: tag.bg, border: `1px solid ${tag.border}`, color: tag.fg }}>
                      {tag.icon === "alert" && <AlertTriangle className="h-2.5 w-2.5" />}{tag.icon === "human" && <User className="h-2.5 w-2.5" />}{tag.icon === "ai" && <Sparkles className="h-2.5 w-2.5" />}{tag.label}
                    </span>
                    {c.unread > 0 && <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#BE5238] px-1 text-[10px] font-bold text-white">{toAr(c.unread)}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ===== chat window ===== */}
      <section className={`${mobileChat ? "flex" : "hidden"} min-w-0 flex-1 flex-col bg-[#F8F4EE] lg:flex`}>
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#BE5238] ring-1 ring-[#ECE3D5]"><MessageSquare className="h-7 w-7" /></span>
            <p className="text-[13px] font-semibold text-[#7C7163]">اختر محادثة لعرضها</p>
          </div>
        ) : (
          <>
            {/* chat header */}
            <div className="flex flex-none items-center gap-3 border-b border-[#F0E9DD] bg-white px-4 py-3">
              <button onClick={() => setMobileChat(false)} className="lg:hidden text-[#7C7163]"><ArrowRight className="h-5 w-5" /></button>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[16px] font-bold text-white" style={{ background: selected.avatarColor || "#BE5238" }}>{selected.customer.trim().charAt(0) || "ع"}</span>
              <div className="flex-1 leading-tight">
                <div className="flex items-center gap-2"><span className="text-[15px] font-bold text-[#2A2019]">{selected.customer}</span><span dir="ltr" className="text-[11px] text-[#9A8E7E]">{selected.phone}</span></div>
                <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: selected.owner === "human" ? "#6B4F91" : "#436B50" }}>
                  {selected.owner === "human" ? <><User className="h-3 w-3" /> مع موظف</> : <><Sparkles className="h-3 w-3" /> المساعد يرد تلقائياً</>}
                </div>
              </div>
              {selected.owner === "human" ? (
                <button onClick={() => returnToAi()} className="flex items-center gap-1.5 rounded-[10px] border border-[#EBE2D3] bg-white px-3 py-2 text-[12.5px] font-bold text-[#436B50] transition hover:border-[#5C8A6B]"><Bot className="h-4 w-4" /> إعادة للمساعد</button>
              ) : (
                <button onClick={() => takeover()} className="flex items-center gap-1.5 rounded-[10px] border border-[#EBE2D3] bg-white px-3 py-2 text-[12.5px] font-bold text-[#BE5238] transition hover:border-[#BE5238]"><User className="h-4 w-4" /> تحويل لموظف</button>
              )}
            </div>

            {/* escalation banner */}
            {selected.escalationReason && (
              <div className="flex flex-none items-center gap-2 border-b border-[#F1D2C8] bg-[#FBEAE5] px-4 py-2 text-[12px] font-semibold text-[#A8472F]">
                <AlertTriangle className="h-3.5 w-3.5" /> سبب التصعيد: {selected.escalationReason}
              </div>
            )}

            {/* messages */}
            <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
              <div className="text-center"><span className="rounded-full bg-[#EFE9DF] px-3 py-0.5 text-[10.5px] text-[#A99D8D]">اليوم</span></div>
              {selected.messages.map((m) => <Bubble key={m.id} m={m} />)}
            </div>

            {/* composer (operator reply; sending takes over — E3) */}
            <div className="flex-none border-t border-[#F0E9DD] bg-white p-3">
              <div className="flex items-center gap-2 rounded-[14px] border border-[#EBE2D3] bg-[#F7F2EA] p-1.5 pr-3">
                <input value={draftMsg} onChange={(e) => setDraftMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }}
                  placeholder={selected.owner === "human" ? "اكتب رد الموظف…" : "اكتب لتتولّى المحادثة…"}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[#2A2019] outline-none placeholder:text-[#AEA391]" />
                <button onClick={sendReply} disabled={!draftMsg.trim()} className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#BE5238] text-white transition hover:bg-[#A8472F] disabled:opacity-40"><Send className="h-4 w-4" /></button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ===== AI insights panel (xl) ===== */}
      {selected && (
        <aside className="hidden w-[290px] flex-none overflow-y-auto border-r border-[#ECE3D5] bg-white p-4 xl:block">
          <InsightsPanel c={selected} order={createdOrder} />
        </aside>
      )}
    </div>
  );
}

// ---- pieces ----------------------------------------------------------------
function Bubble({ m }: { m: ChatMessage }) {
  if (m.sender === "system") {
    return <div className="self-center max-w-[85%] rounded-[12px] border border-[#EFDDB6] bg-[#FBF1DD] px-3 py-1.5 text-center text-[11px] font-semibold text-[#946312]">{m.text}</div>;
  }
  if (m.sender === "customer") {
    return (
      <div className="max-w-[72%] self-start rounded-[4px_14px_14px_14px] border border-[#EFE7DA] bg-white px-3.5 py-2.5">
        <div className="whitespace-pre-line text-[13px] leading-relaxed text-[#2A2019]">{m.text}</div>
        <div className="mt-1 text-left text-[9.5px] text-[#B3A795]">{m.time}</div>
      </div>
    );
  }
  // ai / human → outgoing
  const human = m.sender === "human";
  return (
    <div className="max-w-[78%] self-end rounded-[14px_4px_14px_14px] px-3.5 py-2.5" style={{ background: human ? "#FBF1ED" : "#DDF5E0", border: human ? "1px solid #F1D2C8" : "none" }}>
      <div className="mb-1 flex items-center gap-1.5">
        {human ? <User className="h-3 w-3 text-[#A8472F]" /> : <Sparkles className="h-3 w-3 text-[#1E7A47]" />}
        {/* confidence shown ONLY if real (present on the message); never fabricated */}
        <span className="text-[10px] font-bold" style={{ color: human ? "#A8472F" : "#1E7A47" }}>{human ? "موظف" : `المساعد${typeof m.confidence === "number" ? ` · ثقة ${toAr(m.confidence)}٪` : ""}`}</span>
      </div>
      <div className="whitespace-pre-line text-[13px] leading-relaxed" style={{ color: human ? "#3F362E" : "#173E26" }}>{m.text}</div>
      <div className="mt-1 text-left text-[9.5px]" style={{ color: human ? "#C2A39A" : "#6FA983" }}>{m.time}</div>
    </div>
  );
}

function InsightsPanel({ c, order }: { c: Conversation; order: ReturnType<typeof useConversationEngine>["createdOrder"] }) {
  return (
    <>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-white" style={{ background: "linear-gradient(150deg,#C25A3E,#8A3621)" }}><Sparkles className="h-4 w-4" /></span>
        <span className="text-[14px] font-bold text-[#2A2019]">لوحة المساعد</span>
      </div>

      {/* escalation reason (real) */}
      {c.escalationReason && (
        <div className="mb-3.5 rounded-[14px] border border-[#F1D2C8] bg-[#FBEAE5] p-3">
          <div className="mb-1 text-[11px] font-bold text-[#A8472F]">سبب التصعيد</div>
          <p className="text-[12.5px] leading-relaxed text-[#3F362E]">{c.escalationReason}</p>
        </div>
      )}

      {/* suggested step (real only if present) */}
      {c.suggestedAction && (
        <div className="mb-3.5 rounded-[14px] border border-[#F1D2C8] p-3" style={{ background: "linear-gradient(160deg,#FBF1ED,#FBEAE5)" }}>
          <div className="mb-1.5 text-[11px] font-bold text-[#A8472F]">الخطوة المقترحة</div>
          <p className="text-[12.5px] leading-relaxed text-[#3F362E]">{c.suggestedAction}</p>
        </div>
      )}

      {/* intent + confidence — NOT populated for real conversations → «—» / قريبًا */}
      <div className="mb-3.5 grid grid-cols-2 gap-2.5">
        <div className="rounded-[12px] border border-[#EFE7DA] bg-[#F7F2EA] p-2.5">
          <div className="mb-1 text-[10.5px] text-[#9A8E7E]">القصد <span className="text-[#C9BFAE]">· قريبًا</span></div>
          <div className="text-[12.5px] font-bold text-[#2A2019]">{c.currentIntent ?? "—"}</div>
        </div>
        <div className="rounded-[12px] border border-[#EFE7DA] bg-[#F7F2EA] p-2.5">
          <div className="mb-1 text-[10.5px] text-[#9A8E7E]">الثقة <span className="text-[#C9BFAE]">· قريبًا</span></div>
          <div className="text-[12.5px] font-bold text-[#436B50]">{typeof c.aiConfidence === "number" ? `${toAr(c.aiConfidence)}٪` : "—"}</div>
        </div>
      </div>

      {/* linked order (real — items + total from the order row, money not recomputed) */}
      {order ? (
        <div className="mb-3.5 rounded-[14px] border border-[#ECE3D5] p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[12px] font-bold text-[#2A2019]">الطلب المرتبط #{toAr(order.orderNumber)}</span>
            <span className="rounded-[6px] bg-[#FBEAE5] px-1.5 py-0.5 text-[10px] font-bold text-[#A8472F]">{order.paymentStatus === "paid" ? "مدفوع" : "بانتظار الدفع"}</span>
          </div>
          <div className="flex flex-col gap-1.5 text-[12px] text-[#514538]">
            {order.items.slice(0, 5).map((it, i) => (
              <div key={i} className="flex justify-between"><span className="truncate text-[#7C7163]">{it.name} ×{toAr(it.quantity)}</span><span className="font-semibold">{money(it.total)}</span></div>
            ))}
            <div className="mt-1 flex justify-between border-t border-dashed border-[#EBE2D3] pt-2"><span className="font-bold text-[#2A2019]">الإجمالي</span><span className="font-bold text-[#BE5238]">{money(order.total)} {order.currency}</span></div>
          </div>
        </div>
      ) : (
        <div className="mb-3.5 rounded-[14px] border border-[#ECE3D5] p-3 text-[12px] text-[#A99D8D]">لا طلب مرتبط بهذه المحادثة بعد.</div>
      )}

      {/* customer context — real name/phone/channel; loyalty stats have no backend → قريبًا */}
      <div className="rounded-[14px] border border-[#ECE3D5] p-3">
        <div className="mb-2.5 text-[12px] font-bold text-[#2A2019]">عن العميل</div>
        <div className="flex flex-col gap-2 text-[11.5px]">
          <Row label="الاسم" value={c.customer} />
          <Row label="الهاتف" value={<span dir="ltr">{c.phone}</span>} />
          <Row label="القناة" value={c.channel === "whatsapp" ? "واتساب" : c.channel} />
          <div className="mt-1 rounded-[9px] border border-[#EFE7DA] bg-[#F7F2EA] px-2.5 py-2 text-[11px] text-[#9A8E7E]">تصنيف العميل · عدد الطلبات · الإنفاق · المفضّل — <span className="font-semibold text-[#C5871F]">قريبًا</span> (تحليلات العملاء قيد الإعداد).</div>
        </div>
      </div>
    </>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-[#7C7163]">{label}</span><span className="font-semibold text-[#2A2019]">{value}</span></div>;
}
