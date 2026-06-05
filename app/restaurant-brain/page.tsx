import { PageHeader } from "@/components/layout/PageHeader";
import { ModuleCard } from "@/components/ui/ModuleCard";
import { KnowledgeHealthCard, OverallScoreGauge } from "@/components/restaurant-brain/KnowledgeHealthCard";
import {
  knowledgeAreas,
  knowledgeAlerts,
  overallKnowledgeScore,
  faqs,
  toneOfVoice,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  BrainCircuit,
  AlertTriangle,
  HelpCircle,
  MessageSquareQuote,
} from "lucide-react";

const SEVERITY: Record<string, string> = {
  high: "border-red-100 bg-red-50/60 text-red-700",
  medium: "border-amber-100 bg-amber-50/60 text-amber-700",
  low: "border-slate-100 bg-slate-50 text-slate-600",
};

export default function RestaurantBrainPage() {
  return (
    <div>
      <PageHeader
        title="عقل المطعم"
        subtitle="قاعدة معرفة الموظف الذكي وجاهزيتها"
        icon={BrainCircuit}
        accentBg="bg-brain"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Overall score */}
        <ModuleCard title="صحة المعرفة العامة" icon={BrainCircuit} accentBg="bg-brain" className="lg:col-span-1">
          <div className="flex flex-col items-center gap-3 py-2">
            <OverallScoreGauge score={overallKnowledgeScore} />
            <p className="text-center text-sm text-slate-500">
              الموظف الذكي جاهز للرد على معظم استفسارات العملاء، مع وجود فجوات في بعض المجالات.
            </p>
          </div>
        </ModuleCard>

        {/* Knowledge areas */}
        <ModuleCard title="مجالات المعرفة" icon={BrainCircuit} accentBg="bg-brain" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {knowledgeAreas.map((a) => (
              <KnowledgeHealthCard key={a.key} area={a} />
            ))}
          </div>
        </ModuleCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Missing knowledge alerts */}
        <ModuleCard title="تنبيهات المعرفة الناقصة" icon={AlertTriangle} accentBg="bg-kitchen" className="lg:col-span-2">
          <ul className="space-y-3">
            {knowledgeAlerts.map((alert) => (
              <li key={alert.id} className={cn("flex items-start gap-3 rounded-xl border p-3", SEVERITY[alert.severity])}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-xs font-bold">{alert.area}</p>
                  <p className="mt-0.5 text-sm text-slate-700">{alert.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </ModuleCard>

        {/* Tone of voice */}
        <ModuleCard title="نبرة الصوت" icon={MessageSquareQuote} accentBg="bg-promotions" className="lg:col-span-1">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">الأسلوب</p>
              <p className="font-semibold text-slate-800">{toneOfVoice.style}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">الإيموجي</p>
              <p className="font-semibold text-slate-800">{toneOfVoice.emojis}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">رسالة الترحيب</p>
              <p className="mt-1 text-slate-700">{toneOfVoice.greeting}</p>
            </div>
          </div>
        </ModuleCard>
      </div>

      {/* FAQs */}
      <div className="mt-6">
        <ModuleCard title="الأسئلة الشائعة" icon={HelpCircle} accentBg="bg-brain">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {faqs.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <p className="text-sm font-semibold text-slate-800">{f.q}</p>
                <p className="mt-1.5 text-sm text-slate-500">{f.a}</p>
              </div>
            ))}
          </div>
        </ModuleCard>
      </div>
    </div>
  );
}
