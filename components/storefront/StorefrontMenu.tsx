"use client";

// ============================================================================
// MaitreAI — Storefront menu + in-memory cart (Phase 3 Step 2). Public, no auth.
// Holds the cart in React state only (no DB, no login, no localStorage — clears
// on refresh). Cart lines store SELECTIONS BY ID; browser totals are a PREVIEW
// only; checkout submits ids to the server for authoritative recompute.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Branch, DeliveryArea, MenuItem, Modifier } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { UtensilsCrossed, X, ShoppingBag, MapPin, ChevronLeft } from "lucide-react";
import { ItemCustomizer } from "./ItemCustomizer";
import {
  activeVariants,
  cartSubtotal,
  lineTotal,
  selectionSummary,
  type CartLine,
} from "./pricing";

// Client-only: react-leaflet breaks on the server, so the map is never SSR'd.
const LocationPicker = dynamic(() => import("./LocationPicker"), { ssr: false });

// Per-tenant desktop hero headline override (a dedicated domain shows its own
// line; everyone else falls back to the restaurant name). Easily replaceable by
// a future per-restaurant "hero tagline" field. "\n" splits the headline lines.
const HERO_TAGLINES: Record<string, string> = {
  wesaya: "ألذّ دجاج مقلي\nوبيتزا في الهرم",
};

// Shared checkout field styling (brand: white, soft line border, red focus).
const inputCls =
  "w-full rounded-[13px] border-[1.5px] border-wesaya-line bg-white px-3.5 py-3 text-sm text-wesaya-ink outline-none transition focus:border-wesaya-red/50";

export function StorefrontMenu({
  slug,
  restaurantName,
  currency,
  items,
  modifiers,
  branches,
  deliveryAreas,
}: {
  slug: string;
  restaurantName: string;
  currency: string;
  items: MenuItem[];
  modifiers: Modifier[];
  branches: Branch[];
  deliveryAreas: DeliveryArea[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "checkout">("cart"); // presentational step within the drawer
  const [branchOpen, setBranchOpen] = useState(false);
  const [activeCat, setActiveCat] = useState("all"); // category-pill filter (presentational)
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  // Auto-select a branch that actually has usable delivery zones (restaurant-wide
  // or its own), so a stray/zoneless branch can never be pre-selected and strand
  // the delivery fee. Falls back to the first branch (e.g. pickup-only setups).
  const [branchId, setBranchId] = useState(() => {
    const withZones = branches.find((b) => deliveryAreas.some((z) => !z.branchId || z.branchId === b.id));
    return (withZones ?? branches[0])?.id ?? "";
  });
  const [zoneId, setZoneId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [confirmation, setConfirmation] = useState<{
    orderNumber: string;
    subtotal: number;
    deliveryFee: number;
    total: number;
    currency: string;
  } | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Group by category (first-appearance order).
  const categories = useMemo(() => {
    const order: string[] = [];
    const byCat = new Map<string, MenuItem[]>();
    for (const item of items) {
      const cat = item.category || "أخرى";
      if (!byCat.has(cat)) {
        byCat.set(cat, []);
        order.push(cat);
      }
      byCat.get(cat)!.push(item);
    }
    return order.map((c) => ({ name: c, items: byCat.get(c)! }));
  }, [items]);

  // Home leads with offers + family boxes (Wesaya's strength).
  const offers = useMemo(() => items.filter((i) => /عرض|عروض/.test(i.category)), [items]);
  const familyBoxes = useMemo(() => items.filter((i) => /عائلي/.test(i.category)), [items]);
  const featured = useMemo(
    () =>
      familyBoxes.find((i) => i.imageUrl) ??
      offers.find((i) => i.imageUrl) ??
      items.find((i) => i.imageUrl) ??
      null,
    [familyBoxes, offers, items]
  );
  const branchName = useMemo(
    () => branches.find((b) => b.id === branchId)?.name ?? branches[0]?.name ?? "اختر الفرع",
    [branches, branchId]
  );

  // Desktop hero headline. Per-tenant override map so a dedicated domain can show
  // its own line; other tenants fall back to their name. A future per-restaurant
  // "hero tagline" field can replace this map. Wesaya (order.wesayachicken.com).
  const heroHeadline = HERO_TAGLINES[slug.toLowerCase()] ?? restaurantName;

  // A line whose price is "حسب الاختيار" (no variants, base 0) → checkout note.
  const hasNoBaseItem = useMemo(
    () => cart.some((l) => { const it = itemById.get(l.itemId); return it ? activeVariants(it).length === 0 && it.price === 0 : false; }),
    [cart, itemById]
  );

  const subtotal = cartSubtotal(cart, itemById, modifiers);
  const zonesForBranch = useMemo(
    () => deliveryAreas.filter((z) => !z.branchId || z.branchId === branchId),
    [branchId, deliveryAreas]
  );
  const selectedZone = zonesForBranch.find((z) => z.id === zoneId) ?? null;
  const deliveryFee = fulfillment === "delivery" ? selectedZone?.deliveryFee ?? 0 : 0;
  const previewTotal = subtotal + deliveryFee;
  const count = cart.reduce((n, l) => n + l.quantity, 0);

  // Keep the chosen zone valid for the active branch, and auto-select when there's
  // exactly one — so the (single-zone) delivery fee applies without a stray empty
  // dropdown. A previously-chosen zone that no longer belongs to the branch resets.
  useEffect(() => {
    if (zoneId && zonesForBranch.some((z) => z.id === zoneId)) return;
    setZoneId(zonesForBranch.length === 1 ? zonesForBranch[0].id : "");
  }, [zonesForBranch, zoneId]);

  // Quick-nav: filter to a category and scroll the menu list into view.
  const goCategory = (cat: string) => {
    setActiveCat(cat);
    requestAnimationFrame(() => document.getElementById("storefront-menu")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const addLine = (line: CartLine) => {
    setCart((c) => [...c, line]);
    setOpenItem(null);
  };
  const setQty = (lineId: string, q: number) =>
    setCart((c) => c.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.max(1, q) } : l)));
  const removeLine = (lineId: string) => setCart((c) => c.filter((l) => l.lineId !== lineId));
  const openCart = () => { setCheckoutStep("cart"); setCartOpen(true); };
  const closeCart = () => { setCartOpen(false); setCheckoutStep("cart"); if (confirmation) setConfirmation(null); };
  const orderAgain = () => { setConfirmation(null); setCheckoutStep("cart"); setCartOpen(false); };
  const canConfirm =
    !submitting &&
    !!customerName.trim() &&
    !!customerPhone.trim() &&
    !!branchId &&
    !(fulfillment === "delivery" && (!zoneId || !address.trim())) &&
    cart.length > 0;
  const submitOrder = async () => {
    setCheckoutError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          lines: cart.map(({ itemId, variantId, optionIds, modifierIds, quantity }) => ({
            itemId,
            variantId,
            optionIds,
            modifierIds,
            quantity,
          })),
          fulfillment,
          branchId,
          zoneId: fulfillment === "delivery" ? zoneId : null,
          customerName,
          customerPhone,
          address: fulfillment === "delivery" ? address : "",
          notes,
        }),
      });
      const data = (await res.json()) as { error?: string } & NonNullable<typeof confirmation>;
      if (!res.ok) throw new Error(data.error || "تعذر إنشاء الطلب.");
      setConfirmation(data);
      setCart([]);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "تعذر إنشاء الطلب.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* ===== Top bar: brand + status + branch (mobile & desktop) ===== */}
      <header className="sticky top-0 z-30 border-b border-wesaya-line bg-wesaya-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-gradient-to-br from-wesaya-red to-wesaya-red-dark shadow-[0_6px_16px_rgba(214,35,0,0.32)]">
              <span className="font-baloo text-[22px] font-extrabold leading-none text-white">{restaurantName.trim().charAt(0) || "و"}</span>
            </span>
            <div>
              <div className="font-baloo text-xl font-extrabold leading-none text-wesaya-ink">{restaurantName}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-[7px] w-[7px] rounded-full bg-wesaya-green shadow-[0_0_0_3px_rgba(30,138,82,0.18)]" />
                <span className="text-[11.5px] font-bold text-wesaya-green">مفتوح الآن · ٢٤ ساعة</span>
              </div>
            </div>
          </div>

          {/* Desktop category quick-links */}
          <nav className="hidden items-center gap-5 lg:flex">
            {categories.map((c) => (
              <button
                key={c.name}
                onClick={() => goCategory(c.name)}
                className="whitespace-nowrap text-sm font-semibold text-wesaya-ink transition hover:text-wesaya-red"
              >
                {c.name}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Desktop delivery/pickup + cart */}
            <div className="hidden lg:block">
              <FulfillmentToggle fulfillment={fulfillment} setFulfillment={setFulfillment} />
            </div>
            <button
              onClick={() => count > 0 && openCart()}
              className="relative hidden h-11 w-11 items-center justify-center rounded-[13px] bg-wesaya-ink text-lg text-white lg:flex"
              aria-label="السلة"
            >
              <ShoppingBag className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-wesaya-red px-1 text-[11px] font-extrabold text-white">
                  {count}
                </span>
              )}
            </button>
            {/* Branch chip */}
            <button
              onClick={() => setBranchOpen(true)}
              className="flex items-center gap-1.5 rounded-[13px] border border-wesaya-line bg-white px-2.5 py-2 shadow-sm"
            >
              <MapPin className="h-4 w-4 text-wesaya-red" />
              <span className="max-w-[120px] truncate text-[12.5px] font-bold text-wesaya-ink">{branchName}</span>
              {branches.length > 1 && <span className="text-[11px] text-wesaya-muted">⌄</span>}
            </button>
          </div>
        </div>
      </header>

      {/* ===== Mobile delivery/pickup toggle ===== */}
      <div className="mx-auto max-w-6xl px-4 pt-4 lg:hidden">
        <FulfillmentToggle fulfillment={fulfillment} setFulfillment={setFulfillment} />
      </div>

      {/* ===== Desktop red hero ===== */}
      <div className="mx-auto hidden max-w-6xl px-8 pt-5 lg:block">
        <div className="flex items-center gap-7 rounded-[26px] bg-gradient-to-bl from-wesaya-red to-wesaya-red-dark px-11 py-10 text-white shadow-[0_16px_40px_rgba(214,35,0,0.26)]">
          <div className="flex-1">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-[10px] bg-white/[0.18] px-3.5 py-1.5 text-[12.5px] font-bold">
              ⭐ الأكثر طلبًا — الوجبات العائلية
            </span>
            <h1 className="whitespace-pre-line font-baloo text-[42px] font-extrabold leading-[1.15]">{heroHeadline}</h1>
            <p className="mt-3 max-w-[420px] text-[15px] leading-relaxed opacity-90">
              عائلتك تستاهل الأحسن — عروض وصناديق عائلية مميّزة، توصيل سريع أو استلام من الفرع.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => offers[0] && goCategory(offers[0].category)}
                className="rounded-[14px] bg-white px-7 py-3.5 font-baloo text-base font-bold text-wesaya-red shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
              >
                اطلب الآن
              </button>
              <button className="rounded-[14px] border-[1.5px] border-white/45 bg-white/[0.16] px-6 py-3.5 font-baloo text-base font-bold text-white">
                مواقعنا
              </button>
            </div>
          </div>
          {featured && (
            <div className="relative h-[260px] w-[300px] flex-none overflow-hidden rounded-[22px] bg-black/10 shadow-[0_18px_40px_rgba(0,0,0,0.3)]">
              <Photo src={featured.imageUrl} alt={featured.name} category={featured.category} className="h-full w-full" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 text-white">
                <div className="font-baloo text-lg font-bold">{featured.name}</div>
                <div className="mt-0.5 text-[13px] opacity-90">{priceLabel(featured, currency)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Content ===== */}
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 lg:px-8">
        {categories.length === 0 ? (
          <div className="rounded-2xl border border-wesaya-line bg-white p-10 text-center shadow-sm">
            <UtensilsCrossed className="mx-auto h-8 w-8 text-wesaya-red/40" />
            <p className="mt-3 text-sm text-wesaya-muted">لا توجد أصناف متاحة حالياً.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* العروض */}
            {offers.length > 0 && (
              <section>
                <h2 className="mb-4 font-baloo text-xl font-extrabold text-wesaya-ink lg:text-[23px]">🔥 العروض</h2>
                <div className="flex gap-3.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-3 lg:gap-[18px] lg:overflow-visible">
                  {offers.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setOpenItem(item)}
                      className="relative w-[236px] flex-none overflow-hidden rounded-[22px] bg-white text-start shadow-[0_10px_26px_rgba(38,25,15,0.12)] transition hover:-translate-y-1 lg:w-auto"
                    >
                      <span className="absolute right-0 top-3 z-[2] rounded-bl-xl bg-wesaya-gold px-3 py-1.5 font-baloo text-[11px] font-extrabold text-[#3a2400] shadow-[0_3px_8px_rgba(0,0,0,0.12)]">
                        عرض مميّز
                      </span>
                      <div className="relative h-40 overflow-hidden bg-wesaya-line">
                        <Photo src={item.imageUrl} alt={item.name} category={item.category} className="h-full w-full" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent to-[55%]" />
                      </div>
                      <div className="p-3.5">
                        <div className="font-baloo text-[17px] font-bold text-wesaya-ink">{item.name}</div>
                        {item.description && (
                          <p className="mt-1 line-clamp-2 h-9 text-xs leading-relaxed text-wesaya-muted">{item.description}</p>
                        )}
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="rounded-[9px] bg-wesaya-tint px-3 py-1.5 text-[12.5px] font-bold text-wesaya-red">{priceLabel(item, currency)}</span>
                          <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-wesaya-red text-xl font-bold text-white shadow-[0_5px_12px_rgba(214,35,0,0.32)]">＋</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* الوجبات العائلية */}
            {familyBoxes.length > 0 && (
              <section>
                <h2 className="mb-4 font-baloo text-xl font-extrabold text-wesaya-ink lg:text-[23px]">👨‍👩‍👧‍👦 الوجبات العائلية</h2>
                <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-[18px]">
                  {familyBoxes.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setOpenItem(item)}
                      className="flex w-full overflow-hidden rounded-[22px] border-[1.5px] border-wesaya-line bg-white text-start shadow-[0_6px_18px_rgba(38,25,15,0.08)]"
                    >
                      <div className="w-32 flex-none overflow-hidden bg-wesaya-line">
                        <Photo src={item.imageUrl} alt={item.name} category={item.category} className="h-full min-h-[128px] w-full" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
                        <span className="self-start rounded-[7px] bg-[#FBEFD9] px-2.5 py-0.5 font-baloo text-[10.5px] font-extrabold text-[#946400]">صندوق عائلي</span>
                        <div className="font-baloo text-[17px] font-bold text-wesaya-ink">{item.name}</div>
                        {item.description && <p className="line-clamp-2 text-[11.5px] leading-relaxed text-wesaya-muted">{item.description}</p>}
                        <div className="mt-auto flex items-center justify-between pt-1">
                          <span className="font-baloo text-[15px] font-extrabold text-wesaya-red">{priceLabel(item, currency)}</span>
                          <span className="rounded-[10px] bg-wesaya-red px-3.5 py-1.5 text-[12.5px] font-bold text-white">خصّص</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* تصفّح القائمة — category quick-nav */}
            <section>
              <h2 className="mb-3 font-baloo text-lg font-extrabold text-wesaya-ink">تصفّح القائمة</h2>
              <div className="flex gap-2.5 overflow-x-auto pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <CatPill active={activeCat === "all"} onClick={() => setActiveCat("all")} emoji="🍽️" label="الكل" />
                {categories.map((c) => (
                  <CatPill key={c.name} active={activeCat === c.name} onClick={() => setActiveCat(c.name)} emoji={catEmoji(c.name)} label={c.name} />
                ))}
              </div>
            </section>

            {/* Menu — branded photo cards, grouped by category */}
            <div id="storefront-menu" className="space-y-9">
              {(activeCat === "all" ? categories : categories.filter((c) => c.name === activeCat)).map((cat) => (
                <section key={cat.name} id={`cat-${cat.name}`} className="scroll-mt-24">
                  <h3 className="mb-3 flex items-center gap-2 font-baloo text-[17px] font-extrabold text-wesaya-ink">
                    <span className="h-5 w-1.5 rounded-full bg-wesaya-red" />
                    {cat.name}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {cat.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setOpenItem(item)}
                        className="flex w-full items-center gap-3 rounded-[18px] border border-wesaya-line bg-white p-3 text-start shadow-[0_3px_11px_rgba(38,25,15,0.06)] transition hover:border-wesaya-red/40 hover:shadow-md"
                      >
                        <div className="h-[88px] w-[88px] flex-none overflow-hidden rounded-[14px] bg-wesaya-line">
                          <Photo src={item.imageUrl} alt={item.name} category={item.category} className="h-full w-full" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="font-baloo text-base font-bold text-wesaya-ink">{item.name}</div>
                          {item.description && <p className="line-clamp-2 max-h-9 text-xs leading-relaxed text-wesaya-muted">{item.description}</p>}
                          <div className="mt-0.5 flex items-center justify-between">
                            <span className="text-sm font-extrabold text-wesaya-red">{priceLabel(item, currency)}</span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-wesaya-red text-lg text-white shadow-[0_4px_10px_rgba(214,35,0,0.28)]">＋</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        <p className="mt-10 text-center text-xs text-wesaya-muted">
          الأسعار من القائمة — تُحتسب القيمة النهائية عند الدفع.
        </p>
      </div>

      {/* Branch selector (simple) */}
      {branchOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBranchOpen(false)} />
          <div className="relative w-full max-w-sm rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-baloo text-lg font-extrabold text-wesaya-ink">اختر الفرع</h2>
              <button onClick={() => setBranchOpen(false)} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-lg text-wesaya-muted hover:bg-wesaya-tint">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2">
              {branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setBranchId(b.id);
                    setZoneId("");
                    setBranchOpen(false);
                  }}
                  className={
                    "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-start " +
                    (b.id === branchId ? "border-wesaya-red bg-wesaya-tint" : "border-wesaya-line bg-white hover:bg-wesaya-tint")
                  }
                >
                  <MapPin className="h-4 w-4 text-wesaya-red" />
                  <span className="text-sm font-bold text-wesaya-ink">{b.name}</span>
                  <span className="mr-auto text-[11px] font-semibold text-wesaya-green">٢٤ ساعة</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sticky brand cart bar (mockup: ink button · red count · gold subtotal) */}
      {count > 0 && !cartOpen && !openItem && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-wesaya-line bg-wesaya-cream px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3">
          <button
            onClick={openCart}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl bg-wesaya-ink px-5 py-4 font-baloo text-base font-bold text-white shadow-[0_10px_24px_-8px_rgba(38,25,15,0.5)]"
          >
            <span className="flex items-center gap-2.5">
              <span className="rounded-[9px] bg-wesaya-red px-2.5 py-0.5 text-sm font-extrabold tabular-nums">{count}</span>
              <span>عرض السلة</span>
            </span>
            <span className="flex items-center gap-1 text-wesaya-gold">{formatCurrency(subtotal, currency)} ‹</span>
          </button>
        </div>
      )}

      {/* Customizer */}
      {openItem && (
        <ItemCustomizer item={openItem} modifiers={modifiers} currency={currency} onClose={() => setOpenItem(null)} onAdd={addLine} />
      )}

      {/* Cart / Checkout / Confirmation drawer (mockup ~278 / ~352 / ~427) */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={closeCart} />
          <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-wesaya-cream sm:rounded-2xl">
            {confirmation ? (
              /* ===== CONFIRMATION ===== */
              <div className="flex flex-col gap-[18px] overflow-y-auto px-[18px] pb-8 pt-2">
                <div className="flex flex-col items-center gap-3.5 px-2.5 pb-2 pt-10 text-center">
                  <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-wesaya-green text-white shadow-[0_12px_28px_rgba(30,138,82,0.32)] [animation:checkPop_.45s_ease_both]">
                    <span className="text-[42px] font-extrabold leading-none">✓</span>
                  </div>
                  <div className="font-baloo text-[23px] font-extrabold text-wesaya-ink">تم استلام طلبك!</div>
                  <div className="text-[13.5px] leading-relaxed text-wesaya-muted">شكرًا لطلبك من {restaurantName}. رقم طلبك</div>
                  <div className="font-baloo text-[26px] font-extrabold tracking-wide text-wesaya-red">#{confirmation.orderNumber}</div>
                </div>

                <div className="flex flex-col gap-2.5 rounded-[18px] border border-wesaya-line bg-white p-4">
                  <div className="font-baloo text-[15px] font-bold text-wesaya-ink">ملخّص الطلب</div>
                  <Row label="المجموع الفرعي" value={formatCurrency(confirmation.subtotal, confirmation.currency)} />
                  {confirmation.deliveryFee > 0 && (
                    <Row label="رسوم التوصيل" value={formatCurrency(confirmation.deliveryFee, confirmation.currency)} />
                  )}
                  <div className="h-px bg-wesaya-line" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-wesaya-ink">الإجمالي</span>
                    <span className="font-baloo text-base font-extrabold text-wesaya-red">{formatCurrency(confirmation.total, confirmation.currency)}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-[10px] bg-wesaya-cream px-3 py-2.5 text-xs text-wesaya-muted">
                    <span>🕒</span>
                    <span>{fulfillment === "delivery" ? "توصيل" : "استلام من الفرع"} · الدفع عند الاستلام — يُؤكَّد طلبك قريبًا على واتساب.</span>
                  </div>
                </div>

                <button onClick={orderAgain} className="rounded-2xl border-[1.5px] border-wesaya-line bg-white px-4 py-3.5 font-baloo text-[15px] font-bold text-wesaya-ink transition hover:border-wesaya-red/40">
                  اطلب مرة أخرى
                </button>
              </div>
            ) : checkoutStep === "cart" ? (
              /* ===== CART ===== */
              <>
                <DrawerHeader title="سلّتك" onBack={closeCart} />
                <div className="flex-1 overflow-y-auto px-[18px] pb-4">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center gap-3.5 px-8 py-20 text-center">
                      <div className="text-5xl">🛒</div>
                      <div className="font-baloo text-lg font-bold text-wesaya-ink">سلّتك فارغة</div>
                      <div className="text-[13px] leading-relaxed text-wesaya-muted">ابدأ بأحد عروضنا العائلية المميّزة</div>
                      <button onClick={closeCart} className="rounded-[14px] bg-wesaya-red px-6 py-3 font-baloo text-[15px] font-bold text-white">تصفّح القائمة</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 pt-3">
                      {cart.map((line) => {
                        const item = itemById.get(line.itemId);
                        if (!item) return null;
                        const opts = selectionSummary(item, line, modifiers);
                        return (
                          <div key={line.lineId} className="flex gap-3 rounded-[18px] border border-wesaya-line bg-white p-2.5 shadow-[0_3px_10px_rgba(38,25,15,0.05)]">
                            <div className="h-[74px] w-[74px] flex-none overflow-hidden rounded-[13px] bg-wesaya-line">
                              <Photo src={item.imageUrl} alt={item.name} category={item.category} className="h-full w-full" />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-baloo text-[15px] font-bold text-wesaya-ink">{item.name}</div>
                                <button onClick={() => removeLine(line.lineId)} aria-label="حذف" className="flex-none text-wesaya-muted transition hover:text-wesaya-red">
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                              {opts.length > 0 && <div className="truncate text-[11.5px] leading-relaxed text-wesaya-muted">{opts.join("، ")}</div>}
                              <div className="mt-1 flex items-center justify-between">
                                <div className="flex items-center overflow-hidden rounded-[11px] border border-wesaya-line bg-wesaya-cream">
                                  <button onClick={() => setQty(line.lineId, line.quantity - 1)} aria-label="إنقاص" className="flex h-8 w-8 items-center justify-center text-[18px] leading-none text-wesaya-red">−</button>
                                  <span className="min-w-[26px] text-center text-sm font-extrabold tabular-nums text-wesaya-ink">{line.quantity}</span>
                                  <button onClick={() => setQty(line.lineId, line.quantity + 1)} aria-label="زيادة" className="flex h-8 w-8 items-center justify-center text-[18px] leading-none text-wesaya-red">＋</button>
                                </div>
                                <span className="font-baloo text-[15px] font-extrabold text-wesaya-red">{formatCurrency(lineTotal(item, line, modifiers), currency)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* summary */}
                      <div className="mt-0.5 flex flex-col gap-2.5 rounded-[18px] border border-wesaya-line bg-white px-4 py-3.5">
                        <Row label="المجموع الفرعي" value={formatCurrency(subtotal, currency)} />
                        <div className="flex items-center justify-between text-[13.5px]">
                          <span className="text-wesaya-muted">رسوم التوصيل</span>
                          <span className="text-[12.5px] text-wesaya-muted">تُحسب حسب المنطقة</span>
                        </div>
                        {hasNoBaseItem && (
                          <div className="rounded-[9px] bg-[#FFF7E8] px-2.5 py-2 text-[11px] leading-relaxed text-[#8a6a16]">
                            بعض الأصناف يُؤكَّد سعرها الأساسي عند الطلب.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {cart.length > 0 && (
                  <div className="flex-none border-t border-wesaya-line bg-wesaya-cream px-[18px] py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <button
                      onClick={() => setCheckoutStep("checkout")}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-wesaya-red px-4 py-4 font-baloo text-base font-bold text-white shadow-[0_8px_20px_rgba(214,35,0,0.3)] transition hover:bg-wesaya-red-dark"
                    >
                      <span>متابعة الدفع</span><span>·</span><span>{formatCurrency(subtotal, currency)}</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* ===== CHECKOUT ===== */
              <>
                <DrawerHeader title="إتمام الطلب" onBack={() => setCheckoutStep("cart")} />
                <div className="flex-1 overflow-y-auto px-[18px] pb-4">
                  <div className="flex flex-col gap-4 pt-3">
                    {/* fulfillment recap */}
                    <div className="flex flex-col gap-3 rounded-[18px] border border-wesaya-line bg-white p-3.5">
                      <FulfillmentToggle fulfillment={fulfillment} setFulfillment={setFulfillment} />
                      <button onClick={() => branches.length > 1 && setBranchOpen(true)} className="flex items-center gap-2 text-[13px] text-wesaya-ink">
                        <MapPin className="h-4 w-4 text-wesaya-red" />
                        <span className="font-bold">{branchName}</span>
                        <span className="text-wesaya-muted">· ٢٤ ساعة</span>
                      </button>
                    </div>

                    {/* contact + fulfillment fields */}
                    <div className="flex flex-col gap-2.5">
                      <div className="font-baloo text-base font-bold text-wesaya-ink">بياناتك</div>
                      <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="الاسم" className={inputCls} />
                      <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="رقم الموبايل (واتساب)" inputMode="tel" className={inputCls} />

                      {fulfillment === "delivery" && (
                        <>
                          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputCls}>
                            <option value="">اختر منطقة التوصيل</option>
                            {zonesForBranch.map((zone) => (
                              <option key={zone.id} value={zone.id}>
                                {zone.name} · {formatCurrency(zone.deliveryFee, currency)}
                              </option>
                            ))}
                          </select>
                          {zonesForBranch.length === 0 && (
                            <p className="rounded-[13px] bg-[#FFF7E8] px-3 py-2 text-xs text-[#8a6a16]">لا توجد مناطق توصيل متاحة لهذا الفرع حالياً.</p>
                          )}
                          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان بالتفصيل" className={inputCls} />
                          <button
                            type="button"
                            onClick={() => setMapOpen(true)}
                            className="flex items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-wesaya-line bg-white px-3 py-3 text-sm font-bold text-wesaya-ink transition hover:border-wesaya-red/40"
                          >
                            <MapPin className="h-4 w-4 text-wesaya-red" /> {coords ? "تم تحديد موقعك — اضغط للتعديل" : "اختر موقعك على الخريطة"}
                          </button>
                        </>
                      )}

                      {fulfillment === "pickup" && branches.length > 1 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[12.5px] font-semibold text-wesaya-muted">اختر الفرع للاستلام</span>
                          {branches.map((b) => (
                            <button
                              key={b.id}
                              onClick={() => { setBranchId(b.id); setZoneId(""); }}
                              className={"flex items-center justify-between rounded-[13px] border-[1.5px] px-3.5 py-3 text-start transition " + (b.id === branchId ? "border-wesaya-red bg-wesaya-tint" : "border-wesaya-line bg-white hover:border-wesaya-red/40")}
                            >
                              <span className="flex flex-col gap-0.5">
                                <span className="text-sm font-bold text-wesaya-ink">{b.name}</span>
                                <span className="text-[11.5px] text-wesaya-muted">٢٤ ساعة</span>
                              </span>
                              {b.id === branchId && <span className="font-bold text-wesaya-red">✓</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات الطلب (اختياري)" rows={2} className={inputCls + " resize-none"} />
                    </div>

                    {/* payment method */}
                    <div className="flex flex-col gap-2.5">
                      <div className="font-baloo text-base font-bold text-wesaya-ink">طريقة الدفع</div>
                      <div className="flex items-center gap-3 rounded-[14px] border-2 border-wesaya-red bg-white p-3.5">
                        <span className="h-[22px] w-[22px] flex-none rounded-full border-[6px] border-wesaya-red bg-white" />
                        <div className="flex-1">
                          <div className="text-sm font-bold text-wesaya-ink">الدفع عند الاستلام</div>
                          <div className="text-[11.5px] text-wesaya-muted">كاش عند استلام طلبك</div>
                        </div>
                        <span className="text-xl">💵</span>
                      </div>
                      <div className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-wesaya-line bg-[#F6F0E6] p-3.5 opacity-70">
                        <span className="h-[22px] w-[22px] flex-none rounded-full border-2 border-wesaya-line bg-white" />
                        <div className="flex-1">
                          <div className="text-sm font-bold text-wesaya-muted">الدفع الإلكتروني</div>
                          <div className="text-[11.5px] text-wesaya-muted">بطاقة / محفظة</div>
                        </div>
                        <span className="rounded-lg bg-[#E9DECB] px-2.5 py-1 text-[11px] font-bold text-[#8a6a16]">قريبًا</span>
                      </div>
                    </div>

                    {/* totals (server recomputes the authoritative total at checkout) */}
                    <div className="flex flex-col gap-1.5 rounded-[18px] border border-wesaya-line bg-white px-4 py-3.5">
                      <Row label="المجموع الفرعي" value={formatCurrency(subtotal, currency)} />
                      <Row label="رسوم التوصيل" value={formatCurrency(deliveryFee, currency)} />
                      <div className="flex items-center justify-between border-t border-wesaya-line pt-2">
                        <span className="text-sm font-bold text-wesaya-ink">الإجمالي التقديري</span>
                        <span className="font-baloo text-xl font-extrabold text-wesaya-red">{formatCurrency(previewTotal, currency)}</span>
                      </div>
                      <p className="text-[11px] text-wesaya-muted">الدفع عند الاستلام · يُؤكَّد الإجمالي من المطعم.</p>
                    </div>

                    {checkoutError && <p className="rounded-[13px] bg-red-50 px-3 py-2 text-sm text-red-700">{checkoutError}</p>}
                  </div>
                </div>
                <div className="flex-none border-t border-wesaya-line bg-wesaya-cream px-[18px] py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    disabled={!canConfirm}
                    onClick={submitOrder}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-wesaya-red px-4 py-4 font-baloo text-base font-bold text-white shadow-[0_8px_20px_rgba(214,35,0,0.3)] transition hover:bg-wesaya-red-dark disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? "جارٍ إرسال الطلب..." : (<><span>تأكيد الطلب</span><span>·</span><span>{formatCurrency(previewTotal, currency)}</span></>)}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Location picker (client-only Leaflet map) — only improves the address. */}
      {mapOpen && (
        <LocationPicker
          initial={coords}
          onClose={() => setMapOpen(false)}
          onConfirm={({ lat, lng, address: picked }) => {
            setCoords({ lat, lng });
            setAddress(picked);
            setMapOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Truthful price label: "من X" for size-varied / configurable items, the exact
 *  price for simple items, and "حسب الاختيار" when the base is 0 (price comes only
 *  from the chosen option) — never a fabricated number. */
function priceLabel(item: MenuItem, currency: string): string {
  const variants = activeVariants(item);
  if (variants.length > 0) {
    const min = Math.min(...variants.map((v) => v.price));
    return `من ${formatCurrency(min, currency)}`;
  }
  const hasChoices = (item.choiceGroups?.length ?? 0) > 0;
  if (item.price > 0) return hasChoices ? `من ${formatCurrency(item.price, currency)}` : formatCurrency(item.price, currency);
  return "حسب الاختيار";
}

/** Cart/checkout drawer header: back chevron (RTL) + centered title. */
function DrawerHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex flex-none items-center justify-between border-b border-wesaya-line bg-wesaya-cream px-[18px] py-3">
      <button onClick={onBack} aria-label="رجوع" className="flex h-9 w-9 items-center justify-center rounded-xl border border-wesaya-line bg-white text-wesaya-ink">
        <ChevronLeft className="h-5 w-5 -scale-x-100" />
      </button>
      <div className="font-baloo text-[19px] font-extrabold text-wesaya-ink">{title}</div>
      <div className="w-9" />
    </div>
  );
}

/** Summary line: muted label · bold value. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[13.5px]">
      <span className="text-wesaya-muted">{label}</span>
      <span className="font-bold text-wesaya-ink">{value}</span>
    </div>
  );
}

function catEmoji(category: string): string {
  const c = category;
  if (/عرض|عروض/.test(c)) return "🔥";
  if (/عائلي/.test(c)) return "👨‍👩‍👧‍👦";
  if (/برجر/.test(c)) return "🍔";
  if (/بيتزا/.test(c)) return "🍕";
  if (/دجاج|بروست/.test(c)) return "🍗";
  if (/سندوي|ساندوي/.test(c)) return "🥪";
  if (/مشروب/.test(c)) return "🥤";
  if (/فردي/.test(c)) return "🍱";
  if (/جانبي/.test(c)) return "🍟";
  return "🍽️";
}

function CatPill({ active, onClick, emoji, label }: { active: boolean; onClick: () => void; emoji: string; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{ width: 80 }}
      className={
        "flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-3 py-2.5 transition " +
        (active ? "border-wesaya-red bg-wesaya-red text-white shadow-sm" : "border-wesaya-line bg-white text-wesaya-ink hover:bg-wesaya-tint")
      }
    >
      <span className="text-2xl leading-none">{emoji}</span>
      <span className="text-center text-[11.5px] font-bold leading-tight">{label}</span>
    </button>
  );
}

function FulfillmentToggle({
  fulfillment,
  setFulfillment,
}: {
  fulfillment: "delivery" | "pickup";
  setFulfillment: (f: "delivery" | "pickup") => void;
}) {
  const seg = (active: boolean) =>
    "flex-1 rounded-[11px] py-2 text-sm font-bold transition " + (active ? "bg-white text-wesaya-red shadow-sm" : "text-wesaya-muted");
  return (
    <div className="flex gap-1 rounded-[14px] bg-[#F0E6D6] p-1">
      <button onClick={() => setFulfillment("delivery")} className={seg(fulfillment === "delivery")}>
        🛵 توصيل
      </button>
      <button onClick={() => setFulfillment("pickup")} className={seg(fulfillment === "pickup")}>
        🏠 استلام
      </button>
    </div>
  );
}

/** Menu photo from the DB image_url (the bug was that these weren't rendered),
 *  with a branded emoji fallback when an item has no photo. */
function Photo({ src, alt, category, className }: { src?: string | null; alt: string; category: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" className={(className ?? "") + " object-cover"} />;
  }
  return (
    <div className={(className ?? "") + " flex items-center justify-center bg-wesaya-tint text-2xl"} aria-hidden>
      {catEmoji(category)}
    </div>
  );
}
