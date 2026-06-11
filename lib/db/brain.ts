// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — Restaurant Brain data layer
// Reads the tenant's brain config from Supabase and maps DB rows to the existing
// UI types (lib/types.ts) so pages/stores can consume it unchanged. RLS scopes
// every query to the caller's restaurant automatically.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Branch,
  DeliveryArea,
  FaqItem,
  MenuItem,
  Modifier,
  Policies,
  RestaurantProfile,
} from "@/lib/types";
import type {
  BranchRow,
  DeliveryZoneRow,
  FaqRow,
  MenuCategoryRow,
  MenuItemModifierRow,
  MenuItemRow,
  ModifierRow,
  PolicyRow,
  RestaurantRow,
} from "./types";

export interface BrainData {
  profile: RestaurantProfile;
  branches: Branch[];
  menuItems: MenuItem[];
  modifiers: Modifier[];
  deliveryAreas: DeliveryArea[];
  faqs: FaqItem[];
  policies: Policies;
}

// --- mappers (DB → UI types) -----------------------------------------------
export function toProfile(r: RestaurantRow): RestaurantProfile {
  return {
    name: r.name,
    logoUrl: r.logo_url ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    currency: r.currency,
    defaultLanguage: r.default_language,
    timezone: r.timezone,
    businessType: r.business_type ?? "",
  };
}

function toBranch(r: BranchRow): Branch {
  return {
    id: r.id,
    name: r.name,
    address: r.address ?? "",
    hours: typeof r.hours === "object" ? JSON.stringify(r.hours) : String(r.hours ?? ""),
    whatsappNumber: r.phone ?? "",
    deliveryZones: [],
    open: r.active,
    notes: r.notes ?? "",
    whatsappConnected: !!r.phone,
    phone: r.phone ?? "",
  };
}

function toModifier(r: ModifierRow): Modifier {
  return { id: r.id, name: r.name, priceImpact: Number(r.price_impact), category: r.category ?? "", active: r.active };
}

function toDeliveryArea(r: DeliveryZoneRow): DeliveryArea {
  return {
    id: r.id,
    name: r.name,
    minOrder: Number(r.min_order),
    deliveryFee: Number(r.fee),
    estimatedTime: r.eta_minutes ? `${r.eta_minutes} دقيقة` : "",
    active: r.active,
  };
}

function toFaq(r: FaqRow): FaqItem {
  return { id: r.id, question: r.question, answer: r.answer ?? "", category: r.category ?? "", active: r.active };
}

const POLICY_KEYS: (keyof Policies)[] = ["refund", "cancellation", "delivery", "replacement", "payment"];
function toPolicies(rows: PolicyRow[]): Policies {
  const base: Policies = { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" };
  for (const row of rows) {
    if ((POLICY_KEYS as string[]).includes(row.key)) base[row.key as keyof Policies] = row.text;
  }
  return base;
}

function toMenuItem(r: MenuItemRow, categoryName: string, modifierIds: string[]): MenuItem {
  return {
    id: r.id,
    name: r.name,
    category: categoryName,
    price: Number(r.price),
    available: r.available,
    description: r.description ?? "",
    imageUrl: r.image_url ?? "",
    modifierIds,
    ingredients: r.ingredients ?? [],
    allergens: r.allergens ?? [],
  };
}

// --- loader ----------------------------------------------------------------
/** Load the full brain config for a restaurant (RLS scopes to the caller). */
export async function loadBrain(supabase: SupabaseClient, restaurantId: string): Promise<BrainData> {
  const [restaurant, branches, categories, items, modifiers, itemMods, zones, policies, faqs] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", restaurantId).single(),
    supabase.from("branches").select("*").eq("restaurant_id", restaurantId).order("created_at"),
    supabase.from("menu_categories").select("*").eq("restaurant_id", restaurantId).order("sort"),
    supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId).order("created_at"),
    supabase.from("modifiers").select("*").eq("restaurant_id", restaurantId).order("created_at"),
    supabase.from("menu_item_modifiers").select("*").eq("restaurant_id", restaurantId),
    supabase.from("delivery_zones").select("*").eq("restaurant_id", restaurantId).order("created_at"),
    supabase.from("policies").select("*").eq("restaurant_id", restaurantId),
    supabase.from("faqs").select("*").eq("restaurant_id", restaurantId).order("created_at"),
  ]);

  if (restaurant.error) throw restaurant.error;

  const catById = new Map<string, string>(
    ((categories.data ?? []) as MenuCategoryRow[]).map((c) => [c.id, c.name])
  );
  const modsByItem = new Map<string, string[]>();
  for (const link of (itemMods.data ?? []) as MenuItemModifierRow[]) {
    const arr = modsByItem.get(link.item_id) ?? [];
    arr.push(link.modifier_id);
    modsByItem.set(link.item_id, arr);
  }

  return {
    profile: toProfile(restaurant.data as RestaurantRow),
    branches: ((branches.data ?? []) as BranchRow[]).map(toBranch),
    menuItems: ((items.data ?? []) as MenuItemRow[]).map((it) =>
      toMenuItem(it, it.category_id ? catById.get(it.category_id) ?? "" : "", modsByItem.get(it.id) ?? [])
    ),
    modifiers: ((modifiers.data ?? []) as ModifierRow[]).map(toModifier),
    deliveryAreas: ((zones.data ?? []) as DeliveryZoneRow[]).map(toDeliveryArea),
    faqs: ((faqs.data ?? []) as FaqRow[]).map(toFaq),
    policies: toPolicies((policies.data ?? []) as PolicyRow[]),
  };
}
