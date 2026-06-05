"use client";

import { useState } from "react";
import type { Conversation, IntentHistoryEntry } from "@/lib/types";
import { INTENT_LABELS } from "@/lib/ai/engine";
import { AIConfidenceBadge } from "@/components/ui/AIConfidenceBadge";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Sparkles,
  Bot,
  User,
  Lightbulb,
  BookOpen,
  AlertTriangle,
  Tag,
  ShoppingBag,
  Code2,
  ChevronDown,
} from "lucide-react";

interface AiInsightsPanelProps {
  conversation: Conversation;
  lastIntent?: IntentHistoryEntry;
}

export function AiInsightsPanel({ conversation, lastIntent }: AiInsightsPanelProps) {
  const [debugOpen, setDebugOpen] = useState(false);
  const isHuman = conversation.owner === "human";
  const intent = conversation.currentIntent;
  const entities = conversation.entities;
  const sources = lastIntent?.sourcesUsed ?? [];
  const draft = conversation.draftOrder;
  const draftTotal = draft?.items.reduce((sum, it) => sum + it.price * it.quantity, 0) ?? 0;

  const entityChips: { label: string; value: string }[] = [];
  if (entities) {
    entities.items.forEach((i) => entityChips.push({ label: "صنف", value: `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}` }));
    entities.modifiers.forEach((m) => entityChips.push({ label: "تعديل", value: m }));
    if (entities.branch) entityChips.push({ label: "فرع", value: entities.branch });
    if (entities.deliveryArea) entityChips.push({ label: "منطقة", value: entities.deliveryArea });
    entities.allergens.forEach((a) => entityChips.push({ label: "حساسية", value: a }));
  }

  return (
    <div className="rounded-2xl border border-purple-100 bg-gradient-to-b from-purple-50/70 to-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold text-promotions">
          <Sparkles className="h-4 w-4" /> رؤى الموظف الذكي
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            isHuman ? "bg-orange-50 text-orange-600" : "bg-brain/10 text-brain"
          )}
        >
          {isHuman ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
          {isHuman ? "موظف بشري" : "ذكاء اصطناعي"}
        </span>
      </div>

      {/* Intent + confidence */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-100 bg-white p-3">
          <p className="text-xs text-slate-500">النية</p>
          <p className="mt-0.5 text-sm font-bold text-slate-800">{intent ? INTENT_LABELS[intent] : "—"}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3">
          <p className="text-xs text-slate-500">الثقة</p>
          <div className="mt-1">
            {typeof conversation.aiConfidence === "number" ? (
              <AIConfidenceBadge value={conversation.aiConfidence} />
            ) : (
              <span className="text-sm text-slate-400">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Suggested action */}
      {conversation.suggestedAction && (
        <div className="mt-2 rounded-xl border border-purple-100 bg-purple-50/60 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-promotions">
            <Lightbulb className="h-3.5 w-3.5" /> الإجراء المقترح
          </div>
          <p className="mt-1 text-sm text-slate-700">{conversation.suggestedAction}</p>
        </div>
      )}

      {/* Escalation reason */}
      {conversation.escalationReason && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50/60 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div>
            <p className="text-xs font-bold text-red-600">سبب التصعيد</p>
            <p className="mt-0.5 text-sm text-slate-700">{conversation.escalationReason}</p>
          </div>
        </div>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <BookOpen className="h-3.5 w-3.5" /> المصادر المستخدمة
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Entities */}
      {entityChips.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Tag className="h-3.5 w-3.5" /> الكيانات المكتشفة
          </p>
          <div className="flex flex-wrap gap-1.5">
            {entityChips.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                <span className="text-[10px] text-slate-400">{c.label}</span>
                {c.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Draft order preview */}
      {draft && draft.items.length > 0 && (
        <div className="mt-3 rounded-xl border border-orders/20 bg-white p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-orders">
            <ShoppingBag className="h-3.5 w-3.5" /> مسودة الطلب
          </div>
          <ul className="mt-2 space-y-1">
            {draft.items.map((it, i) => (
              <li key={i} className="flex items-start justify-between text-sm">
                <div>
                  <span className="text-slate-700">
                    {it.name} <span className="text-slate-400">×{it.quantity}</span>
                  </span>
                  {it.modifiers.length > 0 && <p className="text-xs text-slate-400">{it.modifiers.join("، ")}</p>}
                </div>
                <span className="text-slate-600">{formatCurrency(it.price * it.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-xs font-semibold text-slate-600">الإجمالي التقديري</span>
            <span className="text-sm font-bold text-slate-900">{formatCurrency(draftTotal)}</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">* مسودة مبدئية — محرك الطلبات الكامل في المرحلة القادمة.</p>
        </div>
      )}

      {/* AI debug */}
      {lastIntent && (
        <div className="mt-3">
          <button
            onClick={() => setDebugOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <span className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5" /> AI Debug
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", debugOpen && "rotate-180")} />
          </button>
          {debugOpen && (
            <pre dir="ltr" className="mt-1 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-300">
              {JSON.stringify(
                {
                  intent: lastIntent.detectedIntent,
                  confidence: lastIntent.confidence,
                  entities: {
                    items: lastIntent.entities.items,
                    modifiers: lastIntent.entities.modifiers,
                    branch: lastIntent.entities.branch,
                    deliveryArea: lastIntent.entities.deliveryArea,
                    allergens: lastIntent.entities.allergens,
                  },
                  sources: lastIntent.sourcesUsed,
                  suggestedAction: lastIntent.suggestedAction,
                },
                null,
                2
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
