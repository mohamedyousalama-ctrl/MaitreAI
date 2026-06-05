"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@/lib/types";
import { ChatBubble, TypingIndicator } from "./ChatBubble";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Send, Smile, Paperclip, Hand, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  conversation: Conversation;
  onSendCustomer: (text: string) => void;
  onSendHuman: (text: string) => void;
  onTakeover: () => void;
  onReturnToAi: () => void;
}

export function ChatWindow({ conversation, onSendCustomer, onSendHuman, onTakeover, onReturnToAi }: ChatWindowProps) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isHuman = conversation.owner === "human";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation.messages.length, conversation.aiTyping]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (isHuman) onSendHuman(t);
    else onSendCustomer(t);
    setText("");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: conversation.avatarColor }}
          >
            {conversation.customer.charAt(0)}
          </span>
          <div>
            <p className="font-bold text-slate-900">{conversation.customer}</p>
            <p className="text-xs text-slate-500">{conversation.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
              isHuman ? "bg-orange-50 text-orange-600" : "bg-brain/10 text-brain"
            )}
          >
            {isHuman ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            {isHuman ? "موظف" : "ذكاء اصطناعي"}
          </span>
          <StatusBadge status={conversation.status} />
          {isHuman ? (
            <button
              onClick={onReturnToAi}
              className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-l from-brain to-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-card hover:opacity-90 sm:inline-flex"
            >
              <Bot className="h-4 w-4" /> إعادة للذكاء الاصطناعي
            </button>
          ) : (
            <button
              onClick={onTakeover}
              className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-l from-red-500 to-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-card hover:opacity-90 sm:inline-flex"
            >
              <Hand className="h-4 w-4" /> تحويل لموظف
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="chat-bg flex-1 space-y-3 overflow-y-auto p-4">
        {conversation.messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
        {conversation.aiTyping && <TypingIndicator />}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-100 bg-white">
        <div
          className={cn(
            "px-4 py-1.5 text-center text-[11px] font-medium",
            isHuman ? "bg-orange-50 text-orange-600" : "bg-brain/5 text-brain"
          )}
        >
          {isHuman ? "أنت ترد كموظف خدمة العملاء" : "وضع المحاكاة: تكتب كرسالة عميل، والموظف الذكي يرد تلقائياً"}
        </div>
        <div className="flex items-center gap-2 px-3 py-3">
          <button className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50">
            <Smile className="h-5 w-5" />
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50">
            <Paperclip className="h-5 w-5" />
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
            placeholder={isHuman ? "اكتب رد الموظف..." : "اكتب رسالة العميل..."}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-conversations"
          />
          <button
            onClick={submit}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl text-white hover:opacity-90",
              isHuman ? "bg-orange-500" : "bg-conversations"
            )}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
