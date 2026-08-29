// ============================================================================
// MaitreAI — In-chat promotion builder route (Phase 1) — SERVER ONLY
// Session-auth + role-enforced. Three actions, all in-thread (no navigation):
//   menu    → scope data (categories/items/currency) so the client builds the
//             draft + preview deterministically ($0, §P5).
//   caption → the LLM DRAFTS a short marketing caption (voice only — prices come
//             from the computed draft, never the model).
//   publish → MANAGER-ONLY; recomputes terms from the live DB menu (never trusts
//             the client), persists a promotions row state='active' (§P2).
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { loadBrain } from "@/lib/db/brain";
import { getAdapter, recordUsageEvent } from "@/lib/ai/llm";
import { dialectProfile } from "@/lib/ai/dialect";
import { computeAffected, draftToRow, offerSummary, isComplete, type PromoDraft } from "@/lib/promo";
import { renderPromoPng } from "@/lib/render/promo";
import { resolveTenantDialect } from "@/lib/ai/dialect";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  // M1.7-E — agent_runs (observability) becomes member-read-only under the RLS
  // lockdown; its inserts go through the service-role client (best-effort, never a
  // member write). Auth + promotion writes stay on the member client unchanged.
  const admin = createAdminClient();
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  const restaurantId = tenant.restaurantId;

  const body = (await req.json().catch(() => ({}))) as { action?: string; draft?: PromoDraft };
  const action = body.action ?? "menu";

  const { data: r } = await supabase.from("restaurants").select("name,dialect,country,currency").eq("id", restaurantId).single();
  const dialect = resolveTenantDialect(r as { dialect?: string | null; country?: string | null } | null, "agent.promo", restaurantId);
  const currency = String(r?.currency || dialectProfile(dialect).currencyDefault);

  // --- menu: scope options for the chips + client-side preview compute --------
  if (action === "menu") {
    const brain = await loadBrain(supabase, restaurantId);
    const items = brain.menuItems
      .filter((i) => i.available)
      .map((i) => ({ id: i.id, name: i.name, category: i.category, price: i.price }));
    const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];
    return NextResponse.json({ items, categories, currency, restaurantName: String(r?.name ?? "") });
  }

  // --- caption: LLM drafts the marketing VOICE (no prices invented) -----------
  if (action === "caption") {
    const d = body.draft ?? {};
    const dp = dialectProfile(dialect);
    const summary = offerSummary(d, currency);
    const adapter = await getAdapter();
    const system =
      `اكتب جملة تسويقية واحدة قصيرة وجذابة (سطر واحد، بحد أقصى ١٢ كلمة) لعرض مطعم باللهجة ${dp.label}. ` +
      `استخدم فقط تفاصيل العرض المعطاة ولا تخترع أي سعر أو رقم. أعد الجملة فقط بدون شرح. إيموجي واحد على الأكثر.`;
    let caption = "";
    try {
      const t0 = Date.now();
      const res = await adapter.generate({ system, messages: [{ role: "user", content: `العرض: ${summary}` }], tools: [] }, "customer_agent");
      caption = (res.text || "").trim().split("\n")[0].slice(0, 120);
      const cost = await recordUsageEvent({
        admin,
        tenantId: restaurantId,
        surface: "agent_promo.caption",
        useCase: "customer_agent",
        model: res.model,
        usage: res.usage,
        latencyMs: Date.now() - t0,
        trigger: "owner",
        meta: { action: "caption", adapter: adapter.name },
      });
      if (admin) await admin.from("agent_runs").insert({
        restaurant_id: restaurantId, trigger: "owner", input: `promo_caption:${summary}`, output: caption,
        model: res.model, adapter: adapter.name, input_tokens: res.usage.inputTokens, output_tokens: res.usage.outputTokens,
        cost_usd: cost, tokens: res.usage.inputTokens + res.usage.outputTokens, tools_used: ["promo_caption"],
      });
    } catch {
      caption = summary;
    }
    return NextResponse.json({ caption });
  }

  // --- image: branded template promo PNG from the computed draft -------------
  if (action === "image") {
    const d = body.draft ?? {};
    const brain = await loadBrain(supabase, restaurantId);
    const affected = computeAffected(brain.menuItems, d);
    const headline =
      d.offerType === "percent_off" ? `خصم ${d.amount}٪`
      : d.offerType === "amount_off" ? `خصم ${d.amount} ${currency}`
      : d.offerType === "fixed_price" ? `بسعر ${d.amount} ${currency}`
      : "اشترِ 1 واحصل على 1";
    const end = new Date(Date.now() + (d.durationDays ?? 7) * 86400000);
    const dateLabel = `ساري حتى ${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}`;
    const png = renderPromoPng({
      restaurantName: String(r?.name ?? ""),
      headline,
      scopeLabel: d.scopeLabel ? `على ${d.scopeLabel}` : "",
      caption: d.caption,
      items: affected,
      currency,
      dateLabel,
      showPrices: d.offerType !== "bogo",
    });
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  }

  // --- publish: MANAGER-ONLY, recompute authoritatively, persist (§P2) --------
  if (action === "publish") {
    if (tenant.role !== "manager") {
      return NextResponse.json({ error: "forbidden", message: "نشر العروض متاح للمدير فقط." }, { status: 403 });
    }
    const d = body.draft ?? {};
    if (!isComplete(d)) return NextResponse.json({ error: "incomplete" }, { status: 400 });

    // Recompute terms from the LIVE menu — never trust client-sent prices.
    const brain = await loadBrain(supabase, restaurantId);
    const affected = computeAffected(brain.menuItems, d);
    if (!affected.length) return NextResponse.json({ error: "no_items" }, { status: 400 });

    const row = draftToRow(d);
    const { data: ins, error } = await supabase
      .from("promotions")
      .insert({
        restaurant_id: restaurantId,
        name: row.name,
        type: row.type,
        config: { ...row.config, affected },
        schedule: row.schedule,
        state: "active",
        created_from_text: d.caption ?? null,
        created_by: tenant.userId,
      })
      .select("id, name, state")
      .single();
    if (error) return NextResponse.json({ error: "insert_failed", detail: error.message }, { status: 502 });

    if (admin) await admin.from("agent_runs").insert({
      restaurant_id: restaurantId, trigger: "owner", input: `promo_publish:${row.name}`, output: `active:${ins.id}`,
      adapter: "system", tokens: 0, cost_usd: 0, tools_used: ["promo_publish"],
    });
    return NextResponse.json({ ok: true, promo: { id: ins.id, name: ins.name, state: ins.state }, affected, currency });
  }

  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
