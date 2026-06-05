import { PageHeader } from "@/components/layout/PageHeader";
import { PromotionCard } from "@/components/ui/PromotionCard";
import { promotions } from "@/lib/mock-data";
import { Megaphone, Plus } from "lucide-react";

export default function PromotionsPage() {
  return (
    <div>
      <PageHeader
        title="العروض"
        subtitle="إدارة العروض والخصومات الترويجية"
        icon={Megaphone}
        accentBg="bg-promotions"
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-promotions px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:opacity-90">
            <Plus className="h-4 w-4" /> عرض جديد
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {promotions.map((p) => (
          <PromotionCard key={p.id} promo={p} />
        ))}
      </div>
    </div>
  );
}
