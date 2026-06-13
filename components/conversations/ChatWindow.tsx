"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Conversation } from "@/lib/types";
import { ChatBubble, TypingIndicator, DaySeparator } from "./ChatBubble";
import { ConversationStatusChip } from "./ConversationStatusChip";
import { PromptDialog } from "@/components/ui/PromptDialog";
import { Send, Sparkles, Hand, Bot, Loader2, Check, Pencil, X, AlertTriangle } from "lucide-react";

/** Day-divider label from epoch ms (today / yesterday / date). */
function dayLabel(ms: number): string {
  const d = new Date(ms);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "أمس";
  return d.toLocaleDateString("ar", { day: "numeric", month: "long" });
}

interface ChatWindowProps {
  conversation: Conversation;
  onSendCustomer: (text: string) => void;
  onSendHuman: (text: string) => void;
  onTakeover: () => void;
  onReturnToAi: (note?: string) => void;
}

// §M4: AI-owned → composer reads «اكتب لتتولى المحادثة» and typing/sending takes
// over (E3). Human-owned → «المساعد متوقف» badge + a copilot suggestion drafted by
// the real Brain (E4, /api/agent/suggest). Release returns to the assistant (E7).
export function ChatWindow({ conversation, onSendCustomer, onSendHuman, onTakeover, onReturnToAi }: ChatWindowProps) {
  const [text, setText] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const isHuman = conversation.owner === "human";

  // Track whether the operator is parked near the bottom; if they've scrolled up
  // to read history, don't yank them down on the next realtime message.
  const onThreadScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Switching conversations → jump to the latest instantly.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stickToBottom.current = true;
  }, [conversation.id]);

  // New message / typing → auto-scroll ONLY if the operator was at the bottom.
  useEffect(() => {
    if (!stickToBottom.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation.messages.length, conversation.aiTyping]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (!isHuman) onTakeover(); // E3: typing/sending takes over the conversation
    onSendHuman(t);
    setText("");
  };

  async function getSuggestion() {
    setSuggestLoading(true);
    setSuggestErr(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/agent/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id }),
      });
      const j = await res.json();
      if (!res.ok) {
        setSuggestErr(
          j.error === "unauthorized"
            ? "اقتراح المساعد متاح في الوضع المباشر فقط."
            : j.error === "no_customer_message"
            ? "لا توجد رسالة عميل للرد عليها."
            : "تعذّر جلب اقتراح المساعد."
        );
        return;
      }
      setSuggestion(String(j.suggestion || ""));
    } catch {
      setSuggestErr("تعذّر الاتصال بالمساعد.");
    } finally {
      setSuggestLoading(false);
    }
  }

  function sendSuggestion() {
    if (!suggestion) return;
    if (!isHuman) onTakeover();
    onSendHuman(suggestion);
    setSuggestion(null);
  }

  function confirmRelease(note: string) {
    // §E7: persist the one-line handover summary the assistant must honor on resume.
    setReleaseOpen(false);
    onReturnToAi(note.trim() || undefined);
  }

  // Build the thread with day separators (uses createdAtMs; demo seed omits it).
  const threadNodes: ReactNode[] = [];
  let lastDayKey: number | null = null;
  for (const m of conversation.messages) {
    if (m.createdAtMs) {
      const d = new Date(m.createdAtMs);
      const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (key !== lastDayKey) {
        threadNodes.push(<DaySeparator key={`day-${key}-${m.id}`} label={dayLabel(m.createdAtMs)} />);
        lastDayKey = key;
      }
    }
    threadNodes.push(<ChatBubble key={m.id} message={m} />);
  }

  return (
    <div className="flex h-full flex-col bg-[#faf6ef]">
      {/* Header — glassy chrome */}
      <div className="z-10 shrink-0 border-b border-white/50 bg-white/55 px-4 py-3 shadow-glass backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: conversation.avatarColor }}
            >
              {conversation.customer.charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold text-[#2a211b]">{conversation.customer}</p>
              <p dir="ltr" className="truncate text-start text-xs text-[#9b8b7c]">{conversation.phone}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ConversationStatusChip conversation={conversation} size="md" />
            {isHuman ? (
              <button
                onClick={() => setReleaseOpen(true)}
                className="hidden items-center gap-1.5 rounded-xl bg-[#3c7a52] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95 sm:inline-flex"
              >
                <Bot className="h-4 w-4" /> إعادة للمساعد
              </button>
            ) : (
              <button
                onClick={onTakeover}
                className="hidden items-center gap-1.5 rounded-xl bg-[#b5502e] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95 sm:inline-flex"
              >
                <Hand className="h-4 w-4" /> تولَّ المحادثة
              </button>
            )}
          </div>
        </div>
        {conversation.escalationReason && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#fbeae5]/70 px-3 py-1.5 text-[11px] font-medium text-[#a8432a]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> سبب التصعيد: {conversation.escalationReason}
          </div>
        )}
      </div>

      {/* Messages — the hero, on the warm base */}
      <div ref={scrollRef} onScroll={onThreadScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {threadNodes}
        {conversation.aiTyping && <TypingIndicator />}
      </div>

      {/* Copilot suggestion (E4) */}
      {(suggestion || suggestErr) && (
        <div className="shrink-0 border-t border-white/50 bg-[#fbf4ea]/80 px-3 py-2.5 backdrop-blur-xl">
          {suggestErr ? (
            <p className="text-xs text-[#9a6c1e]">{suggestErr}</p>
          ) : (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[#b5502e]">
                <Sparkles className="h-3.5 w-3.5" /> رد مقترح من المساعد
              </p>
              <p className="rounded-xl bg-white/90 px-3 py-2 text-sm text-[#2a211b] shadow-glass ring-1 ring-[#ece0d2]/60">{suggestion}</p>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={sendSuggestion} className="flex items-center gap-1 rounded-lg bg-[#b5502e] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 active:scale-95">
                  <Check className="h-3.5 w-3.5" /> إرسال
                </button>
                <button
                  onClick={() => {
                    setText(suggestion || "");
                    setSuggestion(null);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-[#e4d8c8] px-3 py-1.5 text-xs font-semibold text-[#6a5c4e] hover:bg-white"
                >
                  <Pencil className="h-3.5 w-3.5" /> تعديل
                </button>
                <button onClick={() => setSuggestion(null)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[#9b8b7c] hover:text-[#2a211b]">
                  <X className="h-3.5 w-3.5" /> تجاهل
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Composer — glassy chrome */}
      <div className="shrink-0 border-t border-white/50 bg-white/60 backdrop-blur-xl">
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            onClick={getSuggestion}
            disabled={suggestLoading}
            title="اقتراح رد من المساعد"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e4d8c8] bg-white/70 text-[#b5502e] transition hover:bg-white disabled:opacity-50"
          >
            {suggestLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          </button>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={isHuman ? "اكتب رد الموظف…" : "اكتب لتتولى المحادثة…"}
            className="min-w-0 flex-1 rounded-xl border border-[#e4d8c8] bg-white/80 px-4 py-2.5 text-sm text-[#2a211b] outline-none placeholder:text-[#9b8b7c] focus:border-[#b5502e] focus:bg-white"
          />
          <button onClick={submit} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#b5502e] text-white shadow-sm transition hover:opacity-90 active:scale-95">
            <Send className="h-5 w-5" />
          </button>
        </div>
        {!isHuman && (
          <button
            onClick={() => {
              const t = text.trim();
              if (t) {
                onSendCustomer(t);
                setText("");
              }
            }}
            className="w-full pb-2 text-center text-[11px] text-[#9b8b7c] hover:text-[#6a5c4e]"
          >
            محاكاة رسالة عميل (للتجربة)
          </button>
        )}
      </div>

      {/* §E7: in-app handover-summary prompt (replaces native window.prompt) */}
      <PromptDialog
        open={releaseOpen}
        title="إعادة المحادثة للمساعد"
        message="أي وعد أو سياق يجب أن يكمل عليه المساعد؟ (اختياري)"
        placeholder="مثال: وعدت العميل بخصم ١٠٪"
        confirmLabel="إعادة للمساعد"
        onConfirm={confirmRelease}
        onCancel={() => setReleaseOpen(false)}
      />
    </div>
  );
}
