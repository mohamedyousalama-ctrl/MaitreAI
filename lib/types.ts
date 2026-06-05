// ============================================================================
// MaitreAI — Shared TypeScript types
// All domain models used across the app. Mock data conforms to these shapes so
// later sprints can swap the data source without touching the UI layer.
// ============================================================================

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
// Orders
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
  | "بانتظار الدفع"
  | "يحتاج تدخل موظف"
  | "تم التحويل لموظف"
  | "طلب مكتمل";

export type MessageSender = "customer" | "ai" | "agent" | "system";

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  time: string;
  confidence?: number; // AI confidence 0-100 for ai messages
}

export interface Conversation {
  id: string;
  customer: string;
  phone: string;
  avatarColor: string;
  status: ConversationStatus;
  lastMessage: string;
  lastTime: string;
  unread: number;
  branch: string;
  messages: ChatMessage[];
  aiTyping?: boolean;
  suggestedAction?: string;
  linkedOrderId?: string;
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
  modifiers: string[];
  ingredients: string[];
  allergens: string[];
  aiReadiness: number; // 0-100 placeholder score
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
export interface Branch {
  id: string;
  name: string;
  address: string;
  hours: string;
  deliveryZones: string[];
  whatsappConnected: boolean;
  open: boolean;
  phone: string;
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
export interface KnowledgeArea {
  key: string;
  label: string;
  score: number; // 0-100
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
