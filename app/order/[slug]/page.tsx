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
import { UtensilsCrossed, MapPin, Drumstick, Pizza, Beef, Sandwich, Soup } from "lucide-react";

// Always render at request time with fresh data so operator edits (deleted
// branches, toggled zones, prices, availability) reflect IMMEDIATELY for
// customers. force-dynamic + revalidate=0 + force-no-store together disable the
// route cache AND the data cache for the service-role reads in loadBrain — no
// stale pre-edit render can be served.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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
  const areaNames = brain.deliveryAreas.filter((z) => z.active).map((z) => z.name);
  const deliveryChip =
    areaNames.length > 0
      ? `التوصيل إلى ${areaNames.slice(0, 2).join("، ")}${areaNames.length > 2 ? " وغيرها" : ""}`
      : null;

  return (
    <main className="min-h-screen bg-wesaya-cream">
      {/* Brand hero */}
      <header className="bg-wesaya-red text-white">
        <div className="mx-auto max-w-3xl px-4 pb-5 pt-7 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-wesaya-yellow drop-shadow-sm">
            {brain.profile.name}
          </h1>
          <p className="mt-1 text-sm font-medium text-white/85">دجاج مقلي · ساندوتشات · وجبات سريعة</p>

          {/* Food-icon strip echoing the logo (inline icons, no external images) */}
          <div className="mt-4 flex items-center justify-center gap-2.5 text-wesaya-yellow">
            {[Drumstick, Pizza, Beef, Sandwich, Soup].map((Icon, i) => (
              <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full bg-wesaya-red-dark/60 ring-1 ring-white/15">
                <Icon className="h-5 w-5" />
              </span>
            ))}
          </div>

          {deliveryChip && (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20">
              <MapPin className="h-3.5 w-3.5" /> {deliveryChip}
            </span>
          )}
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
    <main className="flex min-h-screen items-center justify-center bg-wesaya-cream px-4">
      <div className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-10 text-center shadow-sm">
        <UtensilsCrossed className="mx-auto h-9 w-9 text-wesaya-red/40" />
        <h1 className="mt-4 text-lg font-bold text-wesaya-ink">المتجر غير موجود</h1>
        <p className="mt-2 text-sm text-slate-500">تعذّر العثور على هذا المطعم. تأكد من صحة الرابط.</p>
      </div>
    </main>
  );
}
