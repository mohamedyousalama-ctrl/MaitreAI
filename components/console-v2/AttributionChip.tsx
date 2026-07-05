"use client";

// ============================================================================
// console_v2 — AttributionChip (R6, PR 1 app shell). Renders WHO authored a turn
// or handled a conversation: Assistant / Staff / System. Given a message sender,
// it derives attribution through the mapping table (deriveAttribution) and renders
// via StateChip — so attribution shares the one display vocabulary and the one
// renderer. Inbound customer turns return null from the table → nothing renders.
// ============================================================================

import { Sparkles, User, Cog, type LucideIcon } from "lucide-react";
import { deriveAttribution, type AttributableSender, type AttributionKind } from "@/lib/console-v2/display-state";
import { StateChip } from "./StateChip";

const ICON: Record<AttributionKind, LucideIcon> = {
  ai: Sparkles,
  human: User,
  system: Cog,
};

export function AttributionChip({ sender, className }: { sender: AttributableSender; className?: string }) {
  const display = deriveAttribution(sender);
  if (!display) return null; // customer/inbound — nothing to attribute
  const Icon = ICON[display.state];

  return (
    <StateChip
      display={display}
      className={className}
      style={{ gap: 5 }}
      leading={<Icon size={12} strokeWidth={2.4} />}
    />
  );
}

/** Standalone icon for a given attribution kind (for dense rows where the chip is
 *  too heavy and only the authorship glyph is needed). */
export function attributionIcon(kind: AttributionKind): LucideIcon {
  return ICON[kind];
}
