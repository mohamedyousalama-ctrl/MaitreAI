// ============================================================================
// MaitreAI — Public storefront: menu + customizer + cart (Phase 3 Step 1→2).
// A public, no-login page at /order/[slug]. Server component: resolves the slug →
// restaurant_id with the SERVICE-ROLE client (server-only; the secret never
// reaches the browser) and loads the priced menu via the existing loadBrain()
// loader — no new menu query. It hands the loaded menu (items + variants + choice
// groups + modifiers) + tenant currency to the StorefrontMenu CLIENT component,
// which owns the item customizer and the in-memory cart. All prices come from the
// loaded DB data; the cart total is a PREVIEW only (authoritative recompute is a
// later step). Multi-tenant safe: loadBrain scopes every read to this tenant.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrain } from "@/lib/db/brain";
import { StorefrontMenu } from "@/components/storefront/StorefrontMenu";
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

      <StorefrontMenu
        slug={slug}
        restaurantName={brain.profile.name}
        currency={currency}
        items={availableItems}
        modifiers={brain.modifiers}
        branches={brain.branches.filter((b) => b.open)}
        deliveryAreas={brain.deliveryAreas.filter((z) => z.active)}
      />
    </main>
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
