import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { AIConfidenceBadge } from "@/components/ui/AIConfidenceBadge";
import { Bot, Headset, BookOpen } from "lucide-react";

export function ChatBubble({ message }: { message: ChatMessage }) {
  // System messages render centered as a divider note.
  if (message.sender === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-slate-200/70 px-3 py-1 text-[11px] font-medium text-slate-600">
          {message.text}
        </span>
      </div>
    );
  }

  const isCustomer = message.sender === "customer";
  const isStaff = message.sender === "agent" || message.sender === "human";

  return (
    <div className={cn("flex w-full", isCustomer ? "justify-start" : "justify-end")}>
      <div className={cn("max-w-[78%]", isCustomer ? "items-start" : "items-end")}>
        {!isCustomer && (
          <div className="mb-1 flex items-center justify-end gap-1.5">
            {message.sender === "ai" ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brain">
                <Bot className="h-3 w-3" /> الموظف الذكي
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600">
                <Headset className="h-3 w-3" /> موظف خدمة العملاء
              </span>
            )}
          </div>
        )}
        <div
          className={cn(
            "whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
            isCustomer
              ? "rounded-tr-sm bg-white text-slate-800"
              : isStaff
              ? "rounded-tl-sm bg-orange-50 text-slate-800 ring-1 ring-orange-100"
              : "rounded-tl-sm bg-[#d9fdd3] text-slate-800"
          )}
        >
          {message.text}
        </div>

        {/* Sources used by the AI for this reply */}
        {message.sender === "ai" && message.sources && message.sources.length > 0 && (
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">
            <BookOpen className="h-3 w-3" />
            <span>المصدر: {message.sources.join(" + ")}</span>
          </div>
        )}

        <div className={cn("mt-1 flex items-center gap-2", isCustomer ? "justify-start" : "justify-end")}>
          <span className="text-[10px] text-slate-400">{message.time}</span>
          {message.sender === "ai" && typeof message.confidence === "number" && (
            <AIConfidenceBadge value={message.confidence} />
          )}
        </div>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-[#d9fdd3] px-4 py-3 shadow-sm">
        <span className="typing-dot h-2 w-2 rounded-full bg-brain" style={{ animationDelay: "0ms" }} />
        <span className="typing-dot h-2 w-2 rounded-full bg-brain" style={{ animationDelay: "150ms" }} />
        <span className="typing-dot h-2 w-2 rounded-full bg-brain" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
