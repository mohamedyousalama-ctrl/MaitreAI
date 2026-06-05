import { PageHeader } from "@/components/layout/PageHeader";
import { BranchCard } from "@/components/ui/BranchCard";
import { branches } from "@/lib/mock-data";
import { Store, Plus } from "lucide-react";

export default function BranchesPage() {
  return (
    <div>
      <PageHeader
        title="الفروع"
        subtitle="إدارة فروع المطعم وربط واتساب"
        icon={Store}
        accentBg="bg-branches"
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-branches px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:opacity-90">
            <Plus className="h-4 w-4" /> فرع جديد
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((b) => (
          <BranchCard key={b.id} branch={b} />
        ))}
      </div>
    </div>
  );
}
