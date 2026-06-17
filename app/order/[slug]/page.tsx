// ============================================================================
// MaitreAI — Public storefront: menu browse (Phase 3 Step 1, READ-ONLY).
// A public, no-login page at /order/[slug]. Server component: it resolves the
// slug → restaurant_id with the SERVICE-ROLE client (server-only; the secret is
// never shipped to the browser) and loads the priced menu via the existing
// loadBrain() loader — no new menu query. All prices come straight from the DB;
// nothing is computed here. No cart / totals yet (that's a later step).
// Multi-tenant safe: loadBrain scopes every read to the resolved restaurant_id.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrain } from "@/lib/db/brain";
import { formatCurrency } from "@/lib/utils";
import type { MenuItem } from "@/lib/types";
import { UtensilsCrossed, Store } from "lucide-react";

// Always render at request time with fresh menu data (availability/prices live).
export const dynamic = "force-dynamic";

export default async function StorefrontMenuPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? "").trim();
  const admin = createAdminClient();
  if (!admin || !slug) return <NotFound />;

  // Resolve the tenant by case-insensitive slug (unique on lower(slug)).
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id")
    .ilike("slug", slug)
    .maybeSingle();
  if (!restaurant) return <NotFound />;

  // Reuse the existing loader — returns the full priced menu (items + variants +
  // choice groups + modifiers), scoped to this restaurant.
  const brain = await loadBrain(admin, restaurant.id as string);
  const currency = brain.profile.currency || "ج.م";
  const availableItems = brain.menuItems.filter((i) => i.available);

  // Group by category, preserving first-appearance order (loadBrain returns items
  // in category/insertion order).
  const categoryOrder: string[] = [];
  const itemsByCategory = new Map<string, MenuItem[]>();
  for (const item of availableItems) {
    const cat = item.category || "أخرى";
    if (!itemsByCategory.has(cat)) {
      itemsByCategory.set(cat, []);
      categoryOrder.push(cat);
    }
    itemsByCategory.get(cat)!.push(item);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Store className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{brain.profile.name}</h1>
            <p className="text-sm text-slate-500">قائمة الطعام · الأسعار بـ {currency}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {categoryOrder.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <UtensilsCrossed className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">لا توجد أصناف متاحة حالياً.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {categoryOrder.map((cat) => (
              <section key={cat}>
                <h2 className="mb-3 text-lg font-bold text-slate-800">{cat}</h2>
                <ul className="space-y-3">
                  {itemsByCategory.get(cat)!.map((item) => (
                    <MenuItemRow key={item.id} item={item} currency={currency} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-slate-400">
          هذه القائمة للعرض فقط — سيتوفّر الطلب قريباً.
        </p>
      </div>
    </main>
  );
}

function MenuItemRow({ item, currency }: { item: MenuItem; currency: string }) {
  const variants = (item.variants ?? []).filter((v) => v.active);
  const hasChoices = (item.choiceGroups ?? []).length > 0;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900">{item.name}</h3>
          {item.description && <p className="mt-1 text-sm text-slate-500">{item.description}</p>}
          {hasChoices && (
            <p className="mt-1 text-xs font-medium text-amber-700">يحتوي على اختيارات تُحدَّد عند الطلب</p>
          )}
        </div>
        {/* Single base price (items without size variants). */}
        {variants.length === 0 && (
          <span className="shrink-0 whitespace-nowrap font-bold text-slate-900">
            {formatCurrency(item.price, currency)}
          </span>
        )}
      </div>

      {/* Per-size prices (variants) — shown straight from the DB, never computed. */}
      {variants.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {variants.map((v) => (
            <span
              key={v.id}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
            >
              {v.name} · {formatCurrency(v.price, currency)}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <UtensilsCrossed className="mx-auto h-9 w-9 text-slate-300" />
        <h1 className="mt-4 text-lg font-bold text-slate-800">المتجر غير موجود</h1>
        <p className="mt-2 text-sm text-slate-500">تعذّر العثور على هذا المطعم. تأكد من صحة الرابط.</p>
      </div>
    </main>
  );
}
