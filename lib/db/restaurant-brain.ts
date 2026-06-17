// ============================================================================
// MaitreAI — Restaurant Brain (Learning System Piece 1) — SERVER ONLY
// The shared MEMORY layer both agents read and the owner agent writes. These are
// KNOWLEDGE facts (preferences, policies, operational notes, learned answers) —
// NOT a source of prices or live availability. Money/stock ALWAYS come from the
// menu/tools; the brain only adds context. Token-efficient: callers inject only
// active facts, compactly.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BRAIN_CATEGORIES = [
  "menu_gap",
  "delivery",
  "customer_preference",
  "policy",
  "operations",
  "other",
] as const;
export type BrainCategory = (typeof BRAIN_CATEGORIES)[number];
export type BrainSource = "analysis" | "owner_answer" | "manual";

export interface BrainFact {
  id: string;
  category: string;
  fact: string;
  source: string;
}

const MAX_FACTS = 40; // keep prompt injection bounded

/**
 * Load the restaurant's ACTIVE brain facts in a compact form, ready to inject
 * into an agent's context. Read-only; never returns prices/availability.
 */
export async function loadRestaurantBrain(
  admin: SupabaseClient,
  restaurantId: string,
  opts?: { limit?: number; categories?: BrainCategory[] }
): Promise<{ facts: BrainFact[] }> {
  let q = admin
    .from("brain_facts")
    .select("id,category,fact,source")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(opts?.limit ?? MAX_FACTS);
  if (opts?.categories?.length) q = q.in("category", opts.categories);
  const { data } = await q;
  return { facts: (data ?? []) as BrainFact[] };
}

/**
 * Render active facts as a compact Arabic memory block for a system prompt.
 * Returns "" when there are no facts (so callers can skip the section entirely).
 */
export function renderBrainMemory(facts: BrainFact[]): string {
  if (!facts.length) return "";
  const byCat = new Map<string, string[]>();
  for (const f of facts) {
    const list = byCat.get(f.category) ?? [];
    list.push(f.fact);
    byCat.set(f.category, list);
  }
  const lines: string[] = [];
  for (const [cat, items] of byCat) {
    lines.push(`- [${cat}] ${items.join(" · ")}`);
  }
  return lines.join("\n");
}

// --- write helpers (owner agent now; the analysis job in Piece 2) ------------
export async function addBrainFact(
  db: SupabaseClient,
  restaurantId: string,
  input: { category: BrainCategory | string; fact: string; source?: BrainSource; confidence?: number | null }
): Promise<BrainFact | null> {
  const category = (BRAIN_CATEGORIES as readonly string[]).includes(input.category) ? input.category : "other";
  const { data, error } = await db
    .from("brain_facts")
    .insert({
      restaurant_id: restaurantId,
      category,
      fact: input.fact.trim(),
      source: input.source ?? "manual",
      confidence: input.confidence ?? null,
      status: "active",
    })
    .select("id,category,fact,source")
    .single();
  if (error) throw error;
  return (data as BrainFact) ?? null;
}

export async function archiveBrainFact(db: SupabaseClient, restaurantId: string, factId: string): Promise<void> {
  const { error } = await db
    .from("brain_facts")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", factId)
    .eq("restaurant_id", restaurantId);
  if (error) throw error;
}

/**
 * Record an owner Q&A. When an answer is given it becomes a durable
 * `owner_answer` fact, and the QA row links to it. Pieces 3 will drive this from
 * the owner-agent loop; exposed now so the foundation is complete + testable.
 */
export async function recordOwnerQA(
  db: SupabaseClient,
  restaurantId: string,
  input: { question: string; answer?: string; category?: BrainCategory | string }
): Promise<{ qaId: string | null; factId: string | null }> {
  let factId: string | null = null;
  if (input.answer && input.answer.trim()) {
    const fact = await addBrainFact(db, restaurantId, {
      category: input.category ?? "other",
      fact: input.answer.trim(),
      source: "owner_answer",
    });
    factId = fact?.id ?? null;
  }
  const { data, error } = await db
    .from("brain_owner_qa")
    .insert({
      restaurant_id: restaurantId,
      question: input.question.trim(),
      answer: input.answer?.trim() ?? null,
      answered_at: input.answer ? new Date().toISOString() : null,
      resulting_fact_id: factId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { qaId: (data?.id as string) ?? null, factId };
}

// --- the owner loop (Piece 3): surface insights → ask → answer → fact --------
export interface BrainInsight {
  id: string;
  type: string;
  summary: string;
  evidence: Record<string, unknown>;
  status: string;
}

/** Map an insight type to the fact category an owner answer should land in. */
function insightTypeToFactCategory(type: string): BrainCategory {
  switch (type) {
    case "menu_gap": return "menu_gap";
    case "delivery_gap": return "delivery";
    case "popular_request": return "customer_preference";
    case "complaint_theme": return "operations";
    default: return "other";
  }
}

/** The grounded question to put to the owner for an insight. */
export function insightQuestion(ins: BrainInsight): string {
  const sq = ins.evidence?.suggested_question;
  return (typeof sq === "string" && sq.trim()) ? sq.trim() : ins.summary;
}

/** Open (not yet answered/dismissed) insights, strongest evidence first. */
export async function listOpenInsights(
  db: SupabaseClient,
  restaurantId: string,
  limit = 3
): Promise<BrainInsight[]> {
  const { data } = await db
    .from("brain_insights")
    .select("id,type,summary,evidence,status")
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "surfaced"])
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as BrainInsight[];
  // Strongest evidence first (then recency, which the query already ordered).
  rows.sort((a, b) => Number(b.evidence?.count ?? 0) - Number(a.evidence?.count ?? 0));
  return rows.slice(0, limit);
}

/** Mark an insight surfaced (shown to the owner). Idempotent. */
export async function markInsightSurfaced(db: SupabaseClient, restaurantId: string, insightId: string): Promise<void> {
  await db
    .from("brain_insights")
    .update({ status: "surfaced" })
    .eq("id", insightId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending"); // only pending → surfaced; never un-answer
}

/**
 * The owner answered a surfaced insight: record the Q&A, store the answer as a
 * KNOWLEDGE fact (source=owner_answer), and mark the insight answered. Suggest-
 * only — this stores knowledge; it never changes menu/price/policy.
 */
export async function answerInsight(
  db: SupabaseClient,
  restaurantId: string,
  insightId: string,
  answer: string
): Promise<{ factId: string | null; qaId: string | null }> {
  const { data: ins } = await db
    .from("brain_insights")
    .select("id,type,summary,evidence,status")
    .eq("id", insightId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!ins) return { factId: null, qaId: null };
  const insight = ins as BrainInsight;
  const { qaId, factId } = await recordOwnerQA(db, restaurantId, {
    question: insightQuestion(insight),
    answer,
    category: insightTypeToFactCategory(insight.type),
  });
  await db.from("brain_insights").update({ status: "answered" }).eq("id", insightId).eq("restaurant_id", restaurantId);
  return { factId, qaId };
}

/** The owner dismissed an insight — no fact, never resurfaced. */
export async function dismissInsight(db: SupabaseClient, restaurantId: string, insightId: string): Promise<void> {
  await db.from("brain_insights").update({ status: "dismissed" }).eq("id", insightId).eq("restaurant_id", restaurantId);
}
