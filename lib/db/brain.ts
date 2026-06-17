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
  MenuItemChoiceGroup,
  MenuItemChoiceOption,
  MenuItemVariant,
  MenuItem,
  Modifier,
  Policies,
  RestaurantProfile,
} from "@/lib/types";
import type {
  BranchRow,
  DeliveryZoneRow,
  FaqRow,
  MenuItemChoiceGroupRow,
  MenuItemChoiceOptionRow,
  MenuCategoryRow,
  MenuItemModifierRow,
  MenuItemRow,
  MenuItemVariantRow,
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
  const hours = r.hours as { text?: string } | null;
  return {
    id: r.id,
    name: r.name,
    address: r.address ?? "",
    hours: hours?.text ?? "",
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

function toMenuItem(
  r: MenuItemRow,
  categoryName: string,
  modifierIds: string[],
  variants: MenuItemVariant[],
  choiceGroups: MenuItemChoiceGroup[]
): MenuItem {
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
    variants,
    choiceGroups,
  };
}

function toVariant(r: MenuItemVariantRow): MenuItemVariant {
  return { id: r.id, name: r.name, price: Number(r.price), sort: r.sort, active: r.active };
}

function toChoiceOption(r: MenuItemChoiceOptionRow): MenuItemChoiceOption {
  return {
    id: r.id,
    label: r.label,
    priceDelta: Number(r.price_delta),
    sort: r.sort,
    active: r.active,
  };
}

// --- loader ----------------------------------------------------------------
/** Load the full brain config for a restaurant (RLS scopes to the caller). */
export async function loadBrain(supabase: SupabaseClient, restaurantId: string): Promise<BrainData> {
  const [
    restaurant,
    branches,
    categories,
    items,
    variants,
    choiceGroups,
    choiceOptions,
    modifiers,
    itemMods,
    zones,
    policies,
    faqs,
  ] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", restaurantId).single(),
    supabase.from("branches").select("*").eq("restaurant_id", restaurantId).order("created_at"),
    supabase.from("menu_categories").select("*").eq("restaurant_id", restaurantId).order("sort"),
    supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId).order("created_at"),
    supabase.from("menu_item_variants").select("*").eq("restaurant_id", restaurantId).order("sort"),
    supabase.from("menu_item_choice_groups").select("*").eq("restaurant_id", restaurantId).order("sort"),
    supabase.from("menu_item_choice_options").select("*").eq("restaurant_id", restaurantId).order("sort"),
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
  const variantsByItem = new Map<string, MenuItemVariant[]>();
  for (const row of (variants.data ?? []) as MenuItemVariantRow[]) {
    const arr = variantsByItem.get(row.item_id) ?? [];
    arr.push(toVariant(row));
    variantsByItem.set(row.item_id, arr);
  }
  const optionsByGroup = new Map<string, MenuItemChoiceOption[]>();
  for (const row of (choiceOptions.data ?? []) as MenuItemChoiceOptionRow[]) {
    const arr = optionsByGroup.get(row.group_id) ?? [];
    arr.push(toChoiceOption(row));
    optionsByGroup.set(row.group_id, arr);
  }
  const groupsByItem = new Map<string, MenuItemChoiceGroup[]>();
  for (const row of (choiceGroups.data ?? []) as MenuItemChoiceGroupRow[]) {
    const arr = groupsByItem.get(row.item_id) ?? [];
    arr.push({
      id: row.id,
      name: row.name,
      minSelect: row.min_select,
      maxSelect: row.max_select,
      sort: row.sort,
      options: optionsByGroup.get(row.id) ?? [],
    });
    groupsByItem.set(row.item_id, arr);
  }

  return {
    profile: toProfile(restaurant.data as RestaurantRow),
    branches: ((branches.data ?? []) as BranchRow[]).map(toBranch),
    menuItems: ((items.data ?? []) as MenuItemRow[]).map((it) =>
      toMenuItem(
        it,
        it.category_id ? catById.get(it.category_id) ?? "" : "",
        modsByItem.get(it.id) ?? [],
        variantsByItem.get(it.id) ?? [],
        groupsByItem.get(it.id) ?? []
      )
    ),
    modifiers: ((modifiers.data ?? []) as ModifierRow[]).map(toModifier),
    deliveryAreas: ((zones.data ?? []) as DeliveryZoneRow[]).map(toDeliveryArea),
    faqs: ((faqs.data ?? []) as FaqRow[]).map(toFaq),
    policies: toPolicies((policies.data ?? []) as PolicyRow[]),
  };
}

// ===========================================================================
// Mutations (manager-gated by RLS). UI types in → DB columns out. Each returns
// the new/updated row id where relevant. Callers re-hydrate via realtime.
// ===========================================================================
import type { AiToneConfig } from "@/lib/types";

export async function updateProfileDb(
  s: SupabaseClient,
  restaurantId: string,
  patch: Partial<RestaurantProfile>
) {
  const map: Record<string, unknown> = {};
  if (patch.name !== undefined) map.name = patch.name;
  if (patch.logoUrl !== undefined) map.logo_url = patch.logoUrl;
  if (patch.phone !== undefined) map.phone = patch.phone;
  if (patch.email !== undefined) map.email = patch.email;
  if (patch.currency !== undefined) map.currency = patch.currency;
  if (patch.defaultLanguage !== undefined) map.default_language = patch.defaultLanguage;
  if (patch.timezone !== undefined) map.timezone = patch.timezone;
  if (patch.businessType !== undefined) map.business_type = patch.businessType;
  if (Object.keys(map).length) await s.from("restaurants").update(map).eq("id", restaurantId);
}

export async function updateAiToneDb(
  s: SupabaseClient,
  restaurantId: string,
  tone: AiToneConfig
) {
  await s.from("restaurants").update({ ai_tone: tone }).eq("id", restaurantId);
}

// --- branches ---
export async function addBranchDb(s: SupabaseClient, restaurantId: string, b: Omit<Branch, "id">) {
  await s.from("branches").insert({
    restaurant_id: restaurantId,
    name: b.name,
    address: b.address,
    phone: b.whatsappNumber || b.phone || "",
    hours: { text: b.hours ?? "" },
    notes: b.notes ?? "",
    active: b.open ?? true,
  });
}
export async function updateBranchDb(s: SupabaseClient, id: string, patch: Partial<Branch>) {
  const map: Record<string, unknown> = {};
  if (patch.name !== undefined) map.name = patch.name;
  if (patch.address !== undefined) map.address = patch.address;
  if (patch.whatsappNumber !== undefined) map.phone = patch.whatsappNumber;
  if (patch.hours !== undefined) map.hours = { text: patch.hours };
  if (patch.notes !== undefined) map.notes = patch.notes;
  if (patch.open !== undefined) map.active = patch.open;
  if (Object.keys(map).length) await s.from("branches").update(map).eq("id", id);
}
export async function deleteBranchDb(s: SupabaseClient, id: string) {
  await s.from("branches").delete().eq("id", id);
}

// --- categories (resolve UI category name → id) ---
async function ensureCategoryId(s: SupabaseClient, restaurantId: string, name: string): Promise<string | null> {
  if (!name) return null;
  const { data } = await s.from("menu_categories").select("id").eq("restaurant_id", restaurantId).eq("name", name).limit(1).maybeSingle();
  if (data) return data.id as string;
  const { data: created } = await s.from("menu_categories").insert({ restaurant_id: restaurantId, name }).select("id").single();
  return (created?.id as string) ?? null;
}

// --- menu items (+ modifier links) ---
export async function addMenuItemDb(s: SupabaseClient, restaurantId: string, m: Omit<MenuItem, "id">) {
  const categoryId = await ensureCategoryId(s, restaurantId, m.category);
  const { data } = await s.from("menu_items").insert({
    restaurant_id: restaurantId,
    category_id: categoryId,
    name: m.name,
    description: m.description ?? "",
    price: m.price,
    image_url: m.imageUrl ?? "",
    available: m.available ?? true,
    ingredients: m.ingredients ?? [],
    allergens: m.allergens ?? [],
  }).select("id").single();
  const itemId = data?.id as string | undefined;
  if (itemId && m.modifierIds?.length) {
    await s.from("menu_item_modifiers").insert(
      m.modifierIds.map((mid) => ({ restaurant_id: restaurantId, item_id: itemId, modifier_id: mid }))
    );
  }
}
export async function updateMenuItemDb(s: SupabaseClient, restaurantId: string, id: string, patch: Partial<MenuItem>) {
  const map: Record<string, unknown> = {};
  if (patch.name !== undefined) map.name = patch.name;
  if (patch.description !== undefined) map.description = patch.description;
  if (patch.price !== undefined) map.price = patch.price;
  if (patch.imageUrl !== undefined) map.image_url = patch.imageUrl;
  if (patch.available !== undefined) map.available = patch.available;
  if (patch.ingredients !== undefined) map.ingredients = patch.ingredients;
  if (patch.allergens !== undefined) map.allergens = patch.allergens;
  if (patch.category !== undefined) map.category_id = await ensureCategoryId(s, restaurantId, patch.category);
  if (Object.keys(map).length) await s.from("menu_items").update(map).eq("id", id);
  if (patch.modifierIds !== undefined) {
    await s.from("menu_item_modifiers").delete().eq("item_id", id);
    if (patch.modifierIds.length)
      await s.from("menu_item_modifiers").insert(
        patch.modifierIds.map((mid) => ({ restaurant_id: restaurantId, item_id: id, modifier_id: mid }))
      );
  }
}
export async function deleteMenuItemDb(s: SupabaseClient, id: string) {
  await s.from("menu_items").delete().eq("id", id);
}

// --- modifiers ---
export async function addModifierDb(s: SupabaseClient, restaurantId: string, m: Omit<Modifier, "id">) {
  await s.from("modifiers").insert({
    restaurant_id: restaurantId, name: m.name, price_impact: m.priceImpact, category: m.category ?? "", active: m.active ?? true,
  });
}
export async function updateModifierDb(s: SupabaseClient, id: string, patch: Partial<Modifier>) {
  const map: Record<string, unknown> = {};
  if (patch.name !== undefined) map.name = patch.name;
  if (patch.priceImpact !== undefined) map.price_impact = patch.priceImpact;
  if (patch.category !== undefined) map.category = patch.category;
  if (patch.active !== undefined) map.active = patch.active;
  if (Object.keys(map).length) await s.from("modifiers").update(map).eq("id", id);
}
export async function deleteModifierDb(s: SupabaseClient, id: string) {
  await s.from("modifiers").delete().eq("id", id);
}

// --- delivery zones ---
function etaToMinutes(t?: string): number | null {
  if (!t) return null;
  const m = t.match(/\d+/);
  return m ? Number(m[0]) : null;
}
export async function addDeliveryAreaDb(s: SupabaseClient, restaurantId: string, d: Omit<DeliveryArea, "id">) {
  await s.from("delivery_zones").insert({
    restaurant_id: restaurantId, name: d.name, fee: d.deliveryFee, min_order: d.minOrder,
    eta_minutes: etaToMinutes(d.estimatedTime), active: d.active ?? true,
  });
}
export async function updateDeliveryAreaDb(s: SupabaseClient, id: string, patch: Partial<DeliveryArea>) {
  const map: Record<string, unknown> = {};
  if (patch.name !== undefined) map.name = patch.name;
  if (patch.deliveryFee !== undefined) map.fee = patch.deliveryFee;
  if (patch.minOrder !== undefined) map.min_order = patch.minOrder;
  if (patch.estimatedTime !== undefined) map.eta_minutes = etaToMinutes(patch.estimatedTime);
  if (patch.active !== undefined) map.active = patch.active;
  if (Object.keys(map).length) await s.from("delivery_zones").update(map).eq("id", id);
}
export async function deleteDeliveryAreaDb(s: SupabaseClient, id: string) {
  await s.from("delivery_zones").delete().eq("id", id);
}

// --- faqs ---
export async function addFaqDb(s: SupabaseClient, restaurantId: string, f: Omit<FaqItem, "id">) {
  await s.from("faqs").insert({
    restaurant_id: restaurantId, question: f.question, answer: f.answer, category: f.category ?? "", active: f.active ?? true,
  });
}
export async function updateFaqDb(s: SupabaseClient, id: string, patch: Partial<FaqItem>) {
  const map: Record<string, unknown> = {};
  if (patch.question !== undefined) map.question = patch.question;
  if (patch.answer !== undefined) map.answer = patch.answer;
  if (patch.category !== undefined) map.category = patch.category;
  if (patch.active !== undefined) map.active = patch.active;
  if (Object.keys(map).length) await s.from("faqs").update(map).eq("id", id);
}
export async function deleteFaqDb(s: SupabaseClient, id: string) {
  await s.from("faqs").delete().eq("id", id);
}

// --- policies (upsert by key) ---
export async function updatePoliciesDb(s: SupabaseClient, restaurantId: string, patch: Partial<Policies>) {
  const rows = Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([key, text]) => ({ restaurant_id: restaurantId, key, text: text as string }));
  if (rows.length) await s.from("policies").upsert(rows, { onConflict: "restaurant_id,key" });
}
