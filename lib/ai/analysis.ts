// ============================================================================
// MaitreAI — Learning System Piece 2: the conversation analysis job (SERVER ONLY)
// A periodic BATCH (not per-message) that reads recent CUSTOMER conversations and
// distills GROUNDED insights into brain_insights (status=pending) for the owner
// agent (Piece 3) to surface. Read-only on conversations. Insights must cite real
// evidence (counts + sample conversation ids) — fabricated patterns are dropped
// (every cited conversation id is validated against the batch). Empty in, empty
// out: if nothing is notable, it writes nothing. Cost-aware: bounded input + the
// efficient analysis model; never writes brain_facts (only the owner makes facts).
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdapter, costUsd, modelFor } from "@/lib/ai/llm";

// Cost guardrails (§P5): cap how much we feed the model per run.
const MAX_CONVERSATIONS = 50;
const MAX_MSGS_PER_CONV = 16;
const MAX_MSG_CHARS = 240;
const DEFAULT_WINDOW_HOURS = 24;

const INSIGHT_TYPES = ["menu_gap", "delivery_gap", "recurring_question", "complaint_theme", "popular_request", "other"] as const;

const ANALYSIS_SYSTEM = `You analyze a restaurant's recent WhatsApp customer conversations and extract RECURRING, NOTABLE patterns as structured insights for the owner.

Return ONLY JSON: {"insights":[ ... ]}. Each insight:
{
  "type": one of ${JSON.stringify(INSIGHT_TYPES)},
  "key": a STABLE snake_case slug identifying the pattern (e.g. "menu_gap:vegetarian", "delivery_gap:maadi") — same pattern must yield the same key on re-runs,
  "summary": one short ARABIC sentence describing the pattern,
  "evidence_conversation_ids": array of the conversation ids (from the input, verbatim) where you actually observed it,
  "suggested_question": one short ARABIC question to ask the owner (optional)
}

RULES:
- GROUND every insight in the conversations. Only cite conversation ids that appear in the input. Do NOT invent ids or patterns.
- Only report patterns seen in 2+ conversations (recurring). Ignore one-offs.
- If nothing notable/recurring, return {"insights":[]}. Never manufacture insights to fill space.
- Aggregate/pattern level only — do NOT include personal customer data (names/phones) in summaries.
- Examples of useful insights: items/options asked for that aren't on the menu; delivery areas asked about that aren't covered; questions the agent struggled to answer; complaint themes; popular requests / upsell openings.`;

export interface AnalysisInsight {
  type: string;
  key: string;
  summary: string;
  evidence_conversation_ids: string[];
  suggested_question?: string;
}

export interface AnalysisResult {
  conversationsAnalyzed: number;
  proposed: number;     // grounded insights the model returned
  written: number;      // new brain_insights rows
  merged: number;       // existing insights updated (deduped)
  model: string;
  costUsd: number;
  insights: { type: string; key: string; summary: string; count: number; status: "written" | "merged" }[];
}

function norm(s: string): string {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, "_");
}

/** Tolerant JSON extraction from the model's text. */
function parseInsights(text: string): AnalysisInsight[] {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as { insights?: AnalysisInsight[] };
    return Array.isArray(obj.insights) ? obj.insights : [];
  } catch {
    return [];
  }
}

/**
 * Run the analysis pass for one tenant over a recent window. A scheduler
 * (cron/queue) would call this per restaurant on an interval — for now it is
 * triggered manually / server-to-server via /api/brain/analyze.
 */
export async function runConversationAnalysis(
  admin: SupabaseClient,
  restaurantId: string,
  opts?: { sinceTimestamp?: string; windowHours?: number }
): Promise<AnalysisResult> {
  const since =
    opts?.sinceTimestamp ??
    new Date(Date.now() - (opts?.windowHours ?? DEFAULT_WINDOW_HOURS) * 3600 * 1000).toISOString();

  // 1. Load recent customer+AI messages (read-only), bounded for cost.
  const { data: msgs } = await admin
    .from("messages")
    .select("conversation_id,sender,text,created_at")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", since)
    .in("sender", ["customer", "ai"])
    .order("created_at", { ascending: true })
    .limit(MAX_CONVERSATIONS * MAX_MSGS_PER_CONV);
  const rows = (msgs ?? []) as { conversation_id: string; sender: string; text: string | null }[];

  // 2. Group into bounded per-conversation transcripts.
  const byConv = new Map<string, string[]>();
  for (const m of rows) {
    if (!m.text) continue;
    if (!byConv.has(m.conversation_id) && byConv.size >= MAX_CONVERSATIONS) continue;
    const list = byConv.get(m.conversation_id) ?? [];
    if (list.length >= MAX_MSGS_PER_CONV) continue;
    const who = m.sender === "customer" ? "عميل" : "مساعد";
    list.push(`${who}: ${m.text.slice(0, MAX_MSG_CHARS)}`);
    byConv.set(m.conversation_id, list);
  }
  const validIds = new Set(byConv.keys());
  const conversationsAnalyzed = validIds.size;

  // Nothing to analyze → write nothing (truth-driven).
  if (conversationsAnalyzed === 0) {
    return { conversationsAnalyzed: 0, proposed: 0, written: 0, merged: 0, model: modelFor("conversation_analysis").model, costUsd: 0, insights: [] };
  }

  const transcript = [...byConv.entries()]
    .map(([id, lines]) => `### محادثة ${id}\n${lines.join("\n")}`)
    .join("\n\n");

  // 3. LLM analysis pass (efficient model, bounded output).
  const adapter = await getAdapter();
  const res = await adapter.generate(
    { system: ANALYSIS_SYSTEM, messages: [{ role: "user", content: `حلّل المحادثات التالية واستخرج الأنماط المتكرّرة فقط:\n\n${transcript}` }], maxTokens: 1500 },
    "conversation_analysis"
  );
  const cfg = modelFor("conversation_analysis");
  const cost = costUsd(cfg, res.usage.inputTokens, res.usage.outputTokens);

  // 4. Validate grounding: keep only insights citing REAL conversation ids.
  const proposed = parseInsights(res.text)
    .map((i) => ({ ...i, evidence_conversation_ids: (i.evidence_conversation_ids ?? []).filter((id) => validIds.has(id)) }))
    .filter((i) => i.summary && i.evidence_conversation_ids.length >= 2 && i.key);

  // Log the batch run (observability + per-job cost).
  await admin.from("agent_runs").insert({
    restaurant_id: restaurantId,
    trigger: "analysis",
    input: `analyze ${conversationsAnalyzed} conversations since ${since}`,
    output: `${proposed.length} grounded insight(s)`,
    model: res.model,
    adapter: adapter.name,
    input_tokens: res.usage.inputTokens,
    output_tokens: res.usage.outputTokens,
    cost_usd: cost,
    tokens: res.usage.inputTokens + res.usage.outputTokens,
  });

  // 5. Dedup + write. Merge into an existing open insight with the same (type,key)
  //    instead of creating a duplicate every run.
  const { data: existing } = await admin
    .from("brain_insights")
    .select("id,type,summary,evidence,status")
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "surfaced"]);
  const open = (existing ?? []) as { id: string; type: string; evidence: Record<string, unknown> }[];

  let written = 0;
  let merged = 0;
  const summaryOut: AnalysisResult["insights"] = [];

  for (const ins of proposed) {
    const key = norm(ins.key);
    const sampleIds = ins.evidence_conversation_ids.slice(0, 10);
    const match = open.find((e) => e.type === ins.type && norm(String(e.evidence?.key ?? "")) === key);
    if (match) {
      const prevIds: string[] = Array.isArray(match.evidence?.sample_conversation_ids) ? (match.evidence!.sample_conversation_ids as string[]) : [];
      const unionIds = [...new Set([...prevIds, ...sampleIds])].slice(0, 20);
      await admin
        .from("brain_insights")
        .update({
          summary: ins.summary,
          evidence: { key, count: unionIds.length, sample_conversation_ids: unionIds, suggested_question: ins.suggested_question ?? null, last_analyzed_at: new Date().toISOString() },
        })
        .eq("id", match.id);
      merged++;
      summaryOut.push({ type: ins.type, key, summary: ins.summary, count: unionIds.length, status: "merged" });
    } else {
      await admin.from("brain_insights").insert({
        restaurant_id: restaurantId,
        type: ins.type,
        summary: ins.summary,
        evidence: { key, count: sampleIds.length, sample_conversation_ids: sampleIds, suggested_question: ins.suggested_question ?? null, last_analyzed_at: new Date().toISOString() },
        status: "pending",
      });
      written++;
      summaryOut.push({ type: ins.type, key, summary: ins.summary, count: sampleIds.length, status: "written" });
      open.push({ id: "new", type: ins.type, evidence: { key } }); // guard against same-run dupes
    }
  }

  return { conversationsAnalyzed, proposed: proposed.length, written, merged, model: res.model, costUsd: cost, insights: summaryOut };
}
