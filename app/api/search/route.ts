// ============================================================================
// MaitreAI — SR1 global console search — SERVER ONLY, session-authenticated.
// GET /api/search?q= → grouped results { orders, customers, conversations },
// tenant-scoped (mirrors /api/cod/ledger: createClient + getServerTenant + every
// query .eq("restaurant_id", tenant.restaurantId), RLS-scoped).
//
// Input-control: every match uses the Supabase query builder's .ilike(column,
// pattern) with a BOUND pattern value — never string-concatenated SQL and never a
// .or() filter string built from user input. LIKE wildcards in the query are
// escaped so user input is matched literally. Min 2 chars; capped per group.
//
// Phone normalization (the must-fix): the query is reduced to its national
// significant digits (strip EG "20" / SA "966" country code + trunk "0") and the
// stored phone is SUFFIX-matched on that tail — so 010…, +2010…, 2010… (and
// +966…/966…/05…) all resolve to the same customer WITHOUT a schema change
// (normalize-in-query via suffix match on the raw stored value).
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_GROUP = 8;

/** Escape LIKE wildcards so user input matches literally (Postgres LIKE escape = \). */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** National significant digits of a phone-like query (country-aware: EG 20 / SA 966
 *  + trunk 0). Suffix-matching on this catches every stored format. */
function phoneTail(digits: string): string {
  let d = digits;
  if (d.startsWith("20") && d.length === 12) d = d.slice(2); // 201XXXXXXXXX → 1XXXXXXXXX
  else if (d.startsWith("966") && d.length === 12) d = d.slice(3); // 9665XXXXXXXX → 5XXXXXXXX
  else if (d.startsWith("0")) d = d.replace(/^0+/, ""); // local trunk 01XXXXXXXXX → 1XXXXXXXXX
  return d;
}

function dedupeCap<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    if (out.length >= PER_GROUP) break;
  }
  return out;
}

export async function GET(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  const rid = tenant.restaurantId;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, orders: [], customers: [], conversations: [] });

  const like = `%${escapeLike(q)}%`;
  const digits = q.replace(/\D/g, "");
  const phonePattern = digits.length >= 7 ? `%${phoneTail(digits)}` : digits.length >= 4 ? `%${digits}%` : null;

  // ── Customers — name ilike OR phone suffix (separate bound .ilike() queries). ──
  const [byName, byPhone] = await Promise.all([
    supabase.from("customers").select("id,name,phone").eq("restaurant_id", rid).ilike("name", like).limit(PER_GROUP),
    phonePattern
      ? supabase.from("customers").select("id,name,phone").eq("restaurant_id", rid).ilike("phone", phonePattern).limit(PER_GROUP)
      : Promise.resolve({ data: [] as { id: string; name: string | null; phone: string | null }[] }),
  ]);
  const customers = dedupeCap([...(byName.data ?? []), ...(byPhone.data ?? [])] as { id: string; name: string | null; phone: string | null }[]);
  const custIds = customers.map((c) => c.id);

  // ── Orders — order_number ilike OR belongs to a matched customer. ──
  const [ordByNum, ordByCust] = await Promise.all([
    supabase
      .from("orders")
      .select("id,order_number,total,currency,customers(name)")
      .eq("restaurant_id", rid)
      .ilike("order_number", like)
      .order("created_at", { ascending: false })
      .limit(PER_GROUP),
    custIds.length
      ? supabase
          .from("orders")
          .select("id,order_number,total,currency,customers(name)")
          .eq("restaurant_id", rid)
          .in("customer_id", custIds)
          .order("created_at", { ascending: false })
          .limit(PER_GROUP)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const orders = dedupeCap([...(ordByNum.data ?? []), ...(ordByCust.data ?? [])] as { id: string; [k: string]: unknown }[]).map((o) => ({
    id: o.id as string,
    orderNumber: (o.order_number as string) ?? "",
    customerName: (o.customers as { name?: string } | null)?.name ?? null,
    total: o.total ?? null,
    currency: o.currency ?? null,
  }));

  // ── Conversations — match a recent message's text OR belong to a matched customer. ──
  const { data: msgHits } = await supabase
    .from("messages")
    .select("conversation_id,text")
    .eq("restaurant_id", rid)
    .ilike("text", like)
    .order("created_at", { ascending: false })
    .limit(PER_GROUP * 3);
  const convIdsFromMsgs = [...new Set(((msgHits ?? []) as { conversation_id: string }[]).map((m) => m.conversation_id))];
  const snippetByConv = new Map<string, string>();
  for (const m of (msgHits ?? []) as { conversation_id: string; text: string | null }[]) {
    if (!snippetByConv.has(m.conversation_id) && m.text) snippetByConv.set(m.conversation_id, m.text);
  }
  const convFilterIds = convIdsFromMsgs; // conversations matched via a recent message's text
  const [convByMsg, convByCust] = await Promise.all([
    convFilterIds.length
      ? supabase.from("conversations").select("id,customer_id,customers(name,phone)").eq("restaurant_id", rid).in("id", convFilterIds).limit(PER_GROUP)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    custIds.length
      ? supabase.from("conversations").select("id,customer_id,customers(name,phone)").eq("restaurant_id", rid).in("customer_id", custIds).limit(PER_GROUP)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const conversations = dedupeCap([...(convByMsg.data ?? []), ...(convByCust.data ?? [])] as { id: string; [k: string]: unknown }[]).map((c) => {
    const cust = (c.customers as { name?: string; phone?: string } | null) ?? {};
    return {
      id: c.id as string,
      customerName: cust.name || cust.phone || "عميل",
      snippet: snippetByConv.get(c.id as string) ?? null,
    };
  });

  return NextResponse.json({ ok: true, orders, customers, conversations });
}
