import { PageHeader } from "@/components/layout/PageHeader";
import { CustomerCard } from "@/components/ui/CustomerCard";
import { customers } from "@/lib/mock-data";
import { Users } from "lucide-react";

export default function CustomersPage() {
  return (
    <div>
      <PageHeader
        title="العملاء"
        subtitle="سجل العملاء وتاريخ الطلبات"
        icon={Users}
        accentBg="bg-customers"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {customers.map((c) => (
          <CustomerCard key={c.id} customer={c} />
        ))}
      </div>
    </div>
  );
}
