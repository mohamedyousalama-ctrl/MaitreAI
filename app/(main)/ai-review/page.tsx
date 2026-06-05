import { PageHeader } from "@/components/layout/PageHeader";
import { ModuleCard } from "@/components/ui/ModuleCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { AIConfidenceBadge } from "@/components/ui/AIConfidenceBadge";
import { conversations } from "@/lib/mock-data";
import { Sparkles, ShieldCheck, MessageCircle } from "lucide-react";

// Placeholder advanced screen — surfaces low-confidence AI replies for review.
export default function AIReviewPage() {
  const lowConfidence = conversations
    .flatMap((c) =>
      c.messages
        .filter((m) => m.sender === "ai" && typeof m.confidence === "number" && m.confidence < 75)
        .map((m) => ({ customer: c.customer, ...m }))
    )
    .sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0));

  return (
    <div>
      <PageHeader
        title="مركز مراجعة الذكاء الاصطناعي"
        subtitle="مراجعة ردود الموظف الذكي منخفضة الثقة (واجهة مبدئية)"
        icon={Sparkles}
        accentBg="bg-promotions"
      />

      <div className="mb-6 rounded-2xl border border-purple-100 bg-purple-50/60 p-4 text-sm text-slate-700">
        <div className="flex items-center gap-2 font-semibold text-promotions">
          <ShieldCheck className="h-4 w-4" /> شاشة مبدئية
        </div>
        <p className="mt-1">
          هذه الشاشة مخصصة للمراحل المتقدمة. حالياً تعرض فقط الردود التي تحتاج مراجعة بشرية بناءً على درجة الثقة.
        </p>
      </div>

      <ModuleCard title="ردود تحتاج مراجعة" icon={MessageCircle} accentBg="bg-promotions">
        {lowConfidence.length === 0 ? (
          <EmptyState title="لا توجد ردود تحتاج مراجعة" description="كل ردود الموظف الذكي ضمن مستوى الثقة المقبول." icon={ShieldCheck} />
        ) : (
          <ul className="space-y-3">
            {lowConfidence.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">{m.customer}</p>
                  <p className="mt-1 text-sm text-slate-700">{m.text}</p>
                </div>
                <AIConfidenceBadge value={m.confidence ?? 0} />
              </li>
            ))}
          </ul>
        )}
      </ModuleCard>
    </div>
  );
}
