"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModuleCard } from "@/components/ui/ModuleCard";
import { OverallScoreGauge } from "@/components/restaurant-brain/KnowledgeHealthCard";
import { KnowledgeScoreCard } from "@/components/restaurant-brain/KnowledgeScoreCard";
import { EntityTable, type Column } from "@/components/ui/EntityTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DeliveryAreaForm, type DeliveryAreaFormValues } from "@/components/restaurant-brain/DeliveryAreaForm";
import { FaqForm, type FaqFormValues } from "@/components/restaurant-brain/FaqForm";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { computeKnowledgeAreas, computeOverallScore, computeAlerts } from "@/lib/knowledge";
import { formatCurrency, cn } from "@/lib/utils";
import type { DeliveryArea, FaqItem, Policies } from "@/lib/types";
import {
  BrainCircuit,
  AlertTriangle,
  HelpCircle,
  Truck,
  ScrollText,
  Plus,
  MessageSquareQuote,
} from "lucide-react";

const SEVERITY: Record<string, string> = {
  high: "border-red-100 bg-red-50/60 text-red-700",
  medium: "border-amber-100 bg-amber-50/60 text-amber-700",
  low: "border-slate-100 bg-slate-50 text-slate-600",
};

const POLICY_FIELDS: { key: keyof Policies; label: string }[] = [
  { key: "refund", label: "سياسة الاسترجاع" },
  { key: "cancellation", label: "سياسة الإلغاء" },
  { key: "delivery", label: "سياسة التوصيل" },
  { key: "replacement", label: "سياسة الاستبدال" },
  { key: "payment", label: "سياسة الدفع" },
];

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold",
        active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
      )}
    >
      {active ? "مفعّل" : "متوقف"}
    </span>
  );
}

export default function RestaurantBrainPage() {
  const hydrated = useHasHydrated();
  const store = useRestaurantStore();

  const areas = useMemo(
    () =>
      computeKnowledgeAreas({
        menuItems: store.menuItems,
        modifiers: store.modifiers,
        branches: store.branches,
        faqs: store.faqs,
        policies: store.policies,
        deliveryAreas: store.deliveryAreas,
        aiTone: store.aiTone,
      }),
    [store.menuItems, store.modifiers, store.branches, store.faqs, store.policies, store.deliveryAreas, store.aiTone]
  );
  const overall = computeOverallScore(areas);
  const alerts = useMemo(
    () =>
      computeAlerts({
        menuItems: store.menuItems,
        modifiers: store.modifiers,
        branches: store.branches,
        faqs: store.faqs,
        policies: store.policies,
        deliveryAreas: store.deliveryAreas,
        aiTone: store.aiTone,
      }),
    [store.menuItems, store.modifiers, store.branches, store.faqs, store.policies, store.deliveryAreas, store.aiTone]
  );

  // Delivery area CRUD state
  const [areaForm, setAreaForm] = useState(false);
  const [editingArea, setEditingArea] = useState<DeliveryArea | null>(null);
  const [areaToDelete, setAreaToDelete] = useState<DeliveryArea | null>(null);

  // FAQ CRUD state
  const [faqForm, setFaqForm] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [faqToDelete, setFaqToDelete] = useState<FaqItem | null>(null);

  const areaColumns: Column<DeliveryArea>[] = [
    { key: "name", header: "المنطقة", render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
    { key: "min", header: "حد أدنى", render: (r) => formatCurrency(r.minOrder) },
    { key: "fee", header: "رسوم التوصيل", render: (r) => formatCurrency(r.deliveryFee) },
    { key: "time", header: "الوقت المتوقع", render: (r) => r.estimatedTime },
    { key: "status", header: "الحالة", render: (r) => <ActiveBadge active={r.active} /> },
  ];

  const faqColumns: Column<FaqItem>[] = [
    { key: "q", header: "السؤال", render: (r) => <span className="font-semibold text-slate-800">{r.question}</span> },
    { key: "cat", header: "التصنيف", render: (r) => r.category },
    { key: "status", header: "الحالة", render: (r) => <ActiveBadge active={r.active} /> },
  ];

  if (!hydrated) {
    return (
      <div>
        <PageHeader title="عقل المطعم" subtitle="قاعدة معرفة الموظف الذكي" icon={BrainCircuit} accentBg="bg-brain" />
        <div className="card h-96 animate-pulse bg-slate-50" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="عقل المطعم"
        subtitle="قاعدة معرفة الموظف الذكي — يتم حساب الجاهزية تلقائياً من اكتمال الإعدادات"
        icon={BrainCircuit}
        accentBg="bg-brain"
      />

      {/* Score + areas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ModuleCard title="صحة المعرفة العامة" icon={BrainCircuit} accentBg="bg-brain" className="lg:col-span-1">
          <div className="flex flex-col items-center gap-3 py-2">
            <OverallScoreGauge score={overall} />
            <p className="text-center text-sm text-slate-500">
              تُحتسب هذه الدرجة محلياً من اكتمال المنيو والفروع والسياسات والأسئلة الشائعة ومناطق التوصيل وإعدادات الذكاء.
            </p>
          </div>
        </ModuleCard>

        <ModuleCard title="مجالات المعرفة" icon={BrainCircuit} accentBg="bg-brain" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {areas.map((a) => (
              <KnowledgeScoreCard key={a.key} area={a} />
            ))}
          </div>
        </ModuleCard>
      </div>

      {/* Alerts */}
      <div className="mt-6">
        <ModuleCard title="تنبيهات المعرفة الناقصة" icon={AlertTriangle} accentBg="bg-kitchen">
          {alerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">كل المجالات مكتملة 🎉</p>
          ) : (
            <ul className="space-y-3">
              {alerts.map((alert) => (
                <li key={alert.id} className={cn("flex items-start gap-3 rounded-xl border p-3", SEVERITY[alert.severity])}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-xs font-bold">{alert.area}</p>
                    <p className="mt-0.5 text-sm text-slate-700">{alert.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ModuleCard>
      </div>

      {/* Delivery areas CRUD */}
      <div className="mt-6">
        <ModuleCard
          title="مناطق التوصيل"
          icon={Truck}
          accentBg="bg-brain"
          action={
            <button
              onClick={() => {
                setEditingArea(null);
                setAreaForm(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brain px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> منطقة جديدة
            </button>
          }
        >
          <EntityTable
            columns={areaColumns}
            rows={store.deliveryAreas}
            onEdit={(r) => {
              setEditingArea(r);
              setAreaForm(true);
            }}
            onDelete={setAreaToDelete}
            emptyTitle="لا توجد مناطق توصيل"
          />
        </ModuleCard>
      </div>

      {/* FAQ CRUD */}
      <div className="mt-6">
        <ModuleCard
          title="الأسئلة الشائعة"
          icon={HelpCircle}
          accentBg="bg-brain"
          action={
            <button
              onClick={() => {
                setEditingFaq(null);
                setFaqForm(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brain px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> سؤال جديد
            </button>
          }
        >
          <EntityTable
            columns={faqColumns}
            rows={store.faqs}
            onEdit={(r) => {
              setEditingFaq(r);
              setFaqForm(true);
            }}
            onDelete={setFaqToDelete}
            emptyTitle="لا توجد أسئلة شائعة"
          />
        </ModuleCard>
      </div>

      {/* Policies editor */}
      <div className="mt-6">
        <ModuleCard title="سياسات المطعم" icon={ScrollText} accentBg="bg-brain">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {POLICY_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-700">
                  {label}
                  {!store.policies[key].trim() && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-500">ناقصة</span>
                  )}
                </label>
                <textarea
                  value={store.policies[key]}
                  onChange={(e) => store.updatePolicies({ [key]: e.target.value } as Partial<Policies>)}
                  rows={3}
                  placeholder={`اكتب ${label}...`}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-brain focus:ring-2 focus:ring-brain/10"
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">يتم الحفظ تلقائياً محلياً، وتتحدث درجة المعرفة فوراً.</p>
        </ModuleCard>
      </div>

      {/* AI tone summary */}
      <div className="mt-6">
        <ModuleCard title="نبرة الذكاء الحالية" icon={MessageSquareQuote} accentBg="bg-promotions">
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{store.aiTone.greeting}</div>
          <p className="mt-2 text-xs text-slate-400">يمكن تعديل النبرة بالكامل من صفحة الإعدادات.</p>
        </ModuleCard>
      </div>

      {/* Forms + dialogs */}
      <DeliveryAreaForm
        open={areaForm}
        initial={editingArea}
        onClose={() => setAreaForm(false)}
        onSubmit={(values: DeliveryAreaFormValues) => {
          if (editingArea) store.updateDeliveryArea(editingArea.id, values);
          else store.addDeliveryArea(values);
          setAreaForm(false);
        }}
      />
      <FaqForm
        open={faqForm}
        initial={editingFaq}
        onClose={() => setFaqForm(false)}
        onSubmit={(values: FaqFormValues) => {
          if (editingFaq) store.updateFaq(editingFaq.id, values);
          else store.addFaq(values);
          setFaqForm(false);
        }}
      />
      <ConfirmDialog
        open={!!areaToDelete}
        title="حذف منطقة التوصيل"
        message={`سيتم حذف «${areaToDelete?.name}».`}
        onConfirm={() => {
          if (areaToDelete) store.deleteDeliveryArea(areaToDelete.id);
          setAreaToDelete(null);
        }}
        onCancel={() => setAreaToDelete(null)}
      />
      <ConfirmDialog
        open={!!faqToDelete}
        title="حذف السؤال"
        message={`سيتم حذف «${faqToDelete?.question}».`}
        onConfirm={() => {
          if (faqToDelete) store.deleteFaq(faqToDelete.id);
          setFaqToDelete(null);
        }}
        onCancel={() => setFaqToDelete(null)}
      />
    </div>
  );
}
