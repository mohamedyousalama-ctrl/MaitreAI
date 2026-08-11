// ============================================================================
// MaitreAI — Shared TypeScript types
// All domain models used across the app. Mock data conforms to these shapes so
// later sprints can swap the data source without touching the UI layer.
// ============================================================================

// Channel model lives in the messaging layer (Sprint 6); re-used here so a
// conversation can record which channel it originated from.
import type { ChannelKey } from "./messaging/types";
// KV-D06-002 — the ownership-state union is the canonical application contract, not a
// literal repeated here. Type-only, so nothing is imported at runtime.
import type { OwnershipState } from "./conversation-control/model";
export type { ChannelKey };

export type ModuleKey =
  | "dashboard"
  | "conversations"
  | "orders"
  | "kitchen"
  | "menu"
  | "branches"
  | "promotions"
  | "brain"
  | "customers"
  | "settings";

// ---------------------------------------------------------------------------
// Orders (legacy Arabic-status shape — still used by some read-only mock data)
// ---------------------------------------------------------------------------
export type OrderStatus =
  | "جديد"
  | "بانتظار الدفع"
  | "مدفوع"
  | "قيد التحضير"
  | "جاهز"
  | "خرج للتوصيل"
  | "مكتمل"
  | "ملغي";

// ---------------------------------------------------------------------------
// Local order engine (Sprint 4) — enum-keyed statuses
// ---------------------------------------------------------------------------
export type OrderStatusKey =
  | "draft"
  | "pending_confirmation"
  | "pending_payment"
  | "paid"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type PaymentStatusKey = "unpaid" | "payment_link_sent" | "paid" | "failed" | "refunded";

export type KitchenStatusKey = "new" | "preparing" | "ready" | "completed";

export type FulfillmentKey = "delivery" | "pickup";

export type OrderActor = "ai" | "human" | "system";

export interface OrderEvent {
  id: string;
  type: string;
  label: string;
  timestamp: number;
  actor: OrderActor;
  metadata?: Record<string, unknown>;
}

export interface LocalOrderItem {
  id: string;
  menuItemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: string[];
  variant?: string;
  choices?: string[];
  notes?: string;
  total: number;
}

export interface LocalOrder {
  id: string;
  orderNumber: string;
  conversationId?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  source: "whatsapp" | "web";
  branchId?: string;
  branchName: string;
  fulfillmentType: FulfillmentKey;
  deliveryAreaId?: string;
  deliveryAddress?: string;
  /** DLV6b (0043) — real web-order coordinates picked at checkout. Null for
   *  WhatsApp / typed-address orders. Drives the Live Shift Order-Heat map; the
   *  map renders GATHERING until located orders exist on the stream. */
  lat?: number | null;
  lng?: number | null;
  items: LocalOrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  paymentStatus: PaymentStatusKey;
  /** Payment method chosen at checkout (e.g. "cod", "vodafone_cash"); null/undefined
   *  when unspecified (e.g. WhatsApp orders that never picked one). Read-only display. */
  paymentMethod?: string | null;
  orderStatus: OrderStatusKey;
  kitchenStatus: KitchenStatusKey;
  /** UI4 — staff-marked test/synthetic order. Set only server-side by a manager
   *  (POST /api/orders/[id]/test). Excluded from every real-numbers surface
   *  (insights, order counts, source breakdown, COD); shown in the list with a
   *  «طلب تجريبي» badge so it's never confused for a real order. */
  isTest?: boolean;
  /** WB1 — Deyafa POS hand-off state, SEPARATE from orderStatus. During the Kivo
   *  cutover staff re-enter confirmed orders into the Deyafa POS for the kitchen;
   *  until then an order is NOT in the kitchen. not_entered = needs POS entry
   *  (warning), entered = in Deyafa (posReference = Deyafa #), sent_to_kitchen =
   *  handed to the kitchen. Stamped server-side (POST /api/orders/[id]/pos). */
  posStatus?: PosStatus;
  posReference?: string | null;
  posEnteredBy?: string | null;
  posEnteredAt?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  events: OrderEvent[];
}

/** WB1 — POS (Deyafa) hand-off state; separate from OrderStatusKey. */
export type PosStatus = "not_entered" | "entered" | "sent_to_kitchen";

// ---------------------------------------------------------------------------
// Payment sessions (Sprint 5) — local mock provider simulation
// ---------------------------------------------------------------------------
export type PaymentSessionStatus =
  | "created"
  | "link_sent"
  | "opened"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded";

export type PaymentEventActor = "system" | "customer" | "mock_provider" | "human";

export type PaymentMethodKey = "mada" | "applepay" | "card";

export interface PaymentEvent {
  id: string;
  type: string;
  label: string;
  timestamp: number;
  actor: PaymentEventActor;
  metadata?: Record<string, unknown>;
}

export interface PaymentSession {
  id: string;
  orderId: string;
  orderNumber: string;
  conversationId?: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  currency: string;
  status: PaymentSessionStatus;
  provider: string; // "mock"
  method?: PaymentMethodKey;
  checkoutUrl: string;
  expiresAt: number;
  paidAt?: number;
  createdAt: number;
  updatedAt: number;
  events: PaymentEvent[];
}

export type PaymentStatus = "مدفوع" | "بانتظار الدفع" | "غير مدفوع" | "مسترجع";

export type FulfillmentType = "توصيل" | "استلام";

export interface OrderItem {
  name: string;
  qty: number;
  price: number;
  modifiers?: string[];
}

export interface Order {
  id: string; // e.g. "1042"
  customer: string;
  customerPhone: string;
  branch: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillment: FulfillmentType;
  total: number;
  items: OrderItem[];
  notes?: string;
  time: string; // human readable time, western digits
  createdAtMinutesAgo: number; // used for kitchen timers
  source: "WhatsApp";
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
export type ConversationStatus =
  | "AI نشط"
  | "طلب قيد البناء"
  | "بانتظار الدفع"
  | "يحتاج تدخل موظف"
  | "تم التحويل لموظف"
  | "طلب مكتمل";

export type MessageSender = "customer" | "ai" | "agent" | "human" | "system";

export type ConversationOwner = "ai" | "human";

// Intents the local rule-based engine can detect.
export type IntentType =
  | "greeting"
  | "menu_question"
  | "branch_question"
  | "working_hours"
  | "delivery_area"
  | "ingredient_allergen"
  | "create_order"
  | "modify_order"
  | "cancel_order"
  | "payment_question"
  | "order_tracking"
  | "complaint"
  | "human_request"
  | "unknown";

// Arabic-labelled knowledge sources surfaced under AI replies.
export type KnowledgeSource =
  | "المنيو"
  | "الإضافات"
  | "الفروع"
  | "مناطق التوصيل"
  | "السياسات"
  | "الأسئلة الشائعة"
  | "إعدادات النبرة";

export interface OrderEntity {
  name: string;
  quantity: number;
}

export interface ExtractedEntities {
  items: OrderEntity[];
  modifiers: string[];
  branch?: string;
  deliveryArea?: string;
  allergens: string[];
  paymentIntent: boolean;
  complaintKeywords: string[];
}

export interface DraftOrderItem {
  name: string;
  quantity: number;
  price: number;
  modifiers: string[];
}

export interface DraftOrder {
  items: DraftOrderItem[];
}

// Full output of analysing one customer message.
export interface IntentResult {
  intent: IntentType;
  confidence: number;
  entities: ExtractedEntities;
  sources: KnowledgeSource[];
  suggestedAction: string;
  reply: string;
  status: ConversationStatus;
  escalate: boolean;
  escalationReason?: string;
}

export interface IntentHistoryEntry {
  id: string;
  conversationId: string;
  messageId: string;
  detectedIntent: IntentType;
  confidence: number;
  entities: ExtractedEntities;
  sourcesUsed: KnowledgeSource[];
  suggestedAction: string;
  createdAt: number;
}

/** Per-message delivery status for OUTBOUND messages (T8). Mirrors WhatsApp
 *  semantics: sending (in flight) → sent → delivered → read; failed = not sent.
 *  Sourced from messages.status (send route sets sent/failed; T3 ingests
 *  delivered/read). Undefined for inbound/legacy rows (no indicator shown). */
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  time: string;
  status?: MessageStatus; // T8 — outbound send status (undefined ⇒ no indicator)
  createdAtMs?: number; // epoch ms, for day separators
  confidence?: number; // AI confidence 0-100 for ai messages
  intent?: IntentType;
  sources?: KnowledgeSource[];
  suggestedAction?: string;
  metadata?: Record<string, unknown>; // passthrough (e.g. WhatsApp interactive presentation)
}

export interface Conversation {
  id: string;
  customer: string; // customer display name
  customerId?: string;
  phone: string;
  avatarColor: string;
  channel: ChannelKey;
  owner: ConversationOwner;
  status: ConversationStatus;
  lastMessage: string;
  lastTime: string;
  unread: number;
  branch: string;
  messages: ChatMessage[];
  aiTyping?: boolean;
  suggestedAction?: string;
  linkedOrderId?: string;
  // AI engine working state
  aiConfidence?: number;
  currentIntent?: IntentType;
  entities?: ExtractedEntities;
  escalationReason?: string;
  draftOrder?: DraftOrder;
  // Authoritative ownership columns (read-only on the client — written only by
  // the spine via setOwnershipState / the allergen gate). Exposed here so the
  // Conversations UI can read the real safety flag instead of inferring it from
  // escalationReason text.
  ownershipState?: OwnershipState;
  isSafetyHold?: boolean;
  controlEpoch?: number;
  // MO1 — named ownership: which member (members.id) currently owns a human-handled
  // conversation. Set on takeover, cleared on return-to-AI / close. Written ONLY via
  // the server route (member resolved from the authenticated session, never the client).
  assignedMemberId?: string | null;
  // WB2 — sales-lifecycle STAGE (Be-On parity). A SEPARATE axis from ownership
  // (ownershipState) and from order status (orders.order_status, a different
  // table): a conversation can be no_answer with no order; an ordered conversation
  // still carries the order's own status on the order. Set server-side only via
  // POST /api/conversations/[id]/stage (validated + audited).
  stage?: ConversationStage;
  /** WB-FIX-1 — internal STAFF-ONLY note. Never sent to the customer, never read
   *  into Karim's prompt. Distinct from handover_note (the return-to-Karim summary
   *  that IS prompt-facing). Any staff member may add/edit. */
  staffNotes?: string | null;
  // WB3 — Meta click-to-message AD referral context, captured on the first inbound
  // from an ad (organic conversations leave these undefined). Preserved so staff
  // know which ad/campaign drove the lead; campaign analytics is deferred (P2).
  adSourceType?: string | null; // "ad" | "post"
  adSourceId?: string | null;   // the ad / post id
  adHeadline?: string | null;
  adBody?: string | null;
  adReferrerUrl?: string | null;
  adCtwaClid?: string | null;
}

/** WB2 — conversation sales-lifecycle stage; independent of ownership + order status. */
export type ConversationStage =
  | "new"
  | "asking_offer"
  | "taking_order"
  | "follow_up"
  | "no_answer"
  | "handed_to_human"
  | "ordered"
  | "closed"
  | "lost";

export const CONVERSATION_STAGES: ConversationStage[] = [
  "new", "asking_offer", "taking_order", "follow_up",
  "no_answer", "handed_to_human", "ordered", "closed", "lost",
];

export const CONVERSATION_STAGE_LABELS: Record<ConversationStage, string> = {
  new: "جديد",
  asking_offer: "يسأل عن عرض",
  taking_order: "جاري أخذ الطلب",
  follow_up: "محتاج متابعة",
  no_answer: "لا يرد",
  handed_to_human: "تم التحويل",
  ordered: "تم الطلب",
  closed: "مغلق",
  lost: "خاسر",
};

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export interface MenuCategory {
  id: string;
  name: string;
  sort: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
  /** Optional timed-out-of-stock window ("back at …"). When set in the future the
   *  item reads as unavailable; `available` already folds this in. ISO string. */
  unavailableUntil?: string | null;
  description: string;
  imageUrl: string;
  modifierIds: string[]; // references Modifier.id
  ingredients: string[];
  allergens: string[];
  /** WB-ALLERGEN-3 — when the kitchen last CONFIRMED this item's allergens (null =
   *  not yet reviewed = unknown). Set server-side via /api/menu/[id]/allergens-review;
   *  read-only here (the editor shows a reviewed/unreviewed badge from it). */
  allergensReviewedAt?: string | null;
  // --- WO-COMPANION W2: axis-2 (preparation × cross-contact) data. All OPTIONAL and
  //     deploy-safe (absent until migration 0083 is applied → mapper falls back to
  //     unknown/unverified). Consumed by computeDishTruthState via dishDataFromMenuItem. ---
  /** W2: cross-contact risk tags (controlled vocab, allergen-prep-vocab.ts). */
  crossContactRisks?: string[];
  /** W2: preparation status — 'controlled' | 'shared_risk' | 'unknown' (null ⇒ unknown). */
  prepStatus?: string | null;
  /** W2: when the kitchen last CONFIRMED this item's PREP data (null = unverified). */
  prepVerifiedAt?: string | null;
  /** W2: whether the kitchen can isolate this dish — 'yes' | 'no' | 'unknown' (optional). */
  kitchenCanIsolate?: string | null;
  /** W2: free-text preparation notes (operator hint; never asserts safety). */
  preparationNotes?: string | null;
  variants?: MenuItemVariant[];
  choiceGroups?: MenuItemChoiceGroup[];
}

export interface MenuItemVariant {
  id: string;
  name: string;
  price: number;
  sort: number;
  active: boolean;
}

export interface MenuItemChoiceOption {
  id: string;
  label: string;
  priceDelta: number;
  sort: number;
  active: boolean;
}

export interface MenuItemChoiceGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  sort: number;
  options: MenuItemChoiceOption[];
}

// ---------------------------------------------------------------------------
// Modifiers (reusable library, attached to menu items)
// ---------------------------------------------------------------------------
export interface Modifier {
  id: string;
  name: string;
  priceImpact: number; // can be 0 or positive
  category: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
export interface Branch {
  id: string;
  name: string;
  address: string;
  hours: string; // working hours
  whatsappNumber: string;
  open: boolean; // status: open/closed
  notes: string;
  // derived/legacy: whether a whatsapp number is configured
  whatsappConnected: boolean;
  phone: string;
  // Physical location (WO-DELIVERY-D1) — used for the nearest-branch tie-break when
  // a delivery pin falls inside overlapping zones. Undefined when the branch has no
  // coordinates set yet (falls back to the zone-center distance).
  lat?: number;
  lng?: number;
}

// ---------------------------------------------------------------------------
// Restaurant profile (singleton)
// ---------------------------------------------------------------------------
export interface RestaurantProfile {
  name: string;
  logoUrl: string;
  phone: string;
  email: string;
  currency: string;
  defaultLanguage: string;
  timezone: string;
  businessType: string;
}

// ---------------------------------------------------------------------------
// Delivery areas
// ---------------------------------------------------------------------------
export interface DeliveryArea {
  id: string;
  name: string;
  /** The branch this zone belongs to. Omitted/empty = restaurant-wide (all branches). */
  branchId?: string;
  minOrder: number;
  deliveryFee: number;
  estimatedTime: string; // e.g. "30-45 دقيقة"
  active: boolean;
  // Zone geometry (WO-DELIVERY-D1). A zone with a center + radius is a real circle
  // on the map used for pin→zone point-in-radius matching. Undefined until an
  // operator draws the zone in the map editor (legacy name-only zones stay valid).
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Policies (singleton, editable text per policy)
// ---------------------------------------------------------------------------
export interface Policies {
  refund: string;
  cancellation: string;
  delivery: string;
  replacement: string;
  payment: string;
}

// ---------------------------------------------------------------------------
// AI tone configuration
// ---------------------------------------------------------------------------
export type AiPersonality = "formal" | "friendly" | "premium" | "fastfood" | "luxury";
export type AiResponseLength = "short" | "medium" | "detailed";
export type AiEmojiUsage = "none" | "minimal" | "normal";
export type AiLanguage = "ar" | "en" | "bilingual";

export interface AiToneConfig {
  personality: AiPersonality;
  responseLength: AiResponseLength;
  emojiUsage: AiEmojiUsage;
  language: AiLanguage;
  greeting: string;
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------
export interface Promotion {
  id: string;
  name: string;
  offerType: string;
  startDate: string;
  endDate: string;
  conditions: string;
  active: boolean;
  aiSuggested: boolean;
  redemptions: number; // performance placeholder
}

export interface OperatorPromotion {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  code: string;
  schedule: Record<string, unknown>;
  state: string;
  spent: number;
  budgetCap: number | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export type CustomerSegment = "عميل جديد" | "عميل متكرر" | "عميل مميز" | "خامل";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  lastOrder: string;
  totalOrders: number;
  totalSpent: number;
  favoriteItem: string;
  notes: string;
  segment: CustomerSegment;
}

// ---------------------------------------------------------------------------
// Restaurant Brain (knowledge)
// ---------------------------------------------------------------------------
export type KnowledgeStatus = "complete" | "attention" | "missing";

export interface KnowledgeArea {
  key: string;
  label: string;
  score: number; // 0-100
  status: KnowledgeStatus;
  detail: string; // short human-readable explanation of the score
}

export interface KnowledgeAlert {
  id: string;
  area: string;
  message: string;
  severity: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Dashboard KPIs
// ---------------------------------------------------------------------------
export interface Kpi {
  key: string;
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
}
