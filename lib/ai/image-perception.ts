// ============================================================================
// MaitreAI — WO-MEDIA-INBOUND: inbound-image vision READ — SERVER ONLY
//
// ONE cheap Haiku vision read per inbound image (media_turn_trigger). Given the
// image bytes (+ optional customer caption), it returns a SHORT ARABIC DESCRIPTION —
// a labelled READ, never a fact. That description is:
//   • persisted to messages.meta.image.description (derived:true), and
//   • surfaced to the customer agent as a provenance-marked directive / history line
//     (lib/messaging/image-turn.ts) — so the agent sees the image as TEXT and never
//     carries image bytes itself, and later turns see the same read.
//
// This REUSES the existing LLM adapter seam (getAdapter().generate, same as
// perception.ts) — it is NOT a new vision pipeline. It NEVER throws (returns null on
// any failure / mock / no-key), so a vision glitch can never break — or silence — a
// turn: the caller falls back to a warm "I saw your image, what do you need?" reply.
//
// SAFETY: the description is context only. The deterministic allergen gate runs on
// the customer's OWN text (caption / placeholder), never on this read — so a read
// that happens to name an allergen can never (re)introduce a gate false-positive.
// ============================================================================

import "server-only";
import { getAdapter, modelFor } from "@/lib/ai/llm";
import type { LlmContentBlock } from "@/lib/ai/llm/types";

export interface ImageRead {
  /** Short Arabic description of the image (a READ, capped). */
  description: string;
  model: string;
  costUsd: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

const SYSTEM = [
  "أنت قارئ سريع تصف صورة أرسلها عميل لمساعد مطعم على واتساب.",
  "أعِد وصفاً عربياً قصيراً (جملة أو اتنين) لما هو ظاهر فعلاً في الصورة:",
  "هل هي كتيبة/إعلان عرض؟ صورة طبق أو صنف؟ منيو؟ إيصال؟ أم شيء غير متعلق بالأكل؟",
  "صِف اللي تشوفه فقط. ممنوع تماماً اختراع أسعار أو أصناف أو تفاصيل مش واضحة في الصورة.",
  "لو النص في الصورة واضح (اسم عرض/صنف)، اذكره كما هو. ده وصف (قراءة) مش تأكيد توفّر.",
].join("\n");

/** Anthropic image blocks accept a small set of media types; map/guard the WhatsApp
 *  mime to one of them, defaulting to jpeg (WhatsApp photos are overwhelmingly jpeg). */
function normalizeMediaType(mime?: string): string {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  if (m === "image/gif") return "image/gif";
  if (m === "image/webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Describe an inbound image. Returns null (never throws) on any failure, on the mock
 * adapter, or on an empty read — the caller then uses the warm never-silence fallback.
 * The per-request timeout is inherited from the shared adapter (AGENT_TIMEOUT_MS in
 * claude.ts), so a hung vision call fails fast into that same fallback.
 */
export async function describeInboundImage(args: {
  bytes: Buffer;
  mime?: string;
  caption?: string;
}): Promise<ImageRead | null> {
  try {
    const adapter = await getAdapter();
    // No real vision in test/mock mode (no network, no key) → null → warm fallback.
    if (adapter.name === "mock") return null;

    const data = args.bytes.toString("base64");
    const media_type = normalizeMediaType(args.mime);
    const caption = (args.caption ?? "").trim();
    const content: LlmContentBlock[] = [
      { type: "image", source: { type: "base64", media_type, data } },
      {
        type: "text",
        text: caption
          ? `العميل كتب مع الصورة: «${caption.slice(0, 400)}». صِف الصورة بإيجاز.`
          : "صِف الصورة بإيجاز.",
      },
    ];

    const cfg = modelFor("image_perception");
    const res = await adapter.generate(
      { system: SYSTEM, messages: [{ role: "user", content }], maxTokens: cfg.maxTokens },
      "image_perception"
    );
    const description = (res.text ?? "").trim();
    if (!description) return null;

    const usage = res.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    const costUsd = (usage.inputTokens / 1_000_000) * cfg.priceIn + (usage.outputTokens / 1_000_000) * cfg.priceOut;
    return { description: description.slice(0, 600), model: res.model || cfg.model, costUsd, usage };
  } catch {
    return null;
  }
}
