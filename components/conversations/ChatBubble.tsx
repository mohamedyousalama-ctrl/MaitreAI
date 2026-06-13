import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { AIConfidenceBadge } from "@/components/ui/AIConfidenceBadge";
import { Bot, Headset, BookOpen, ChevronLeft, List } from "lucide-react";

type Row = { id: string; title: string; description?: string };
type Presentation =
  | { kind: "buttons"; buttons: { id: string; title: string }[]; header?: string }
  | { kind: "list"; button: string; sections: { title?: string; rows: Row[] }[]; header?: string };

/** Day divider between message groups (uses createdAtMs; absent in demo seed). */
export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center justify-center">
      <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-[#9b8b7c] shadow-glass ring-1 ring-[#ece0d2]/60 backdrop-blur-sm">
        {label}
      </span>
    </div>
  );
}

/** Render a WhatsApp interactive list/buttons as a tasteful inline card. */
function PresentationCard({ p }: { p: Presentation }) {
  const rows: Row[] = p.kind === "list" ? p.sections.flatMap((s) => s.rows) : p.buttons.map((b) => ({ id: b.id, title: b.title }));
  const label = p.kind === "list" ? p.button : "اختيار سريع";
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-[#ece0d2]/70 bg-white/80 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 border-b border-[#f0e7da] px-3 py-1.5 text-[11px] font-semibold text-[#b5502e]">
        <List className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="divide-y divide-[#f3ece1]">
        {rows.slice(0, 6).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[#2a211b]">{r.title}</p>
              {r.description && <p className="truncate text-[11px] text-[#9b8b7c]">{r.description}</p>}
            </div>
            <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-[#c2a98f]" />
          </div>
        ))}
        {rows.length > 6 && <div className="px-3 py-1.5 text-[11px] text-[#9b8b7c]">+{rows.length - 6} المزيد…</div>}
      </div>
    </div>
  );
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  // System notes render as a centered, quiet divider.
  if (message.sender === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="max-w-[85%] rounded-full bg-white/60 px-3 py-1 text-center text-[11px] font-medium text-[#9b8b7c] ring-1 ring-[#ece0d2]/60 backdrop-blur-sm">
          {message.text}
        </span>
      </div>
    );
  }

  const isCustomer = message.sender === "customer";
  const isHuman = message.sender === "human" || message.sender === "agent";
  const isAi = message.sender === "ai";
  const presentation = (message.metadata?.presentation ?? null) as Presentation | null;

  // Business side (AI + human-takeover) sits at the start (right, RTL); the
  // customer sits at the end (left). Three visually distinct states.
  return (
    <div className={cn("flex w-full", isCustomer ? "justify-end" : "justify-start")}>
      <div className="max-w-[80%]">
        {!isCustomer && (
          <div className="mb-1 flex items-center gap-1.5">
            {isAi ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b5502e]">
                <Bot className="h-3 w-3" /> المساعد الذكي
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#9a6c1e]">
                <Headset className="h-3 w-3" /> موظف
              </span>
            )}
          </div>
        )}
        <div
          className={cn(
            "whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-glass ring-1",
            isCustomer && "rounded-tl-md bg-white/90 text-[#2a211b] ring-[#ece0d2]/70",
            isAi && "rounded-tr-md bg-[#fbf1ea]/95 text-[#3a2c22] ring-[#f0d9c9]",
            isHuman && "rounded-tr-md bg-[#fdf4e0]/95 text-[#3a2f1c] ring-[#f0e0b8]"
          )}
        >
          {message.text}
          {isAi && presentation && <PresentationCard p={presentation} />}
        </div>

        {isAi && message.sources && message.sources.length > 0 && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-[#b9a892]">
            <BookOpen className="h-3 w-3" />
            <span>المصدر: {message.sources.join(" + ")}</span>
          </div>
        )}

        <div className={cn("mt-1 flex items-center gap-2", isCustomer ? "justify-end" : "justify-start")}>
          <span className="text-[10px] text-[#b9a892]">{message.time}</span>
          {isAi && typeof message.confidence === "number" && <AIConfidenceBadge value={message.confidence} />}
        </div>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-tr-md bg-[#fbf1ea]/95 px-4 py-3 shadow-glass ring-1 ring-[#f0d9c9]">
        <span className="typing-dot h-2 w-2 rounded-full bg-[#b5502e]" style={{ animationDelay: "0ms" }} />
        <span className="typing-dot h-2 w-2 rounded-full bg-[#b5502e]" style={{ animationDelay: "150ms" }} />
        <span className="typing-dot h-2 w-2 rounded-full bg-[#b5502e]" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
