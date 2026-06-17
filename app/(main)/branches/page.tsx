"use client";

// ============================================================================
// MaitreAI — Phase 1 Step 2: unified Branches + Delivery Zones management.
// One operator screen (reached from Settings) to manage branches and, under each
// branch, its delivery zones. Reuses BranchCard / BranchForm / DeliveryAreaForm
// and the existing store actions + tenant currency. Role-gated (operation =
// read-only, per PR #12). Restaurant-wide zones (no branch) get their own group.
// ============================================================================

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BranchCard } from "@/components/ui/BranchCard";
import { BranchForm, type BranchFormValues } from "@/components/branches/BranchForm";
import { DeliveryAreaForm, type DeliveryAreaFormValues } from "@/components/restaurant-brain/DeliveryAreaForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useRole } from "@/lib/use-role";
import { formatCurrency, cn } from "@/lib/utils";
import type { Branch, DeliveryArea } from "@/lib/types";
import { Store, Plus, Truck, Pencil, Trash2 } from "lucide-react";

export default function BranchesPage() {
  const hydrated = useHasHydrated();
  const canManage = useRole() === "manager";
  const store = useRestaurantStore();
  const branches = store.branches;
  const deliveryAreas = store.deliveryAreas;
  const currency = store.profile.currency;

  // Branch form state
  const [branchForm, setBranchForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);

  // Zone form state (defaultBranch pre-selects the branch when adding under one)
  const [zoneForm, setZoneForm] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryArea | null>(null);
  const [zoneDefaultBranch, setZoneDefaultBranch] = useState("");
  const [zoneToDelete, setZoneToDelete] = useState<DeliveryArea | null>(null);

  const branchIds = useMemo(() => new Set(branches.map((b) => b.id)), [branches]);
  const zonesFor = (branchId: string) => deliveryAreas.filter((z) => z.branchId === branchId);
  // Restaurant-wide = no branch, or a branch that no longer exists (don't lose them).
  const restaurantWideZones = deliveryAreas.filter((z) => !z.branchId || !branchIds.has(z.branchId));

  // --- branch handlers ---
  const openCreateBranch = () => { setEditingBranch(null); setBranchForm(true); };
  const openEditBranch = (b: Branch) => { setEditingBranch(b); setBranchForm(true); };
  const submitBranch = (values: BranchFormValues) => {
    if (editingBranch) store.updateBranch(editingBranch.id, values);
    else store.addBranch({ ...values, whatsappConnected: !!values.whatsappNumber });
    setBranchForm(false);
  };

  // --- zone handlers ---
  const openAddZone = (branchId: string) => { setEditingZone(null); setZoneDefaultBranch(branchId); setZoneForm(true); };
  const openEditZone = (z: DeliveryArea) => { setEditingZone(z); setZoneForm(true); };
  const submitZone = (values: DeliveryAreaFormValues) => {
    if (editingZone) store.updateDeliveryArea(editingZone.id, values);
    else store.addDeliveryArea(values);
    setZoneForm(false);
  };

  return (
    <div>
      <PageHeader
        title="الفروع ومناطق التوصيل"
        subtitle="إدارة الفروع ومناطق التوصيل الخاصة بكل فرع"
        icon={Store}
        accentBg="bg-branches"
        actions={
          canManage ? (
            <button
              onClick={openCreateBranch}
              className="inline-flex items-center gap-1.5 rounded-xl bg-branches px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> فرع جديد
            </button>
          ) : undefined
        }
      />

      {!hydrated ? (
        <SkeletonGrid />
      ) : (
        <div className="space-y-6">
          {branches.length === 0 ? (
            <div className="card">
              <EmptyState
                title="لا توجد فروع"
                description="أضف أول فرع لمطعمك ثم اربط مناطق التوصيل به."
                icon={Store}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {branches.map((b) => (
                <div key={b.id} className="space-y-3">
                  <BranchCard
                    branch={b}
                    onEdit={canManage ? openEditBranch : undefined}
                    onDelete={canManage ? setBranchToDelete : undefined}
                  />
                  <ZonePanel
                    title="مناطق التوصيل"
                    zones={zonesFor(b.id)}
                    currency={currency}
                    canManage={canManage}
                    onAdd={() => openAddZone(b.id)}
                    onEdit={openEditZone}
                    onDelete={setZoneToDelete}
                    emptyText="لا توجد مناطق توصيل لهذا الفرع بعد."
                  />
                </div>
              ))}
            </div>
          )}

          {/* Restaurant-wide zones — kept visible so they're never lost */}
          {(restaurantWideZones.length > 0 || canManage) && (
            <ZonePanel
              title="مناطق لكل الفروع"
              subtitle="مناطق غير مرتبطة بفرع محدّد"
              zones={restaurantWideZones}
              currency={currency}
              canManage={canManage}
              onAdd={() => openAddZone("")}
              onEdit={openEditZone}
              onDelete={setZoneToDelete}
              emptyText="لا توجد مناطق عامة."
            />
          )}
        </div>
      )}

      {/* Forms + dialogs (reused) */}
      <BranchForm open={branchForm} initial={editingBranch} onClose={() => setBranchForm(false)} onSubmit={submitBranch} />
      <DeliveryAreaForm
        open={zoneForm}
        initial={editingZone}
        branches={branches}
        currency={currency}
        defaultBranchId={zoneDefaultBranch}
        onClose={() => setZoneForm(false)}
        onSubmit={submitZone}
      />

      <ConfirmDialog
        open={!!branchToDelete}
        title="حذف الفرع"
        message={`سيتم حذف «${branchToDelete?.name}» نهائياً.`}
        onConfirm={() => {
          if (branchToDelete) store.deleteBranch(branchToDelete.id);
          setBranchToDelete(null);
        }}
        onCancel={() => setBranchToDelete(null)}
      />
      <ConfirmDialog
        open={!!zoneToDelete}
        title="حذف منطقة التوصيل"
        message={`سيتم حذف «${zoneToDelete?.name}».`}
        onConfirm={() => {
          if (zoneToDelete) store.deleteDeliveryArea(zoneToDelete.id);
          setZoneToDelete(null);
        }}
        onCancel={() => setZoneToDelete(null)}
      />
    </div>
  );
}

function ZonePanel({
  title,
  subtitle,
  zones,
  currency,
  canManage,
  onAdd,
  onEdit,
  onDelete,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  zones: DeliveryArea[];
  currency: string;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (z: DeliveryArea) => void;
  onDelete: (z: DeliveryArea) => void;
  emptyText: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Truck className="h-4 w-4 text-brain" /> {title}
            <span className="rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-500">{zones.length}</span>
          </p>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {canManage && (
          <button
            onClick={onAdd}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brain px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> منطقة جديدة
          </button>
        )}
      </div>

      {zones.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {zones.map((z) => (
            <li
              key={z.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-slate-800">{z.name}</span>
                  <ActiveBadge active={z.active} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  رسوم {formatCurrency(z.deliveryFee, currency)} · حد أدنى {formatCurrency(z.minOrder, currency)}
                  {z.estimatedTime ? ` · ${z.estimatedTime}` : ""}
                </p>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => onEdit(z)}
                    aria-label="تعديل"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brain"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDelete(z)}
                    aria-label="حذف"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold",
        active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
      )}
    >
      {active ? "مفعّلة" : "متوقفة"}
    </span>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="card h-80 animate-pulse bg-slate-50" />
      ))}
    </div>
  );
}
