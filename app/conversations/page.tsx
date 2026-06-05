"use client";

import { customers, orders } from "@/lib/mock-data";
import { useConversationEngine } from "@/lib/ai/useConversationEngine";
import { useHasHydrated } from "@/lib/store";
import { ConversationList } from "@/components/conversations/ConversationList";
import { ChatWindow } from "@/components/conversations/ChatWindow";
import { CustomerContextPanel } from "@/components/conversations/CustomerContextPanel";

export default function ConversationsPage() {
  const hydrated = useHasHydrated();
  const { conversations, selectedId, selected, intentHistory, selectConversation, sendCustomer, sendHuman, takeover, returnToAi } =
    useConversationEngine();

  if (!hydrated || !selected) {
    return <div className="h-[calc(100vh-7rem)] animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />;
  }

  const customer = customers.find((c) => c.name === selected.customer);
  const order = selected.linkedOrderId ? orders.find((o) => o.id === selected.linkedOrderId) : undefined;
  const lastIntent = [...intentHistory].reverse().find((h) => h.conversationId === selected.id);

  return (
    <div className="h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_340px]">
        {/* Pane 1: list */}
        <div className="border-l border-slate-100">
          <ConversationList conversations={conversations} activeId={selectedId} onSelect={selectConversation} />
        </div>

        {/* Pane 2: chat */}
        <div className="hidden lg:block">
          <ChatWindow
            conversation={selected}
            onSendCustomer={sendCustomer}
            onSendHuman={sendHuman}
            onTakeover={takeover}
            onReturnToAi={returnToAi}
          />
        </div>

        {/* Pane 3: context + AI insights */}
        <div className="hidden border-r border-slate-100 bg-slate-50/40 xl:block">
          <CustomerContextPanel conversation={selected} customer={customer} order={order} lastIntent={lastIntent} />
        </div>
      </div>
    </div>
  );
}
