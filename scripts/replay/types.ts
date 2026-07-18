export type ReplayRole = "customer" | "ai" | "human" | "system";

export interface ReplayTurn {
  role?: ReplayRole;
  sender?: ReplayRole;
  text: string;
  channel?: "whatsapp" | string;
  wa_profile_name?: string | null;
  phone?: string | null;
  address?: string | null;
  meta?: Record<string, unknown>;
}

export interface ReplayExpectedItem {
  name: string;
  quantity: number;
}

export interface ReplayExpected {
  order_created: boolean;
  items: ReplayExpectedItem[];
  allergy_hold: boolean;
  handoff: boolean;
}

export interface ReplayRecord {
  id: string;
  source: "synthetic" | "sweet_shop_export" | "wesaya_import" | string;
  tags: string[];
  conversation: ReplayTurn[];
  expected: ReplayExpected;
}

export interface DeidentifyResult {
  lines: string[];
  map: Record<string, string>;
}
