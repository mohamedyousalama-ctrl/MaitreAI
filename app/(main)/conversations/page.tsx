"use client";

// ============================================================================
// MaitreAI — المحادثات (Amendment 04 §M4)
// Desktop: list · chat · context panes. Mobile: inbox → full-screen chat →
// context bottom-sheet drawer (no panes hidden behind a breakpoint, §O #1).
// ============================================================================

import { useState } from "react";
import { customers } from "@/lib/mock-data";
import { useConversationEngine } from "@/lib/ai/useConversationEngine";
import { useHasHydrated } from "@/lib/store";
import { ConversationList } from "@/components/conversations/ConversationList";
import { ChatWindow } from "@/components/conversations/ChatWindow";
import { CustomerContextPanel } from "@/components/conversations/CustomerContextPanel";
import { ArrowRight, PanelRightOpen, X, MessageSquare } from "lucide-react";

export default function ConversationsPage() {
  const hydrated = useHasHydrated();
  const {
    conversations, selectedId, selected, intentHistory, createdOrder, paymentSession,
    selectConversation, sendCustomer, sendHuman, takeover, returnToAi, confirmOrder, sendPaymentLink, markPaid,
  } = useConversationEngine();
  const [mobileChat, setMobileChat] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!hydrated) {
    return <div className="h-[calc(100vh-9rem)] animate-pulse rounded-2xl border border-[#ece0d2] bg-[#faf6ef]" />;
  }

  const customer = selected ? customers.find((c) => c.name === selected.customer) : undefined;
  const lastIntent = selected ? [...intentHistory].reverse().find((h) => h.conversationId === selected.id) : undefined;

  const chat = selected ? (
    <ChatWindow conversation={selected} onSendCustomer={sendCustomer} onSendHuman={sendHuman} onTakeover={takeover} onReturnToAi={returnToAi} />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 text-[#b5502e] shadow-glass ring-1 ring-[#ece0d2]/60 backdrop-blur-sm">
        <MessageSquare className="h-7 w-7" />
      </span>
      <p className="text-sm font-semibold text-[#6a5c4e]">اختر محادثة لعرضها</p>
      <p className="max-w-xs text-xs text-[#9b8b7c]">تظهر هنا محادثات العملاء عبر واتساب — يردّ المساعد تلقائياً، وتستطيع التدخّل في أي لحظة.</p>
    </div>
  );
  const context = selected ? (
    <CustomerContextPanel
      conversation={selected} customer={customer} lastIntent={lastIntent} createdOrder={createdOrder}
      paymentSession={paymentSession} onConfirmOrder={confirmOrder} onSendPaymentLink={sendPaymentLink} onMarkPaid={markPaid}
    />
  ) : null;

  return (
    <div className="h-[calc(100vh-9rem)] overflow-hidden rounded-3xl border border-[#ece0d2]/60 bg-[#faf6ef] shadow-float">
      {/* Desktop: panes. grid-rows-1 (minmax(0,1fr)) gives the single row the full
          card height + lets children shrink, so the thread pane can scroll.
          Panes are distinguished by translucency/elevation, not heavy dividers. */}
      <div className="hidden h-full lg:grid lg:grid-rows-1 lg:grid-cols-[332px_1fr] xl:grid-cols-[332px_1fr_348px]">
        <div className="min-h-0 border-l border-white/50">
          <ConversationList conversations={conversations} activeId={selectedId} onSelect={selectConversation} />
        </div>
        <div className="min-h-0 min-w-0">{chat}</div>
        <div className="hidden min-h-0 border-r border-white/50 xl:block">{context}</div>
      </div>

      {/* Mobile: inbox → chat */}
      <div className="h-full lg:hidden">
        {!mobileChat ? (
          <ConversationList
            conversations={conversations}
            activeId={selectedId}
            onSelect={(id) => {
              selectConversation(id);
              setMobileChat(true);
            }}
          />
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-white/50 bg-white/55 px-3 py-2 backdrop-blur-xl">
              <button onClick={() => setMobileChat(false)} className="flex items-center gap-1 text-sm font-semibold text-[#6a5c4e]">
                <ArrowRight className="h-4 w-4" /> الرجوع
              </button>
              <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-1 rounded-lg border border-[#e4d8c8] bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-[#b5502e]">
                <PanelRightOpen className="h-4 w-4" /> السياق
              </button>
            </div>
            <div className="min-h-0 flex-1">{chat}</div>
          </div>
        )}
      </div>

      {/* Mobile context drawer (bottom sheet) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#2a211b]/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-3xl bg-[#faf6ef] shadow-float">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/50 bg-white/70 px-4 py-3 backdrop-blur-xl">
              <span className="text-sm font-bold text-[#2a211b]">سياق العميل</span>
              <button onClick={() => setDrawerOpen(false)} className="text-[#9b8b7c] hover:text-[#2a211b]"><X className="h-5 w-5" /></button>
            </div>
            {context}
          </div>
        </div>
      )}
    </div>
  );
}
