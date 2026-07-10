// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — Restaurant Brain data layer
// Reads the tenant's brain config from Supabase and maps DB rows to the existing
// UI types (lib/types.ts) so pages/stores can consume it unchanged. RLS scopes
// every query to the caller's restaurant automatically.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalToArLabel } from "@/lib/ai/allergen-vocab";
import type {
  Branch,
  DeliveryArea,
  FaqItem,
  MenuItemChoiceGroup,
  MenuItemChoiceOption,
  MenuItemVariant,
  MenuItem,
  Modifier,
  OperatorPromotion,
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
  PromotionRow,
  RestaurantRow,
} from "./types";

export interface BrainData {
  profile: RestaurantProfile;
  branches: Branch[];
  menuItems: MenuItem[];
  modifiers: Modifier[];
  deliveryAreas: DeliveryArea[];
  faqs: FaqItem[];
  promotions: OperatorPromotion[];
  policies: Policies;
  taxMode: string;
  taxRate: number;
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
    open: r.active,
    notes: r.notes ?? "",
    whatsappConnected: !!r.phone,
    phone: r.phone ?? "",
    lat: r.lat == null ? undefined : Number(r.lat),
    lng: r.lng == null ? undefined : Number(r.lng),
  };
}

function toModifier(r: ModifierRow): Modifier {
  return { id: r.id, name: r.name, priceImpact: Number(r.price_impact), category: r.category ?? "", active: r.active };
}

function toDeliveryArea(r: DeliveryZoneRow): DeliveryArea {
  return {
    id: r.id,
    name: r.name,
    branchId: r.branch_id ?? undefined,
    minOrder: Number(r.min_order),
    deliveryFee: Number(r.fee),
    estimatedTime: r.eta_minutes ? `${r.eta_minutes} دقيقة` : "",
    active: r.active,
    // Geometry is present only after migration 0081 is applied AND an operator has
    // drawn the zone; guard both so legacy name-only zones map cleanly.
    centerLat: r.center_lat == null ? undefined : Number(r.center_lat),
    centerLng: r.center_lng == null ? undefined : Number(r.center_lng),
    radiusKm: r.radius_km == null ? undefined : Number(r.radius_km),
  };
}

function toFaq(r: FaqRow): FaqItem {
  return { id: r.id, question: r.question, answer: r.answer ?? "", category: r.category ?? "", active: r.active };
}

function toPromotion(r: PromotionRow): OperatorPromotion {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    config: r.config ?? {},
    code: r.code ?? "",
    schedule: r.schedule ?? {},
    state: r.state,
    spent: Number(r.spent ?? 0),
    budgetCap: r.budget_cap === null || r.budget_cap === undefined ? null : Number(r.budget_cap),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
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
  // Effective availability folds in the timed "back tomorrow" window: an item is
  // sellable only when its flag is on AND no future unavailable_until is set.
  // Once the window passes the item auto-returns (no cron) — every read recomputes.
  const timedOut = !!r.unavailable_until && new Date(r.unavailable_until).getTime() > Date.now();
  return {
    id: r.id,
    name: r.name,
    category: categoryName,
    price: Number(r.price),
    available: r.available && !timedOut,
    unavailableUntil: r.unavailable_until ?? null,
    description: r.description ?? "",
    imageUrl: r.image_url ?? "",
    modifierIds,
    ingredients: r.ingredients ?? [],
    // WB-ALLERGEN-3 (display fix) — the DB stores CANONICAL keys (tree_nut, dairy…)
    // for the future gate cross-reference (WB-ALLERGEN-4), but Karim speaks Arabic
    // to customers, so the Brain/prompt representation must show the ARABIC label
    // (مكسرات، ألبان…) — prompt.ts:168 prints these. Map each stored key → its Arabic
    // label here in the LOAD path; an unmappable/legacy value (not a canonical key)
    // passes through AS-IS so an allergen is never hidden. Storage is unchanged.
    allergens: (r.allergens ?? []).map((a) => canonicalToArLabel(a) ?? a),
    // WB-ALLERGEN-3 — surface review state for the editor badge (read-only; the
    // prompt/gate don't consume it). Absent (pre-0055) → null = unreviewed.
    allergensReviewedAt: r.allergens_reviewed_at ?? null,
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
    promotions,
  ] = await Promise.all([
    // Explicit columns (NOT select("*")): loadBrain runs under both service-role
    // (the WhatsApp webhook) and user-session clients, and the secret credential
    // columns (wa_access_token_enc / wa_app_secret_enc) are column-grant-revoked
    // for anon/authenticated. Brain only needs the profile fields toProfile reads.
    supabase
      .from("restaurants")
      .select("name,logo_url,phone,email,currency,default_language,timezone,business_type,tax_mode,tax_rate")
      .eq("id", restaurantId)
      .single(),
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
    supabase.from("promotions").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }),
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
    taxMode: String((restaurant.data as RestaurantRow).tax_mode ?? "inclusive"),
    taxRate: Number((restaurant.data as RestaurantRow).tax_rate ?? 0),
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
    promotions: ((promotions.data ?? []) as PromotionRow[]).map(toPromotion),
    policies: toPolicies((policies.data ?? []) as PolicyRow[]),
  };
}

// --- realtime (LIVE0 Phase L2) ---------------------------------------------
/**
 * Subscribe to this tenant's brain tables so a menu/86/category/variant/modifier/
 * zone/faq/policy/promotion change by ANY operator triggers a brain reload here.
 * Mirrors the L1 Phase-0 guardrail convention (lib/db/restaurant-settings.ts):
 *   (a) filter by restaurant_id, (b) the store DEBOUNCES the reload,
 *   (c) returns a cleanup fn, (d) FAILS QUIETLY on a dropped channel,
 *   (e) RECONNECT-RELOADs (onChange on SUBSCRIBED — initial AND after a reconnect).
 *
 * `restaurants` is intentionally NOT included: it's already streamed by L1's
 * subscribeRestaurants (ops), and brain profile/tax edits are rare — the 86/menu
 * freshness this phase targets lives entirely in the tables below. All of these
 * carry restaurant_id (loadBrain filters each by it). One channel, many listeners.
 */
const BRAIN_REALTIME_TABLES = [
  "branches",
  "menu_categories",
  "menu_items",
  "menu_item_variants",
  "menu_item_choice_groups",
  "menu_item_choice_options",
  "modifiers",
  "menu_item_modifiers",
  "delivery_zones",
  "policies",
  "faqs",
  "promotions",
] as const;

export function subscribeBrain(
  s: SupabaseClient,
  restaurantId: string,
  onChange: () => void
): () => void {
  const filter = `restaurant_id=eq.${restaurantId}`;
  let ch = s.channel(`brain-${restaurantId}`);
  for (const table of BRAIN_REALTIME_TABLES) {
    ch = ch.on("postgres_changes", { event: "*", schema: "public", table, filter }, onChange);
  }
  ch.subscribe((status) => {
    // (e) reconnect-reload — catch changes missed while disconnected.
    if (status === "SUBSCRIBED") {
      onChange();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      // (d) fail quietly — Supabase retries the channel; never throw into the UI.
      console.warn("[realtime:brain] channel status:", status);
    }
  });
  return () => {
    void s.removeChannel(ch);
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
// Exported so the chat-admin add_item path reuses the SAME name→id resolution as
// addMenuItemDb (S3) — never writing a non-existent `category` column. Logic unchanged.
export async function ensureCategoryId(s: SupabaseClient, restaurantId: string, name: string): Promise<string | null> {
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

// --- real-time 86ing --------------------------------------------------------
export interface SetAvailabilityArgs {
  itemId: string;
  available: boolean;
  /** Optional timed window when 86ing ("back at …"). Ignored when re-enabling. */
  unavailableUntil?: string | null;
  source?: "operator" | "admin_agent" | "kitchen" | "system";
  actorUserId?: string | null;
  actorRole?: string | null;
  reason?: string | null;
}
export interface SetAvailabilityResult {
  ok: boolean;
  name?: string;
  error?: "item_not_found";
}

/**
 * Flip a menu item's availability ("86" it or bring it back) and write an audit
 * row in one place — shared by the operator one-tap toggle (/api/menu/availability)
 * and the admin agent (set_item_availability). Tenant-scoped: the update is keyed
 * by both id AND restaurant_id so a toggle can never reach another tenant's item.
 * Re-enabling always clears any timed window so a stale "back tomorrow" can't keep
 * the item dark. The flag is the single source of truth the customer tools read.
 */
export async function setItemAvailabilityDb(
  s: SupabaseClient,
  restaurantId: string,
  a: SetAvailabilityArgs
): Promise<SetAvailabilityResult> {
  const { data: item } = await s
    .from("menu_items")
    .select("name")
    .eq("id", a.itemId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!item) return { ok: false, error: "item_not_found" };

  const unavailableUntil = a.available ? null : a.unavailableUntil ?? null;
  await s
    .from("menu_items")
    .update({ available: a.available, unavailable_until: unavailableUntil })
    .eq("id", a.itemId)
    .eq("restaurant_id", restaurantId);

  await s.from("menu_availability_events").insert({
    restaurant_id: restaurantId,
    menu_item_id: a.itemId,
    item_name: (item as { name: string }).name,
    available: a.available,
    unavailable_until: unavailableUntil,
    source: a.source ?? "operator",
    actor_user_id: a.actorUserId ?? null,
    actor_role: a.actorRole ?? null,
    reason: a.reason ?? null,
  });
  return { ok: true, name: (item as { name: string }).name };
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
  const nums = t.match(/\d+/g);
  if (!nums) return null;
  // The column stores a single int, so a range like "30-45 دقيقة" keeps its UPPER
  // bound (the customer-facing SLA figure) instead of silently dropping to the
  // lower one. Single-value inputs are unaffected (max of one number is itself).
  return Math.max(...nums.map(Number));
}
export async function addDeliveryAreaDb(s: SupabaseClient, restaurantId: string, d: Omit<DeliveryArea, "id">) {
  const row: Record<string, unknown> = {
    restaurant_id: restaurantId, branch_id: d.branchId || null, name: d.name, fee: d.deliveryFee, min_order: d.minOrder,
    eta_minutes: etaToMinutes(d.estimatedTime), active: d.active ?? true,
  };
  // Only include geometry when the caller supplied it, so a legacy name-only save
  // never references the 0081 columns before that prepare-only migration is applied.
  if (d.centerLat !== undefined) row.center_lat = d.centerLat;
  if (d.centerLng !== undefined) row.center_lng = d.centerLng;
  if (d.radiusKm !== undefined) row.radius_km = d.radiusKm;
  await s.from("delivery_zones").insert(row);
}
export async function updateDeliveryAreaDb(s: SupabaseClient, id: string, patch: Partial<DeliveryArea>) {
  const map: Record<string, unknown> = {};
  if (patch.name !== undefined) map.name = patch.name;
  if (patch.branchId !== undefined) map.branch_id = patch.branchId || null;
  if (patch.deliveryFee !== undefined) map.fee = patch.deliveryFee;
  if (patch.minOrder !== undefined) map.min_order = patch.minOrder;
  if (patch.estimatedTime !== undefined) map.eta_minutes = etaToMinutes(patch.estimatedTime);
  if (patch.active !== undefined) map.active = patch.active;
  if (patch.centerLat !== undefined) map.center_lat = patch.centerLat;
  if (patch.centerLng !== undefined) map.center_lng = patch.centerLng;
  if (patch.radiusKm !== undefined) map.radius_km = patch.radiusKm;
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

// --- promotions ---
export async function updatePromotionStateDb(s: SupabaseClient, restaurantId: string, id: string, active: boolean) {
  await s
    .from("promotions")
    .update({ state: active ? "active" : "paused" })
    .eq("restaurant_id", restaurantId)
    .eq("id", id);
}

export async function deletePromotionDb(s: SupabaseClient, restaurantId: string, id: string) {
  await s.from("promotions").delete().eq("restaurant_id", restaurantId).eq("id", id);
}

/** Operator-created promo: insert into the EXISTING promotions table (no migration).
 *  Mirrors the agent promo route's insert shape; returns the persisted row. */
export async function createPromotionDb(
  s: SupabaseClient,
  restaurantId: string,
  row: { name: string; type: string; config: Record<string, unknown>; schedule: Record<string, unknown> },
  state: "active" | "paused" = "active"
): Promise<OperatorPromotion | null> {
  const { data, error } = await s
    .from("promotions")
    .insert({ restaurant_id: restaurantId, name: row.name, type: row.type, config: row.config, schedule: row.schedule, state })
    .select("*")
    .single();
  if (error || !data) return null;
  return toPromotion(data as PromotionRow);
}
