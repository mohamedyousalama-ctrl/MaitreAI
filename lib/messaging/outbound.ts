// ============================================================================
// MaitreAI — WhatsApp outbound sender (Sprint 9, S9-1) — SERVER ONLY
// One hardened place to put a message ON the wire: retry with backoff on
// transient failures, 24-hour customer-service-window awareness (free-form text
// is only allowed inside the window — outside it Meta requires an approved
// template, S9-4), and never a fake "sent". Wraps the env-gated WhatsApp adapter
// so the caller gets a single, honest WindowedSendResult.
// ============================================================================

import "server-only";
import { whatsappAdapter, buildWhatsAppButtonsBody, buildWhatsAppListBody, sendWhatsAppBody } from "./adapters/whatsapp";
import { isWhatsAppConfigured } from "./config";
import type { SendResult } from "./types";
import type { Presentation } from "@/lib/ai/tools";

/** WhatsApp's free-form customer-service window: 24h since the last inbound. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function within24hWindow(lastInboundAtMs: number | null | undefined): boolean {
  if (!lastInboundAtMs) return false;
  return Date.now() - lastInboundAtMs < WINDOW_MS;
}

export type WindowState = "in_window" | "out_of_window" | "test_mode";

export interface WindowedSendResult extends SendResult {
  windowState: WindowState;
  attempts: number;
}

const BACKOFF_MS = [500, 1500, 4000];
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry only transient failures (429 / 5xx / network); 4xx won't self-heal and
 *  retrying an ambiguous timeout risks a double-send, so we keep it tight. */
function shouldRetry(res: SendResult): boolean {
  if (res.ok) return false;
  const m = /API (\d{3})/.exec(res.error ?? "");
  if (m) {
    const code = Number(m[1]);
    return code === 429 || code >= 500;
  }
  // No HTTP code parsed → the fetch threw (network) → worth one more try.
  return res.status === "failed";
}

export interface SendWhatsAppArgs {
  to: string;
  text: string;
  /** Epoch ms of the most recent inbound message; omit to skip the window gate. */
  lastInboundAtMs?: number | null;
  retries?: number;
}

/**
 * Send a free-form WhatsApp text. Returns status:
 *  - "sent"    → delivered (externalMessageId set)
 *  - "skipped" → not configured (test mode) — nothing transmitted, not an error
 *  - "failed"  → real failure (network/4xx after retries) OR outside the 24h window
 */
export async function sendWhatsAppText(args: SendWhatsAppArgs): Promise<WindowedSendResult> {
  const base = { channel: "whatsapp" as const, to: args.to };

  // Test mode / no credentials → skip gracefully (never crash, never fake-send).
  if (!isWhatsAppConfigured()) {
    return {
      ...base,
      ok: false,
      status: "skipped",
      error: "WhatsApp غير مُهيأ (الوضع التجريبي) — لم يتم الإرسال الفعلي.",
      windowState: "test_mode",
      attempts: 0,
    };
  }

  // Outside the 24h window free-form text is rejected by Meta — needs a template.
  if (args.lastInboundAtMs !== undefined && !within24hWindow(args.lastInboundAtMs)) {
    return {
      ...base,
      ok: false,
      status: "failed",
      error: "خارج نافذة الـ24 ساعة — يتطلب الإرسال قالباً معتمداً (template).",
      windowState: "out_of_window",
      attempts: 0,
    };
  }

  const retries = args.retries ?? 2;
  let last: SendResult = { ...base, ok: false, status: "failed", error: "no attempt" };
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await whatsappAdapter.sendMessage({ channel: "whatsapp", to: args.to, text: args.text });
    if (last.ok) return { ...last, windowState: "in_window", attempts: attempt + 1 };
    if (!shouldRetry(last) || attempt === retries) break;
    await delay(BACKOFF_MS[attempt] ?? 4000);
  }
  return { ...last, windowState: "in_window", attempts: retries + 1 };
}

export interface SendInteractiveArgs {
  to: string;
  /** Conversational reply text — becomes the interactive message body. */
  body: string;
  presentation: Presentation;
  lastInboundAtMs?: number | null;
  retries?: number;
}

/** Render a presentation as plain numbered text (the interactive→text fallback). */
export function presentationToNumberedText(body: string, p: Presentation): string {
  const lines: string[] = [body.trim(), "", "للاختيار، رد برقم:"];
  if (p.kind === "buttons") {
    p.buttons.forEach((b, i) => lines.push(`${i + 1}) ${b.title}`));
  } else {
    let n = 1;
    for (const s of p.sections) {
      if (s.title) lines.push(`— ${s.title} —`);
      for (const r of s.rows) {
        lines.push(`${n}) ${r.title}${r.description ? ` — ${r.description}` : ""}`);
        n++;
      }
    }
  }
  return lines.join("\n");
}

/**
 * Send an interactive message (reply buttons / list). Same window + retry rules
 * as text. Graceful degradation: if the interactive send fails after retries,
 * the SAME content is re-sent as numbered text so the customer always gets the
 * choices.
 */
export async function sendWhatsAppInteractive(
  args: SendInteractiveArgs
): Promise<WindowedSendResult & { fallbackToText?: boolean }> {
  const base = { channel: "whatsapp" as const, to: args.to };

  if (!isWhatsAppConfigured()) {
    return {
      ...base,
      ok: false,
      status: "skipped",
      error: "WhatsApp غير مُهيأ (الوضع التجريبي) — لم يتم الإرسال الفعلي.",
      windowState: "test_mode",
      attempts: 0,
    };
  }
  if (args.lastInboundAtMs !== undefined && !within24hWindow(args.lastInboundAtMs)) {
    return {
      ...base,
      ok: false,
      status: "failed",
      error: "خارج نافذة الـ24 ساعة — يتطلب الإرسال قالباً معتمداً (template).",
      windowState: "out_of_window",
      attempts: 0,
    };
  }

  const p = args.presentation;
  const waBody =
    p.kind === "buttons"
      ? buildWhatsAppButtonsBody(args.to, args.body, p.buttons, p.header)
      : buildWhatsAppListBody(args.to, args.body, p.button, p.sections, p.header);

  const retries = args.retries ?? 2;
  let last: SendResult = { ...base, ok: false, status: "failed", error: "no attempt" };
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await sendWhatsAppBody(waBody as Record<string, unknown>);
    if (last.ok) return { ...last, windowState: "in_window", attempts: attempt + 1 };
    if (!shouldRetry(last) || attempt === retries) break;
    await delay(BACKOFF_MS[attempt] ?? 4000);
  }

  // Degrade: interactive failed → re-send as numbered text.
  const fb = await sendWhatsAppText({
    to: args.to,
    text: presentationToNumberedText(args.body, p),
    lastInboundAtMs: args.lastInboundAtMs,
    retries,
  });
  return { ...fb, fallbackToText: true };
}
