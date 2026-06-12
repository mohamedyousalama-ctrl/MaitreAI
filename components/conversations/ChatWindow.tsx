"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@/lib/types";
import { ChatBubble, TypingIndicator } from "./ChatBubble";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Send, Sparkles, Hand, Bot, User, Loader2, Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const isHuman = conversation.owner === "human";

  useEffect(() => {
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

  function release() {
    // §E7: capture a one-line handover summary the assistant must honor on resume.
    const note = window.prompt(
      "ملخص التسليم للمساعد (اختياري) — أي وعد أو سياق يجب أن يكمل عليه، مثل «وعدت العميل بخصم ١٠٪»:",
      ""
    );
    if (note === null) return; // cancelled
    onReturnToAi(note.trim() || undefined);
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[#ece0d2] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: conversation.avatarColor }}
          >
            {conversation.customer.charAt(0)}
          </span>
          <div>
            <p className="font-bold text-[#2a211b]">{conversation.customer}</p>
            <p className="text-xs text-[#9b8b7c]">{conversation.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
              isHuman ? "bg-[#f7e3df] text-[#a8432a]" : "bg-[#f0e7da] text-[#b5502e]"
            )}
          >
            {isHuman ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            {isHuman ? "المساعد متوقف" : "المساعد يرد"}
          </span>
          <StatusBadge status={conversation.status} />
          {isHuman ? (
            <button
              onClick={release}
              className="hidden items-center gap-1.5 rounded-xl bg-[#3c7a52] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 sm:inline-flex"
            >
              <Bot className="h-4 w-4" /> إعادة للمساعد
            </button>
          ) : (
            <button
              onClick={onTakeover}
              className="hidden items-center gap-1.5 rounded-xl bg-[#b5502e] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 sm:inline-flex"
            >
              <Hand className="h-4 w-4" /> تولَّ المحادثة
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-[#faf6ef] p-4">
        {conversation.messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
        {conversation.aiTyping && <TypingIndicator />}
      </div>

      {/* Copilot suggestion (E4) */}
      {(suggestion || suggestErr) && (
        <div className="border-t border-[#ece0d2] bg-[#fbf4ea] px-3 py-2.5">
          {suggestErr ? (
            <p className="text-xs text-[#9a6c1e]">{suggestErr}</p>
          ) : (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[#b5502e]">
                <Sparkles className="h-3.5 w-3.5" /> رد مقترح من المساعد
              </p>
              <p className="rounded-xl bg-white px-3 py-2 text-sm text-[#2a211b] shadow-sm">{suggestion}</p>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={sendSuggestion} className="flex items-center gap-1 rounded-lg bg-[#b5502e] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95">
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

      {/* Composer */}
      <div className="border-t border-[#ece0d2] bg-white">
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            onClick={getSuggestion}
            disabled={suggestLoading}
            title="اقتراح رد من المساعد"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#e4d8c8] text-[#b5502e] hover:bg-[#faf6ef] disabled:opacity-50"
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
            className="flex-1 rounded-xl border border-[#e4d8c8] bg-[#faf6ef] px-4 py-2.5 text-sm text-[#2a211b] outline-none placeholder:text-[#9b8b7c] focus:border-[#b5502e]"
          />
          <button onClick={submit} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b5502e] text-white hover:opacity-90">
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
    </div>
  );
}
