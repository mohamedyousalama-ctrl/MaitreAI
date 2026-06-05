"use client";

import { useState } from "react";
import { conversations, customers, orders } from "@/lib/mock-data";
import { ConversationList } from "@/components/conversations/ConversationList";
import { ChatWindow } from "@/components/conversations/ChatWindow";
import { CustomerContextPanel } from "@/components/conversations/CustomerContextPanel";

export default function ConversationsPage() {
  const [activeId, setActiveId] = useState(conversations[0].id);
  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const customer = customers.find((c) => c.name === active.customer);
  const order = active.linkedOrderId ? orders.find((o) => o.id === active.linkedOrderId) : undefined;

  return (
    <div className="h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_320px]">
        {/* Pane 1: list */}
        <div className="border-l border-slate-100">
          <ConversationList conversations={conversations} activeId={activeId} onSelect={setActiveId} />
        </div>

        {/* Pane 2: chat */}
        <div className="hidden lg:block">
          <ChatWindow conversation={active} />
        </div>

        {/* Pane 3: context */}
        <div className="hidden border-r border-slate-100 bg-slate-50/40 xl:block">
          <CustomerContextPanel conversation={active} customer={customer} order={order} />
        </div>
      </div>
    </div>
  );
}
