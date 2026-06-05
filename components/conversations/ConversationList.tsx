"use client";

import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-3">
        <input
          type="text"
          placeholder="ابحث في المحادثات..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-conversations"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map((c) => {
          const active = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex w-full gap-3 border-b border-slate-50 px-3 py-3 text-start transition-colors",
                active ? "bg-conversations/5" : "hover:bg-slate-50"
              )}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: c.avatarColor }}
              >
                {c.customer.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-slate-800">{c.customer}</p>
                  <span className="shrink-0 text-[10px] text-slate-400">{c.lastTime}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{c.lastMessage}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <StatusBadge status={c.status} className="scale-90 origin-right" />
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-conversations px-1.5 text-[10px] font-bold text-white">
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
