// ============================================================================
// MaitreAI — Owner recommendations (Learning System Piece 5) — SERVER ONLY
// Proactive, GROUNDED business advice for the owner, computed deterministically
// from REAL data (pending insights + order history). Every recommendation cites
// the signal it's based on (a count/trend/insight). Suggest-only: it PROPOSES an
// action — the owner still acts via the normal confirm-before-write ops path.
// Truth-driven: no real signal → no advice (returns []). Cheap: pure DB compute,
// no LLM call.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OwnerRecommendation {
  type: "demand_gap" | "popular_item" | "slow_item" | "day_trend";
  text: string;   // the suggestion (suggest-only phrasing)
  signal: string; // the real data it is grounded in (cited)
}

const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MIN_ORDERS_FOR_TRENDS = 5; // below this, order-based advice isn't meaningful

export async function generateOwnerRecommendations(
  admin: SupabaseClient,
  restaurantId: string
): Promise<OwnerRecommendation[]> {
  const recs: OwnerRecommendation[] = [];

  // 1. Demand gaps from pending insights (Pieces 2–3) — grounded in evidence.
  const { data: insights } = await admin
    .from("brain_insights")
    .select("summary,evidence")
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(2);
  for (const ins of (insights ?? []) as { summary: string; evidence: Record<string, unknown> }[]) {
    const count = Number(ins.evidence?.count ?? 0);
    recs.push({
      type: "demand_gap",
      text: `${ins.summary} — تفكر تعالجها أو تضيف ما ينقص؟`,
      signal: count ? `${count} إشارة من محادثات العملاء` : "نمط متكرّر في المحادثات",
    });
  }

  // 2. Order-history signals — only with enough orders to be meaningful.
  const { data: orders } = await admin
    .from("orders")
    .select("items,created_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(300);
  const os = (orders ?? []) as { items?: { name: string; quantity?: number }[]; created_at: string }[];

  if (os.length >= MIN_ORDERS_FOR_TRENDS) {
    const freq = new Map<string, number>();
    for (const o of os) for (const it of o.items ?? []) freq.set(it.name, (freq.get(it.name) ?? 0) + Number(it.quantity ?? 1));
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);

    if (sorted.length) {
      const [topName, topN] = sorted[0];
      recs.push({ type: "popular_item", text: `«${topName}» الأكثر طلباً — تبرزه أو تعمل كومبو حوله؟`, signal: `طُلب ${topN} مرة` });

      // Slowest AVAILABLE menu item (an offering that isn't moving) — cite its count.
      const { data: menu } = await admin.from("menu_items").select("name").eq("restaurant_id", restaurantId).eq("available", true);
      const slow = ((menu ?? []) as { name: string }[])
        .map((m) => ({ name: m.name, n: freq.get(m.name) ?? 0 }))
        .sort((a, b) => a.n - b.n)[0];
      if (slow && slow.n < topN) {
        recs.push({ type: "slow_item", text: `«${slow.name}» مبيعاته ضعيفة — تجرب عرضاً أو كومبو يحرّكه؟`, signal: slow.n === 0 ? "لم يُطلب ضمن آخر الطلبات" : `طُلب ${slow.n} مرة فقط` });
      }
    }

    // Day-of-week trend — only when there's a real spread.
    const byDay = new Array(7).fill(0);
    for (const o of os) byDay[new Date(o.created_at).getDay()]++;
    const maxN = Math.max(...byDay);
    const min = byDay.map((n, i) => ({ n, i })).sort((a, b) => a.n - b.n)[0];
    if (maxN >= 3 && min.n < maxN) {
      recs.push({ type: "day_trend", text: `مبيعاتك أقل يوم ${DAYS_AR[min.i]} — تجرب عرضاً في ذلك اليوم؟`, signal: `${min.n} طلب يوم ${DAYS_AR[min.i]} مقابل ${maxN} في أعلى يوم` });
    }
  }

  return recs.slice(0, 4);
}
