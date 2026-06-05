import type { Conversation } from "@/lib/types";
import { ChatBubble, TypingIndicator } from "./ChatBubble";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HumanTakeoverButton } from "@/components/ui/HumanTakeoverButton";
import { Paperclip, Send, Smile } from "lucide-react";

export function ChatWindow({ conversation }: { conversation: Conversation }) {
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
          <StatusBadge status={conversation.status} />
          <HumanTakeoverButton className="hidden sm:inline-flex" />
        </div>
      </div>

      {/* Messages */}
      <div className="chat-bg flex-1 space-y-3 overflow-y-auto p-4">
        {conversation.messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
        {conversation.aiTyping && <TypingIndicator />}
      </div>

      {/* Composer (visual only) */}
      <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-3">
        <button className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50">
          <Smile className="h-5 w-5" />
        </button>
        <button className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50">
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          type="text"
          placeholder="اكتب رسالة... (الموظف الذكي يرد تلقائياً)"
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-conversations"
        />
        <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-conversations text-white hover:opacity-90">
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
