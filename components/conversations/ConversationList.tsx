"use client";

import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";
import { ConversationStatusChip } from "./ConversationStatusChip";
import { Search } from "lucide-react";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
}

const needsAttention = (c: Conversation) => c.status === "يحتاج تدخل موظف";

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps) {
  return (
    <div className="flex h-full flex-col bg-white/55 backdrop-blur-xl">
      <div className="shrink-0 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b9a892]" />
          <input
            type="text"
            placeholder="ابحث في المحادثات…"
            className="w-full rounded-xl border border-[#ece0d2]/70 bg-white/70 py-2 pe-9 ps-3 text-sm text-[#2a211b] outline-none ring-0 placeholder:text-[#b9a892] focus:border-[#e0c3b3] focus:bg-white"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && (
          <p className="px-3 py-10 text-center text-xs text-[#b9a892]">لا توجد محادثات بعد.</p>
        )}
        {conversations.map((c) => {
          const active = c.id === activeId;
          const attention = needsAttention(c);
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "relative flex w-full gap-3 rounded-2xl px-3 py-2.5 text-start transition-all",
                active
                  ? "bg-white shadow-glass ring-1 ring-[#ece0d2]"
                  : "hover:bg-white/70"
              )}
            >
              {attention && <span className="absolute inset-y-3 start-0 w-1 rounded-full bg-[#e0912e]" />}
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
                style={{ backgroundColor: c.avatarColor }}
              >
                {c.customer.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("truncate text-sm", attention ? "font-bold text-[#2a211b]" : "font-semibold text-[#3a2f26]")}>
                    {c.customer}
                  </p>
                  <span className="shrink-0 text-[10px] text-[#b9a892]">{c.lastTime}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-[#9b8b7c]">{c.lastMessage || "—"}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <ConversationStatusChip conversation={c} />
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#b5502e] px-1.5 text-[10px] font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
