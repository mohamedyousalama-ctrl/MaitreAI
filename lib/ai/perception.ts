// ============================================================================
// MaitreAI — Karim Pro P3: per-turn PERCEPTION — SERVER ONLY
// For each customer message, ONE tiny cheap (Haiku) read assesses: intent, a
// confidence/CONFUSION signal (did Karim actually understand this?), sentiment,
// and risk (allergy/safety/escalation cues). Every field is a LABELED INFERENCE
// (a read, never a fact).
//
//  • Layer A (perceive + log): perceiveTurn() returns the read; the caller logs
//    it to agent_runs.perception. This does NOT change what Karim says.
//  • Layer B (act, recover-don't-dead-end): recoveryDirective() turns a LOW-
//    confidence / unknown read into a warm system directive that the caller
//    injects for THAT turn, so Karim clarifies / offers real options instead of
//    dead-ending. High-confidence turns get NO directive → identical behavior.
//
// Pro-gated by the caller on the narrow `perception` flag — perceiveTurn is only
// invoked there. It NEVER throws (returns null on any failure) so a perception
// glitch can never break the customer turn; a null read = no log + no directive.
// Honesty: a low-confidence read recovers from REAL data only — it never invents.
// ============================================================================

import "server-only";
import { getAdapter, modelFor } from "@/lib/ai/llm";
import type { LlmMessage } from "@/lib/ai/llm/types";

export type Confidence = "low" | "medium" | "high";
export type PerceptionRisk = "none" | "allergy" | "safety" | "frustration" | "escalation_cue";

/** The per-turn perception read — all fields are INFERENCES (labeled). */
export interface PerceptionRead {
  intent: string;
  /** The KEY field: did Karim actually understand this message? */
  confidence: Confidence;
  understood: boolean;
  sentiment: "positive" | "neutral" | "negative";
  risk: PerceptionRisk;
  model: string;
}

const INTENTS = [
  "browse", "ask_item", "build_order", "modify", "track",
  "ask_offers", "complaint", "ask_human", "smalltalk", "unknown",
];

const SYSTEM = [
  "أنت محلل سريع تقرأ آخر رسالة من عميل لمساعد مطعم على واتساب (مع سياق قصير).",
  "أعِد فقط كائن JSON واحد (بدون أي نص خارجه)، كله استنتاجات (reads) لا حقائق:",
  '{ "intent": "<أحد: ' + INTENTS.join("/") + '>",',
  '  "confidence": "low|medium|high", "understood": true|false,',
  '  "sentiment": "positive|neutral|negative",',
  '  "risk": "none|allergy|safety|frustration|escalation_cue" }',
  "كن صادقاً جداً في confidence: لو الرسالة فيها كلمة غير معروفة، أو فرانكو غير واضح،",
  "أو طلب غامض/مبهم/مشوّش، أو إنت بتخمّن النية → confidence=\"low\" و understood=false.",
  "أي ذكر لحساسية/أمان غذائي → risk=\"allergy\" أو \"safety\". لا تخترع — هذه قراءة فقط.",
].join("\n");

function plain(content: LlmMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text?: string }).text ?? "") : "")).join(" ");
  }
  return "";
}

function parse(raw: string, model: string): PerceptionRead | null {
  try {
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    const o = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
    const conf: Confidence = o.confidence === "high" ? "high" : o.confidence === "medium" ? "medium" : "low";
    const intent = typeof o.intent === "string" && INTENTS.includes(o.intent) ? o.intent : "unknown";
    const risk = (["none", "allergy", "safety", "frustration", "escalation_cue"] as const).includes(o.risk as PerceptionRisk)
      ? (o.risk as PerceptionRisk)
      : "none";
    const sentiment = o.sentiment === "positive" || o.sentiment === "negative" ? o.sentiment : "neutral";
    // `understood` defaults to (confidence !== low) when absent/ambiguous.
    const understood = typeof o.understood === "boolean" ? o.understood : conf !== "low";
    return { intent, confidence: conf, understood, sentiment, risk, model };
  } catch {
    return null;
  }
}

/** Render a short tail of context so the read sees who said what. */
function transcript(history: LlmMessage[], userMessage: string): string {
  const tail = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "العميل" : "كريم"}: ${plain(m.content).slice(0, 300)}`)
    .filter((l) => l.trim());
  tail.push(`العميل (الرسالة الحالية): ${userMessage.slice(0, 400)}`);
  return tail.join("\n");
}

/**
 * ONE cheap per-turn read. Returns the labeled perception, or null on any
 * failure (so the turn proceeds unchanged — perception never blocks a reply).
 */
export async function perceiveTurn(userMessage: string, history: LlmMessage[]): Promise<PerceptionRead | null> {
  if (!userMessage.trim()) return null;
  try {
    const adapter = await getAdapter();
    const res = await adapter.generate(
      { system: SYSTEM, messages: [{ role: "user", content: transcript(history, userMessage) }], maxTokens: 200 },
      "perception"
    );
    return parse(res.text ?? "", res.model || modelFor("perception").model);
  } catch {
    return null;
  }
}

/**
 * Layer B. Turn a read into a per-turn system directive, or null when none is
 * needed (a clear, high-confidence turn → no injection → identical behavior).
 *  - allergy/safety risk → reinforce the HARD allergy escalation (#60/#61).
 *  - low confidence / not understood / unknown intent → RECOVER, don't dead-end.
 * It never tells Karim to invent — it points him at the existing recovery rules.
 */
export function recoveryDirective(read: PerceptionRead | null): string | null {
  if (!read) return null;

  if (read.risk === "allergy" || read.risk === "safety") {
    return [
      "## ⚠️ إدراك هذه اللفة (PERCEPTION — قراءة داخلية، ليست حقيقة)",
      "في إشارة حساسية/أمان غذائي. اتبع قاعدة «سلامة الحساسية» الصارمة: لو في أي شك، صعّد فوراً (escalate_to_human) — تصعيد قاطع، من غير «تحب أحوّلك؟»، ومن غير أي ضمان أمان. السلامة فوق البيع دايماً.",
    ].join("\n");
  }

  // Trigger on the RELIABLE confusion signal (low confidence) or an unknown
  // intent — NOT on `understood=false` alone (it's noisier and false-fires on
  // clear order turns, which would make Karim over-clarify instead of building).
  const lowConf = read.confidence === "low" || read.intent === "unknown";
  if (lowConf) {
    return [
      "## ⚠️ إدراك هذه اللفة (PERCEPTION — قراءة داخلية، ليست حقيقة)",
      "ثقتك في فهم رسالة العميل الأخيرة منخفضة (قد تحتوي كلمة غير معروفة، فرانكو غير واضح، أو طلب غامض). تعافَ بفعالية — ماتتوهش وماتراوغش:",
      "اسأل سؤالاً توضيحياً محدداً بصيغة سؤال يطرح أقرب احتمالين (مثال: «تقصد حاجة مشوية ولا مقرمشة؟ ساندويتش ولا وجبة كاملة؟»)، أو رشّح صنفاً أو صنفين حقيقيين بالاسم من المنيو.",
      "ممنوع تماماً: «مش فاهم» كنهاية؛ والاكتفاء بـ«اختار من القائمة/التصنيفات» كردّ (دي مراوغة مش توضيح)؛ والتخمين والالتزام بطلب؛ واختراع صنف/سعر/خيار؛ والتصعيد الكاذب — ده موقف Tier 0 تتعامل معاه بنفسك.",
    ].join("\n");
  }

  return null;
}
