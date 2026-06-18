// ============================================================================
// MaitreAI — Public storefront (Phase 3 + Wesaya brand rebuild, PR-A).
// Public, no-login page at /order/[slug]. Server component: resolves the slug →
// restaurant_id with the SERVICE-ROLE client (server-only) and loads the priced
// menu via the existing loadBrain() loader — no new menu query. It hands the
// loaded menu (items + photos + variants + choice groups + modifiers) to the
// StorefrontMenu CLIENT component, which renders the branded home + menu and owns
// the customizer + cart + checkout. Cache-disabled so operator edits show live.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrain } from "@/lib/db/brain";
import { StorefrontMenu } from "@/components/storefront/StorefrontMenu";
import { UtensilsCrossed } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function StorefrontMenuPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? "").trim();
  const admin = createAdminClient();
  if (!admin || !slug) return <NotFound />;

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id")
    .ilike("slug", slug)
    .maybeSingle();
  if (!restaurant) return <NotFound />;

  const brain = await loadBrain(admin, restaurant.id as string);
  const currency = brain.profile.currency || "ج.م";
  const availableItems = brain.menuItems.filter((i) => i.available);

  return (
    <>
      {/* Storefront type — Cairo (body) + Baloo Bhaijaan 2 (headings/brand). Scoped
          to this public route; the operator app keeps its own font. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@500;600;700;800&family=Cairo:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <main className="min-h-screen bg-wesaya-cream font-cairo text-wesaya-ink">
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
    </>
  );
}

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-wesaya-cream px-4">
      <div className="w-full max-w-md rounded-2xl border border-wesaya-line bg-white p-10 text-center shadow-sm">
        <UtensilsCrossed className="mx-auto h-9 w-9 text-wesaya-red/40" />
        <h1 className="mt-4 text-lg font-bold text-wesaya-ink">المتجر غير موجود</h1>
        <p className="mt-2 text-sm text-wesaya-muted">تعذّر العثور على هذا المطعم. تأكد من صحة الرابط.</p>
      </div>
    </main>
  );
}
