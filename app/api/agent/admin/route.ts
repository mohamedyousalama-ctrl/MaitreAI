// ============================================================================
// MaitreAI — Admin Agent (Amendment 05 §P, Phase 1) — SERVER ONLY
// The console's free-text brain. SESSION-authenticated + role-enforced. Free
// text → a SMALL classifier LLM (low max_tokens) that only routes: it returns
// {intent, params, sentence} as JSON — it never writes the card body. Read
// intents compute their data from the DB here (§P5: computed cards). Write
// intents return a PREVIEW only; the actual write runs on a separate confirm
// call (§P2: no write without confirmation). Every turn is logged to agent_runs.
// Fixed chips stay client-side deterministic ($0) and never hit this route.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";
import { setItemAvailabilityDb } from "@/lib/db/brain";
import { getAdapter, modelFor, costUsd } from "@/lib/ai/llm";
import type { LlmMessage } from "@/lib/ai/llm/types";

export const runtime = "nodejs";

type Role = "manager" | "operation";
const MANAGER_ONLY = new Set([
  "set_open", "set_agent", "payments_summary",
  "set_item_availability", "edit_price", "add_item", "remove_item",
  "add_modifier", "edit_modifier", "remove_modifier",
  "add_zone", "edit_zone", "remove_zone",
  "edit_policy",
]);

const ROUTER_SYSTEM = `أنت موجِّه نوايا لوحة تحكم مطعم (لست من يكتب البيانات). صنّف رسالة المدير إلى نية واحدة واستخرج المعاملات.
أعد JSON مضغوطاً فقط بالشكل: {"intent":"...","params":{...},"sentence":"جملة عربية قصيرة واحدة"}.
النوايا المسموحة:
- daily_ops (ملخص اليوم) | escalations (التصعيدات) | orders_summary (حالة/عدد الطلبات) | payments_summary (المدفوعات والمبيعات والإيرادات) | agent_health (حالة المساعد)
- set_open params:{"open":true|false} (فتح/إغلاق المطعم)
- set_agent params:{"enabled":true|false} (تشغيل/إيقاف المساعد)
- set_item_availability params:{"item":"اسم الصنف","available":true|false}
- edit_price params:{"item":"اسم الصنف","price":رقم} (تغيير سعر صنف موجود)
- add_item params:{"name":"اسم الصنف","price":رقم,"category":"التصنيف (اختياري)"} (إضافة صنف جديد للمنيو)
- remove_item params:{"item":"اسم الصنف"} (حذف صنف من المنيو)
- add_modifier params:{"name":"اسم الإضافة","price_impact":رقم,"category":"التصنيف (اختياري)"} (إضافة خيار/إضافة جديدة مثل جبنة إضافية +٥)
- edit_modifier params:{"modifier":"اسم الإضافة","price_impact":رقم} (تغيير سعر إضافة موجودة)
- remove_modifier params:{"modifier":"اسم الإضافة"} (حذف إضافة)
- add_zone params:{"name":"اسم المنطقة","fee":رقم,"min_order":رقم,"eta_minutes":رقم اختياري} (إضافة منطقة توصيل — مثل «نوصّل لمدينة نصر رسوم ١٥ الحد الأدنى ٨٠»)
- edit_zone params:{"zone":"اسم المنطقة","fee":رقم اختياري,"min_order":رقم اختياري,"eta_minutes":رقم اختياري} (تعديل منطقة توصيل)
- remove_zone params:{"zone":"اسم المنطقة"} (حذف منطقة توصيل)
- edit_policy params:{"key":"refund|cancellation|delivery|replacement|payment","text":"نص السياسة"} (كتابة/إعادة صياغة سياسة — الاسترجاع/الاسترداد=refund، الإلغاء=cancellation، التوصيل=delivery، الاستبدال=replacement، الدفع=payment)
- off_scope (إذا كان الطلب خارج تشغيل المطعم: عام/أخبار/غير متعلق) — اجعل sentence سطراً واحداً يعيد التوجيه بأدب لنطاق المطعم.
لنوايا التغيير (set_*): اجعل الجملة اقتراحاً ينتظر التأكيد (مثل «جاهز لإغلاق المطعم بعد تأكيدك») — لا تقل «تمّ» قبل التنفيذ.
لا تخترع بيانات. أعِد JSON فقط دون أي نص آخر.`;

function parseRouter(text: string): { intent: string; params: Record<string, unknown>; sentence: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return { intent: String(j.intent || "off_scope"), params: j.params || {}, sentence: String(j.sentence || "") };
  } catch {
    return null;
  }
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  // M1.7-E — agent_runs is observability and becomes member-read-only under the RLS
  // lockdown, so its inserts go through the service-role client (best-effort; never
  // a member write). Auth + config writes stay on the member client unchanged.
  const admin = createAdminClient();
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const restaurantId = tenant.restaurantId;
  const role = tenant.role as Role;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // ---- CONFIRM path: execute a previously-previewed write (no LLM) ----------
  const confirm = body.confirm as { intent: string; params: Record<string, unknown> } | undefined;
  if (confirm) {
    if (MANAGER_ONLY.has(confirm.intent) && role !== "manager") {
      return NextResponse.json({ error: "forbidden", message: "هذا الإجراء للمدير فقط." }, { status: 403 });
    }
    let result = "تم.";
    try {
      if (confirm.intent === "set_open") {
        await supabase.from("restaurants").update({ is_open: !!confirm.params.open }).eq("id", restaurantId);
        result = confirm.params.open ? "تم فتح المطعم ✅" : "تم إغلاق المطعم 🌙";
      } else if (confirm.intent === "set_agent") {
        await supabase.from("restaurants").update({ agent_mode: confirm.params.enabled ? "live" : "paused" }).eq("id", restaurantId);
        result = confirm.params.enabled ? "تم تشغيل المساعد ✅" : "تم إيقاف المساعد ⏸️";
      } else if (confirm.intent === "set_item_availability") {
        const name = String(confirm.params.item ?? "");
        const { data: items } = await supabase
          .from("menu_items")
          .select("id,name")
          .eq("restaurant_id", restaurantId)
          .ilike("name", `%${name}%`)
          .limit(1);
        const item = items?.[0];
        if (!item) return NextResponse.json({ error: "item_not_found", message: `لم أجد صنف «${name}».` }, { status: 404 });
        // Flip + write the availability audit row in one place (shared with the
        // operator one-tap toggle). source=admin_agent records the NL kitchen path.
        await setItemAvailabilityDb(supabase, restaurantId, {
          itemId: item.id as string,
          available: !!confirm.params.available,
          source: "admin_agent",
          actorUserId: tenant.userId,
          actorRole: role,
        });
        result = `${confirm.params.available ? "تم تفعيل" : "تم إيقاف"} «${item.name}».`;
      } else if (confirm.intent === "edit_price") {
        const id = String(confirm.params.id ?? "");
        const price = Number(confirm.params.price);
        if (!id || !Number.isFinite(price)) return NextResponse.json({ error: "bad_params" }, { status: 400 });
        await supabase.from("menu_items").update({ price }).eq("id", id).eq("restaurant_id", restaurantId);
        result = `تم تحديث سعر «${confirm.params.item}» إلى ${price}.`;
      } else if (confirm.intent === "add_item") {
        const name = String(confirm.params.name ?? "").trim();
        const price = Number(confirm.params.price);
        const category = String(confirm.params.category ?? "").trim();
        if (!name || !Number.isFinite(price)) return NextResponse.json({ error: "bad_params" }, { status: 400 });
        await supabase.from("menu_items").insert({ restaurant_id: restaurantId, name, price, category: category || null, available: true });
        result = `تمت إضافة «${name}» للمنيو بسعر ${price}.`;
      } else if (confirm.intent === "remove_item") {
        const id = String(confirm.params.id ?? "");
        if (!id) return NextResponse.json({ error: "bad_params" }, { status: 400 });
        await supabase.from("menu_items").delete().eq("id", id).eq("restaurant_id", restaurantId);
        result = `تم حذف «${confirm.params.item}» من المنيو.`;
      } else if (confirm.intent === "add_modifier") {
        const name = String(confirm.params.name ?? "").trim();
        const impact = Number(confirm.params.price_impact);
        const category = String(confirm.params.category ?? "").trim();
        if (!name || !Number.isFinite(impact)) return NextResponse.json({ error: "bad_params" }, { status: 400 });
        await supabase.from("modifiers").insert({ restaurant_id: restaurantId, name, price_impact: impact, category: category || "", active: true });
        result = `تمت إضافة خيار «${name}».`;
      } else if (confirm.intent === "edit_modifier") {
        const id = String(confirm.params.id ?? "");
        const impact = Number(confirm.params.price_impact);
        if (!id || !Number.isFinite(impact)) return NextResponse.json({ error: "bad_params" }, { status: 400 });
        await supabase.from("modifiers").update({ price_impact: impact }).eq("id", id).eq("restaurant_id", restaurantId);
        result = `تم تحديث قيمة «${confirm.params.modifier}» إلى ${impact}.`;
      } else if (confirm.intent === "remove_modifier") {
        const id = String(confirm.params.id ?? "");
        if (!id) return NextResponse.json({ error: "bad_params" }, { status: 400 });
        await supabase.from("modifiers").delete().eq("id", id).eq("restaurant_id", restaurantId);
        result = `تم حذف خيار «${confirm.params.modifier}».`;
      } else if (confirm.intent === "add_zone") {
        const name = String(confirm.params.name ?? "").trim();
        const fee = Number(confirm.params.fee);
        const minOrder = Number(confirm.params.min_order ?? 0);
        const eta = confirm.params.eta_minutes != null ? Number(confirm.params.eta_minutes) : null;
        if (!name || !Number.isFinite(fee)) return NextResponse.json({ error: "bad_params" }, { status: 400 });
        await supabase.from("delivery_zones").insert({ restaurant_id: restaurantId, name, fee, min_order: Number.isFinite(minOrder) ? minOrder : 0, eta_minutes: eta, active: true });
        result = `تمت إضافة منطقة التوصيل «${name}».`;
      } else if (confirm.intent === "edit_zone") {
        const id = String(confirm.params.id ?? "");
        if (!id) return NextResponse.json({ error: "bad_params" }, { status: 400 });
        await supabase.from("delivery_zones").update({ fee: Number(confirm.params.fee), min_order: Number(confirm.params.min_order), eta_minutes: confirm.params.eta_minutes != null ? Number(confirm.params.eta_minutes) : null }).eq("id", id).eq("restaurant_id", restaurantId);
        result = `تم تحديث منطقة «${confirm.params.zone}».`;
      } else if (confirm.intent === "remove_zone") {
        const id = String(confirm.params.id ?? "");
        if (!id) return NextResponse.json({ error: "bad_params" }, { status: 400 });
        await supabase.from("delivery_zones").delete().eq("id", id).eq("restaurant_id", restaurantId);
        result = `تم حذف منطقة «${confirm.params.zone}».`;
      } else if (confirm.intent === "edit_policy") {
        const key = String(confirm.params.key ?? "");
        const text = String(confirm.params.text ?? "").trim();
        const LABELS: Record<string, string> = { refund: "الاسترجاع", cancellation: "الإلغاء", delivery: "التوصيل", replacement: "الاستبدال", payment: "الدفع" };
        if (!LABELS[key] || !text) return NextResponse.json({ error: "bad_params" }, { status: 400 });
        await supabase.from("policies").upsert({ restaurant_id: restaurantId, key, text }, { onConflict: "restaurant_id,key" });
        result = `تم تحديث سياسة ${LABELS[key]}.`;
      } else {
        return NextResponse.json({ error: "unknown_action" }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: "write_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
    if (admin) await admin.from("agent_runs").insert({
      restaurant_id: restaurantId, trigger: "owner", input: `confirm:${confirm.intent}`, output: result, adapter: "system", tokens: 0, cost_usd: 0,
    });
    return NextResponse.json({ result });
  }

  // ---- CLASSIFY path: free text → router LLM → read card or write preview ----
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const t0 = Date.now();
  const adapter = await getAdapter();
  const messages: LlmMessage[] = [{ role: "user", content: text }];
  const res = await adapter.generate({ system: ROUTER_SYSTEM, messages, maxTokens: 300 }, "admin_parse");
  const cfg = modelFor("admin_parse");
  const cost = costUsd(cfg, res.usage.inputTokens, res.usage.outputTokens);
  const parsed = parseRouter(res.text) ?? { intent: "off_scope", params: {}, sentence: "أساعدك في تشغيل مطعمك فقط." };

  // Log the admin turn (per-surface cost visibility, §P5).
  if (admin) await admin.from("agent_runs").insert({
    restaurant_id: restaurantId, trigger: "owner", input: text, output: parsed.sentence,
    model: res.model, adapter: adapter.name, input_tokens: res.usage.inputTokens, output_tokens: res.usage.outputTokens,
    cache_read_tokens: res.usage.cacheReadTokens, cost_usd: cost, latency_ms: Date.now() - t0,
    tokens: res.usage.inputTokens + res.usage.outputTokens, tools_used: [parsed.intent],
  });

  const intent = parsed.intent;

  // Role guards.
  if (MANAGER_ONLY.has(intent) && role !== "manager") {
    return NextResponse.json({ sentence: "هذا الإجراء متاح للمدير فقط.", intent: "off_scope" });
  }

  // Read intents → compute the card body from the DB.
  if (intent === "daily_ops" || intent === "orders_summary" || intent === "payments_summary") {
    const since = startOfToday();
    const { data: orders } = await supabase
      .from("orders")
      .select("order_status,payment_status,total,created_at")
      .eq("restaurant_id", restaurantId);
    const rows = (orders ?? []) as { order_status: string; payment_status: string; total: number; created_at: string }[];
    const today = rows.filter((o) => new Date(o.created_at).getTime() >= since);
    const revenue = today.filter((o) => o.payment_status === "paid").reduce((s, o) => s + Number(o.total || 0), 0);
    const byStage: Record<string, number> = {};
    for (const o of rows) byStage[o.order_status] = (byStage[o.order_status] || 0) + 1;
    return NextResponse.json({
      sentence: parsed.sentence,
      card: { type: intent === "payments_summary" ? "payments" : "daily_ops", data: { ordersToday: today.length, revenue, byStage } },
    });
  }
  if (intent === "escalations") {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id,status,owner")
      .eq("restaurant_id", restaurantId);
    const list = (convs ?? []) as { status: string; owner: string }[];
    const count = list.filter((c) => c.owner === "human" || c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف").length;
    return NextResponse.json({ sentence: parsed.sentence, card: { type: "escalations", data: { count } } });
  }
  if (intent === "agent_health") {
    const { data: runs } = await supabase
      .from("agent_runs")
      .select("cost_usd,latency_ms,created_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", new Date(startOfToday()).toISOString());
    const r = (runs ?? []) as { cost_usd: number; latency_ms: number }[];
    const cost = r.reduce((s, x) => s + Number(x.cost_usd || 0), 0);
    const avgLatency = r.length ? Math.round(r.reduce((s, x) => s + Number(x.latency_ms || 0), 0) / r.length) : 0;
    return NextResponse.json({ sentence: parsed.sentence, card: { type: "agent_health", data: { turns: r.length, cost, avgLatency } } });
  }

  // Write intents → PREVIEW only (execution requires a confirm call).
  if (intent === "set_open" || intent === "set_agent" || intent === "set_item_availability") {
    const { data: r } = await supabase.from("restaurants").select("is_open,agent_mode").eq("id", restaurantId).single();
    const row = (r ?? {}) as { is_open?: boolean; agent_mode?: string };
    if (intent === "set_open") {
      const after = !!parsed.params.open;
      return NextResponse.json({
        sentence: parsed.sentence,
        preview: { intent, params: { open: after }, label: "حالة المطعم", before: row.is_open ? "مفتوح" : "مغلق", after: after ? "مفتوح" : "مغلق" },
      });
    }
    if (intent === "set_agent") {
      const after = !!parsed.params.enabled;
      const cur = row.agent_mode === "paused" ? "متوقف" : "يعمل";
      return NextResponse.json({
        sentence: parsed.sentence,
        preview: { intent, params: { enabled: after }, label: "المساعد", before: cur, after: after ? "يعمل" : "متوقف" },
      });
    }
    // set_item_availability
    const name = String(parsed.params.item ?? "");
    const { data: items } = await supabase.from("menu_items").select("id,name,available").eq("restaurant_id", restaurantId).ilike("name", `%${name}%`).limit(1);
    const item = items?.[0] as { name: string; available: boolean } | undefined;
    if (!item) return NextResponse.json({ sentence: `لم أجد صنف «${name}» في المنيو.`, intent: "off_scope" });
    const after = !!parsed.params.available;
    return NextResponse.json({
      sentence: parsed.sentence,
      preview: { intent, params: { item: item.name, available: after }, label: `توفّر «${item.name}»`, before: item.available ? "متوفر" : "غير متوفر", after: after ? "متوفر" : "غير متوفر" },
    });
  }

  // Menu price/CRUD write intents → PREVIEW only (§P2). Money from DB.
  if (intent === "edit_price" || intent === "add_item" || intent === "remove_item") {
    const { data: rr } = await supabase.from("restaurants").select("currency,dialect").eq("id", restaurantId).single();
    const cur = String(rr?.currency || (rr?.dialect === "saudi" ? "ر.س" : "ج.م"));
    if (intent === "edit_price") {
      const name = String(parsed.params.item ?? "");
      const price = Number(parsed.params.price);
      if (!name || !Number.isFinite(price)) return NextResponse.json({ sentence: "حدّد الصنف والسعر الجديد من فضلك.", intent: "off_scope" });
      const { data: items } = await supabase.from("menu_items").select("id,name,price").eq("restaurant_id", restaurantId).ilike("name", `%${name}%`).limit(1);
      const item = items?.[0] as { id: string; name: string; price: number } | undefined;
      if (!item) return NextResponse.json({ sentence: `لم أجد صنف «${name}» في المنيو.`, intent: "off_scope" });
      return NextResponse.json({
        sentence: parsed.sentence,
        preview: { intent, params: { id: item.id, item: item.name, price }, label: `سعر «${item.name}»`, before: `${item.price} ${cur}`, after: `${price} ${cur}` },
      });
    }
    if (intent === "add_item") {
      const name = String(parsed.params.name ?? "").trim();
      const price = Number(parsed.params.price);
      const category = String(parsed.params.category ?? "").trim();
      if (!name || !Number.isFinite(price)) return NextResponse.json({ sentence: "حدّد اسم الصنف وسعره من فضلك.", intent: "off_scope" });
      return NextResponse.json({
        sentence: parsed.sentence,
        preview: { intent, params: { name, price, category }, label: "إضافة صنف", before: "—", after: `${name} · ${price} ${cur}${category ? ` · ${category}` : ""}` },
      });
    }
    // remove_item
    const name = String(parsed.params.item ?? "");
    const { data: items } = await supabase.from("menu_items").select("id,name").eq("restaurant_id", restaurantId).ilike("name", `%${name}%`).limit(1);
    const item = items?.[0] as { id: string; name: string } | undefined;
    if (!item) return NextResponse.json({ sentence: `لم أجد صنف «${name}» في المنيو.`, intent: "off_scope" });
    return NextResponse.json({
      sentence: parsed.sentence,
      preview: { intent, params: { id: item.id, item: item.name }, label: "حذف صنف", before: item.name, after: "محذوف" },
    });
  }

  // Modifier (add-on / option) write intents → PREVIEW only (§P2).
  if (intent === "add_modifier" || intent === "edit_modifier" || intent === "remove_modifier") {
    const { data: rr } = await supabase.from("restaurants").select("currency,dialect").eq("id", restaurantId).single();
    const cur = String(rr?.currency || (rr?.dialect === "saudi" ? "ر.س" : "ج.م"));
    const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    if (intent === "add_modifier") {
      const name = String(parsed.params.name ?? "").trim();
      const impact = Number(parsed.params.price_impact);
      const category = String(parsed.params.category ?? "").trim();
      if (!name || !Number.isFinite(impact)) return NextResponse.json({ sentence: "حدّد اسم الإضافة وقيمتها من فضلك.", intent: "off_scope" });
      return NextResponse.json({
        sentence: parsed.sentence,
        preview: { intent, params: { name, price_impact: impact, category }, label: "إضافة خيار", before: "—", after: `${name} · ${signed(impact)} ${cur}` },
      });
    }
    const name = String(parsed.params.modifier ?? "");
    const { data: mods } = await supabase.from("modifiers").select("id,name,price_impact").eq("restaurant_id", restaurantId).ilike("name", `%${name}%`).limit(1);
    const mod = mods?.[0] as { id: string; name: string; price_impact: number } | undefined;
    if (!mod) return NextResponse.json({ sentence: `لم أجد إضافة باسم «${name}».`, intent: "off_scope" });
    if (intent === "edit_modifier") {
      const impact = Number(parsed.params.price_impact);
      if (!Number.isFinite(impact)) return NextResponse.json({ sentence: "حدّد القيمة الجديدة للإضافة.", intent: "off_scope" });
      return NextResponse.json({
        sentence: parsed.sentence,
        preview: { intent, params: { id: mod.id, modifier: mod.name, price_impact: impact }, label: `قيمة «${mod.name}»`, before: `${signed(mod.price_impact)} ${cur}`, after: `${signed(impact)} ${cur}` },
      });
    }
    // remove_modifier
    return NextResponse.json({
      sentence: parsed.sentence,
      preview: { intent, params: { id: mod.id, modifier: mod.name }, label: "حذف خيار", before: mod.name, after: "محذوف" },
    });
  }

  // Delivery-zone write intents → PREVIEW only (§P2). The router LLM is the
  // sentence parser («نوصّل لـ…، رسوم…، الحد الأدنى…»).
  if (intent === "add_zone" || intent === "edit_zone" || intent === "remove_zone") {
    const { data: rr } = await supabase.from("restaurants").select("currency,dialect").eq("id", restaurantId).single();
    const cur = String(rr?.currency || (rr?.dialect === "saudi" ? "ر.س" : "ج.م"));
    if (intent === "add_zone") {
      const name = String(parsed.params.name ?? "").trim();
      const fee = Number(parsed.params.fee);
      const minOrder = Number(parsed.params.min_order ?? 0);
      const eta = parsed.params.eta_minutes != null ? Number(parsed.params.eta_minutes) : null;
      if (!name || !Number.isFinite(fee)) return NextResponse.json({ sentence: "حدّد اسم المنطقة ورسوم التوصيل من فضلك.", intent: "off_scope" });
      const etaStr = eta ? ` · ${eta} دقيقة` : "";
      return NextResponse.json({
        sentence: parsed.sentence,
        preview: { intent, params: { name, fee, min_order: Number.isFinite(minOrder) ? minOrder : 0, eta_minutes: eta }, label: "منطقة توصيل", before: "—", after: `${name} · رسوم ${fee} ${cur} · الحد الأدنى ${Number.isFinite(minOrder) ? minOrder : 0} ${cur}${etaStr}` },
      });
    }
    const zname = String(parsed.params.zone ?? "");
    const { data: zones } = await supabase.from("delivery_zones").select("id,name,fee,min_order,eta_minutes").eq("restaurant_id", restaurantId).ilike("name", `%${zname}%`).limit(1);
    const zone = zones?.[0] as { id: string; name: string; fee: number; min_order: number; eta_minutes: number | null } | undefined;
    if (!zone) return NextResponse.json({ sentence: `لم أجد منطقة توصيل باسم «${zname}».`, intent: "off_scope" });
    if (intent === "edit_zone") {
      const fee = parsed.params.fee != null ? Number(parsed.params.fee) : zone.fee;
      const minOrder = parsed.params.min_order != null ? Number(parsed.params.min_order) : zone.min_order;
      const eta = parsed.params.eta_minutes != null ? Number(parsed.params.eta_minutes) : zone.eta_minutes;
      const fmt = (f: number, m: number, e: number | null) => `رسوم ${f} ${cur} · الحد الأدنى ${m} ${cur}${e ? ` · ${e} دقيقة` : ""}`;
      return NextResponse.json({
        sentence: parsed.sentence,
        preview: { intent, params: { id: zone.id, zone: zone.name, fee, min_order: minOrder, eta_minutes: eta }, label: `منطقة «${zone.name}»`, before: fmt(zone.fee, zone.min_order, zone.eta_minutes), after: fmt(fee, minOrder, eta) },
      });
    }
    // remove_zone
    return NextResponse.json({
      sentence: parsed.sentence,
      preview: { intent, params: { id: zone.id, zone: zone.name }, label: "حذف منطقة توصيل", before: zone.name, after: "محذوف" },
    });
  }

  // Policy write intent → PREVIEW only (§P2). The agent quotes/abides by these.
  if (intent === "edit_policy") {
    const KEYS = ["refund", "cancellation", "delivery", "replacement", "payment"];
    const LABELS: Record<string, string> = { refund: "الاسترجاع", cancellation: "الإلغاء", delivery: "التوصيل", replacement: "الاستبدال", payment: "الدفع" };
    const key = String(parsed.params.key ?? "");
    const text = String(parsed.params.text ?? "").trim();
    if (!KEYS.includes(key) || !text) return NextResponse.json({ sentence: "حدّد نوع السياسة ونصّها (مثل: سياسة الاسترجاع: ...).", intent: "off_scope" });
    const { data: pol } = await supabase.from("policies").select("text").eq("restaurant_id", restaurantId).eq("key", key).maybeSingle();
    const cur = (pol?.text as string | undefined) ?? "";
    const trunc = (s: string) => (s.length > 70 ? `${s.slice(0, 69)}…` : s || "—");
    return NextResponse.json({
      sentence: parsed.sentence,
      preview: { intent, params: { key, text }, label: `سياسة ${LABELS[key]}`, before: trunc(cur), after: trunc(text) },
    });
  }

  // off-scope (or unrecognized) → one-line redirect.
  return NextResponse.json({ sentence: parsed.sentence || "أقدر أساعدك في تشغيل مطعمك: الطلبات، التصعيدات، المنيو، حالة المطعم.", intent: "off_scope" });
}
