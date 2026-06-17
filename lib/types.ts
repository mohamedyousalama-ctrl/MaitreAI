// ============================================================================
// MaitreAI — Shared TypeScript types
// All domain models used across the app. Mock data conforms to these shapes so
// later sprints can swap the data source without touching the UI layer.
// ============================================================================

// Channel model lives in the messaging layer (Sprint 6); re-used here so a
// conversation can record which channel it originated from.
import type { ChannelKey } from "./messaging/types";
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
  source: "whatsapp";
  branchId?: string;
  branchName: string;
  fulfillmentType: FulfillmentKey;
  deliveryAreaId?: string;
  deliveryAddress?: string;
  items: LocalOrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  paymentStatus: PaymentStatusKey;
  orderStatus: OrderStatusKey;
  kitchenStatus: KitchenStatusKey;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  events: OrderEvent[];
}

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

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  time: string;
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
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
  description: string;
  imageUrl: string;
  modifierIds: string[]; // references Modifier.id
  ingredients: string[];
  allergens: string[];
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
  deliveryZones: string[];
  open: boolean; // status: open/closed
  notes: string;
  // derived/legacy: whether a whatsapp number is configured
  whatsappConnected: boolean;
  phone: string;
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
