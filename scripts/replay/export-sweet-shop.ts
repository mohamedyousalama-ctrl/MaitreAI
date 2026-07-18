import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { deidentifyJsonl } from "./deidentify";
import type { ReplayExpectedItem, ReplayRecord, ReplayTurn } from "./types";

const TENANT_PREFIX = process.env.REPLAY_TENANT_PREFIX ?? "9244d8ef";
const OUT = process.env.REPLAY_OUT ?? "scripts/replay/corpus/seed-v0.jsonl";
const MAP_OUT = process.env.REPLAY_MAP_OUT ?? "scripts/replay/private/sweet-shop-map.json";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function hasCredentials(): boolean {
  return !!(env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL")) && !!env("SUPABASE_SERVICE_ROLE_KEY");
}

function classifyText(text: string): string[] {
  const tags = new Set<string>();
  if (/حساسي|حساسية|فول سوداني|مكسرات|لبن|حليب|ألبان|البان|جلوتين|غلوتين|بيض|egg|dairy|peanut|nuts|gluten/i.test(text)) tags.add("allergy");
  if (/موظف|انسان|إنسان|ادارة|مدير|human|agent|manager/i.test(text)) tags.add("handoff");
  if (/الغ[يى]|إلغاء|الغي|كنسل|cancel|امسح الطلب/i.test(text)) tags.add("cancel");
  if (/بدل|غير|غيّر|شيل|زود|خليها|remove|change/i.test(text)) tags.add("modification");
  return [...tags];
}

function expectedItemsFromOrders(orders: Array<{ items?: unknown }>): ReplayExpectedItem[] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (!Array.isArray(order.items)) continue;
    for (const item of order.items as Array<{ name?: unknown; quantity?: unknown }>) {
      const name = String(item.name ?? "").trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + Number(item.quantity ?? 1));
    }
  }
  return [...counts.entries()].map(([name, quantity]) => ({ name, quantity }));
}

async function main(): Promise<void> {
  if (!hasCredentials()) {
    console.error("Sweet Shop export skipped: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(2);
  }

  const url = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: restaurants, error: restaurantError } = await admin.from("restaurants").select("id").limit(1000);
  if (restaurantError) throw restaurantError;
  const restaurantId = (restaurants ?? []).map((row) => String(row.id)).find((id) => id.startsWith(TENANT_PREFIX));
  if (!restaurantId) throw new Error(`No restaurant id found for prefix ${TENANT_PREFIX}`);

  const { data: conversations, error: convError } = await admin
    .from("conversations")
    .select("id, customer_id, status, owner, escalation_reason, is_safety_hold, created_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (convError) throw convError;

  const records: ReplayRecord[] = [];
  for (const conv of conversations ?? []) {
    const conversationId = String(conv.id);
    const [{ data: messages, error: msgError }, { data: orders, error: orderError }, { data: customer, error: customerError }] =
      await Promise.all([
        admin
          .from("messages")
          .select("sender, text, meta, created_at")
          .eq("restaurant_id", restaurantId)
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(80),
        admin
          .from("orders")
          .select("items")
          .eq("restaurant_id", restaurantId)
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
        conv.customer_id
          ? admin.from("customers").select("phone, name").eq("restaurant_id", restaurantId).eq("id", conv.customer_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
    if (msgError) throw msgError;
    if (orderError) throw orderError;
    if (customerError) throw customerError;

    const turns: ReplayTurn[] = (messages ?? [])
      .filter((message) => typeof message.text === "string" && String(message.text).trim())
      .map((message) => ({
        role: message.sender === "customer" ? "customer" : "ai",
        text: String(message.text ?? ""),
        channel: "whatsapp",
        phone: (customer as { phone?: string } | null)?.phone ?? null,
        wa_profile_name: (customer as { name?: string } | null)?.name ?? null,
        meta: message.meta as Record<string, unknown> | null ?? {},
      }));
    const combinedText = turns.map((turn) => turn.text).join("\n");
    const tags = new Set(classifyText(combinedText));
    if ((orders ?? []).length) tags.add((orders ?? []).length > 1 ? "multi_item" : "clean_order");
    if (conv.owner === "human" || conv.escalation_reason) tags.add("handoff");

    records.push({
      id: `sweet-shop-${records.length + 1}`,
      source: "sweet_shop_export",
      tags: [...tags].sort(),
      conversation: turns,
      expected: {
        order_created: (orders ?? []).length > 0,
        items: expectedItemsFromOrders((orders ?? []) as Array<{ items?: unknown }>),
        allergy_hold: Boolean((conv as { is_safety_hold?: boolean | null }).is_safety_hold) || tags.has("allergy"),
        handoff: tags.has("handoff"),
      },
    });
  }

  const selected = records
    .sort((a, b) => {
      const score = (r: ReplayRecord) =>
        (r.tags.includes("allergy") ? 8 : 0) +
        (r.tags.includes("handoff") ? 4 : 0) +
        (r.tags.includes("cancel") ? 3 : 0) +
        (r.tags.includes("modification") ? 2 : 0) +
        (r.expected.order_created ? 1 : 0);
      return score(b) - score(a);
    })
    .slice(0, 30);

  const rawJsonl = selected.map((record) => JSON.stringify(record)).join("\n");
  const deid = deidentifyJsonl(rawJsonl);
  const outPath = path.resolve(OUT);
  if (!outPath.startsWith(`${path.resolve("scripts/replay/corpus")}${path.sep}`)) {
    throw new Error("REPLAY_OUT must be inside scripts/replay/corpus");
  }
  mkdirSync(path.dirname(outPath), { recursive: true });
  mkdirSync(path.dirname(path.resolve(MAP_OUT)), { recursive: true });
  writeFileSync(outPath, `${deid.lines.join("\n")}\n`);
  writeFileSync(path.resolve(MAP_OUT), `${JSON.stringify({ entries: deid.map }, null, 2)}\n`);

  const tagCounts = selected.reduce<Record<string, number>>((acc, record) => {
    for (const tag of record.tags) acc[tag] = (acc[tag] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Sweet Shop export complete: conversations_read=${records.length} selected=${selected.length} out=${OUT}`);
  console.log(`tag_counts=${JSON.stringify(tagCounts)}`);
}

main().catch((e) => {
  console.error(`Sweet Shop export failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
