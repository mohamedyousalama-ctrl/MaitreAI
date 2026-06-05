"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BranchCard } from "@/components/ui/BranchCard";
import { BranchForm, type BranchFormValues } from "@/components/branches/BranchForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import type { Branch } from "@/lib/types";
import { Store, Plus } from "lucide-react";

export default function BranchesPage() {
  const hydrated = useHasHydrated();
  const branches = useRestaurantStore((s) => s.branches);
  const addBranch = useRestaurantStore((s) => s.addBranch);
  const updateBranch = useRestaurantStore((s) => s.updateBranch);
  const deleteBranch = useRestaurantStore((s) => s.deleteBranch);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [toDelete, setToDelete] = useState<Branch | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (b: Branch) => {
    setEditing(b);
    setFormOpen(true);
  };

  const handleSubmit = (values: BranchFormValues) => {
    if (editing) updateBranch(editing.id, values);
    else addBranch({ ...values, whatsappConnected: !!values.whatsappNumber });
    setFormOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="الفروع"
        subtitle="إدارة فروع المطعم وربط واتساب"
        icon={Store}
        accentBg="bg-branches"
        actions={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-branches px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> فرع جديد
          </button>
        }
      />

      {!hydrated ? (
        <SkeletonGrid />
      ) : branches.length === 0 ? (
        <div className="card">
          <EmptyState title="لا توجد فروع" description="أضف أول فرع لمطعمك للبدء." icon={Store} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {branches.map((b) => (
            <BranchCard key={b.id} branch={b} onEdit={openEdit} onDelete={setToDelete} />
          ))}
        </div>
      )}

      <BranchForm open={formOpen} initial={editing} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} />

      <ConfirmDialog
        open={!!toDelete}
        title="حذف الفرع"
        message={`سيتم حذف «${toDelete?.name}» نهائياً.`}
        onConfirm={() => {
          if (toDelete) deleteBranch(toDelete.id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-56 animate-pulse bg-slate-50" />
      ))}
    </div>
  );
}
