"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PromotionCard } from "@/components/ui/PromotionCard";
import type { OperatorPromotion } from "@/lib/types";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useRole } from "@/lib/use-role";
import { Megaphone, Plus } from "lucide-react";

export default function PromotionsPage() {
  const hydrated = useHasHydrated();
  const role = useRole();
  const canManage = role === "manager";
  const dbReady = useRestaurantStore((s) => s.dbReady);
  const promotions = useRestaurantStore((s) => s.promotions);
  const currency = useRestaurantStore((s) => s.profile.currency);
  const togglePromotionActive = useRestaurantStore((s) => s.togglePromotionActive);
  const deletePromotion = useRestaurantStore((s) => s.deletePromotion);
  const [pendingDelete, setPendingDelete] = useState<OperatorPromotion | null>(null);
  const ready = hydrated && (dbReady || !isSupabaseConfigured());

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deletePromotion(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <div>
      <PageHeader
        title="العروض"
        subtitle="إدارة العروض والخصومات الترويجية"
        icon={Megaphone}
        accentBg="bg-promotions"
        actions={
          canManage ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl bg-promotions px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> عرض جديد
            </Link>
          ) : undefined
        }
      />

      {!ready ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-48 animate-pulse bg-white p-5">
              <div className="h-12 w-12 rounded-xl bg-slate-100" />
              <div className="mt-4 h-4 w-2/3 rounded bg-slate-100" />
              <div className="mt-3 h-3 w-full rounded bg-slate-100" />
              <div className="mt-2 h-3 w-4/5 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : promotions.length === 0 ? (
        <EmptyState
          title="لا توجد عروض حتى الآن"
          description="أنشئ عرضاً من محادثة المساعد، وسيظهر هنا للإيقاف أو الحذف."
          icon={Megaphone}
          className="card"
          action={
            canManage ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-xl bg-promotions px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> ابدأ من المساعد
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {promotions.map((promo) => (
            <PromotionCard
              key={promo.id}
              promo={promo}
              currency={currency}
              canManage={canManage}
              onToggle={(_, active) => togglePromotionActive(promo.id, active)}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف العرض؟"
        message={pendingDelete ? `سيتم حذف "${pendingDelete.name}" نهائياً من هذا المطعم.` : ""}
        confirmLabel="حذف العرض"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
