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
