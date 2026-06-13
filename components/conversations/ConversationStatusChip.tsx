"use client";

import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";
import { Bot, UserRound, AlertTriangle, PauseCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Truth-driven (Amendment 03 F3 / language guide §3): the chip is DERIVED from
// the conversation's real owner + status — never a hardcoded "online". Layer A
// (operator MSA). Four canonical states + a neutral fallback for other statuses.
type ChipSpec = { label: string; icon: LucideIcon; cls: string; dot: string };

export function conversationChip(c: Pick<Conversation, "owner" | "status">): ChipSpec {
  if (c.status === "يحتاج تدخل موظف") {
    return { label: "يحتاج تدخل بشري", icon: AlertTriangle, cls: "bg-[#fbeae5]/80 text-[#a8432a] ring-[#eccabd]", dot: "bg-[#cc3a33]" };
  }
  if (c.status === "تم التحويل لموظف") {
    return { label: "تم التحويل لموظف", icon: UserRound, cls: "bg-[#fbefd9]/80 text-[#9a6c1e] ring-[#ecd9b0]", dot: "bg-[#e0912e]" };
  }
  if (c.owner === "human") {
    return { label: "المساعد متوقف", icon: PauseCircle, cls: "bg-[#eef0f2]/80 text-[#5b6573] ring-[#dde1e6]", dot: "bg-[#8a94a3]" };
  }
  if (c.status === "AI نشط") {
    return { label: "المساعد يرد", icon: Bot, cls: "bg-[#e7f3ec]/80 text-[#3c7a52] ring-[#cbe5d4]", dot: "bg-[#4e9466]" };
  }
  // Other persisted statuses (e.g. order-building, paid) — show the truth as-is.
  return { label: c.status, icon: Bot, cls: "bg-[#f0e7da]/80 text-[#8a6f4e] ring-[#e4d8c8]", dot: "bg-[#b5926a]" };
}

export function ConversationStatusChip({
  conversation,
  size = "sm",
  className,
}: {
  conversation: Pick<Conversation, "owner" | "status">;
  size?: "sm" | "md";
  className?: string;
}) {
  const s = conversationChip(conversation);
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset backdrop-blur-sm",
        size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
        s.cls,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}
