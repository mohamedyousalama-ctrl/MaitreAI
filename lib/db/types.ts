// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — Supabase row types
// Hand-written row shapes for the tables the data layer reads/writes. These
// mirror supabase/migrations and are the boundary the app maps to/from the
// existing UI types in lib/types.ts.
// ============================================================================

export type MemberRole = "manager" | "operation";

export interface RestaurantRow {
  id: string;
  name: string;
  logo_url: string;
  phone: string;
  email: string;
  currency: string;
  country: string;
  default_language: string;
  dialect: string;
  timezone: string;
  business_type: string;
  ai_tone: Record<string, unknown>;
  brain_score: number;
  is_open: boolean;
  closed_message: string | null;
  accept_preorders: boolean;
  hours: Record<string, unknown>;
  agent_persona_name: string | null;
  tax_mode?: string;
  tax_rate?: number;
  /** Karim Pro P0: per-tenant tier flag (migration 0022). Default 'standard'. */
  tier?: import("@/lib/tenant/tier").Tier;
  /** Karim Pro: narrow per-feature opt-in flags (migration 0024). Default {}. */
  feature_flags?: Record<string, unknown>;
  /** Manual-wallet payment configuration (migration 0021). See lib/payments/config. */
  payment_config?: import("@/lib/payments/config").PaymentConfig;
}

export interface MemberRow {
  id: string;
  restaurant_id: string;
  user_id: string;
  role: MemberRole;
  branch_id: string | null;
}

export interface BranchRow {
  id: string;
  restaurant_id: string;
  name: string;
  address: string;
  phone: string;
  hours: Record<string, unknown>;
  notes: string;
  active: boolean;
}

export interface MenuCategoryRow {
  id: string;
  restaurant_id: string;
  name: string;
  sort: number;
}

export interface MenuItemRow {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  name_en: string | null;
  description: string;
  price: number;
  image_url: string;
  available: boolean;
  unavailable_until: string | null;
  ingredients: string[];
  allergens: string[];
  image_kind: "real" | "illustrative" | "card";
  image_status: "approved" | "pending" | "rejected";
}

export interface ModifierRow {
  id: string;
  restaurant_id: string;
  name: string;
  price_impact: number;
  category: string;
  active: boolean;
}

export interface MenuItemModifierRow {
  id: string;
  restaurant_id: string;
  item_id: string;
  modifier_id: string;
}

export interface MenuItemVariantRow {
  id: string;
  restaurant_id: string;
  item_id: string;
  name: string;
  price: number;
  sort: number;
  active: boolean;
}

export interface MenuItemChoiceGroupRow {
  id: string;
  restaurant_id: string;
  item_id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort: number;
}

export interface MenuItemChoiceOptionRow {
  id: string;
  restaurant_id: string;
  group_id: string;
  label: string;
  price_delta: number;
  sort: number;
  active: boolean;
}

export interface DeliveryZoneRow {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  name: string;
  fee: number;
  min_order: number;
  eta_minutes: number | null;
  active: boolean;
}

export interface PolicyRow {
  id: string;
  restaurant_id: string;
  key: string;
  text: string;
}

export interface FaqRow {
  id: string;
  restaurant_id: string;
  question: string;
  answer: string;
  category: string;
  active: boolean;
}

export interface PromotionRow {
  id: string;
  restaurant_id: string;
  name: string;
  type: string;
  created_from_text: string | null;
  created_at: string;
  updated_at: string;
  config: Record<string, unknown>;
  code: string | null;
  segment_ids: string[] | null;
  custom_filter: Record<string, unknown> | null;
  schedule: Record<string, unknown>;
  caps: Record<string, unknown> | null;
  budget_cap: number | null;
  spent: number | null;
  eligibility: Record<string, unknown> | null;
  stacking: string | null;
  state: string;
  created_by: string | null;
}

export interface CustomerRow {
  id: string;
  restaurant_id: string;
  phone: string;
  name: string;
  language: string;
  tags: string[];
  notes: string;
  ltv: number;
  orders_count: number;
  last_seen_at: string | null;
  marketing_opt_in: boolean;
}

export interface ConversationRow {
  id: string;
  restaurant_id: string;
  customer_id: string | null;
  channel: string;
  status: string;
  owner: "ai" | "human";
  last_intent: string | null;
  confidence: number | null;
  escalation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  restaurant_id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "ai" | "human" | "system";
  text: string;
  channel_message_id: string | null;
  status: "sent" | "delivered" | "read" | "failed";
  meta: Record<string, unknown>;
  created_at: string;
}

export interface OrderRow {
  id: string;
  restaurant_id: string;
  order_number: string;
  conversation_id: string | null;
  customer_id: string | null;
  branch_id: string | null;
  fulfillment: "delivery" | "pickup";
  items: unknown[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  currency: string;
  source: string;
  discount_total: number;
  applied_promotions: unknown[];
  order_status: string;
  payment_status: string;
  address: string | null;
  zone_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
