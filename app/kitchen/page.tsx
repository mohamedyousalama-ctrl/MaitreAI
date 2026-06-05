import { PageHeader } from "@/components/layout/PageHeader";
import { KitchenBoard } from "@/components/kitchen/KitchenBoard";
import { orders } from "@/lib/mock-data";
import { ChefHat } from "lucide-react";

export default function KitchenPage() {
  return (
    <div>
      <PageHeader
        title="المطبخ"
        subtitle="لوحة تذاكر التحضير المباشرة"
        icon={ChefHat}
        accentBg="bg-kitchen"
      />
      <KitchenBoard orders={orders} />
    </div>
  );
}
