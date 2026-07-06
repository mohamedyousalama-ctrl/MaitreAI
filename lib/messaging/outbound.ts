// ============================================================================
// MaitreAI — WhatsApp outbound sender (Sprint 9, S9-1) — SERVER ONLY
// One hardened place to put a message ON the wire: retry with backoff on
// transient failures, 24-hour customer-service-window awareness (free-form text
// is only allowed inside the window — outside it Meta requires an approved
// template, S9-4), and never a fake "sent". Wraps the env-gated WhatsApp adapter
// so the caller gets a single, honest WindowedSendResult.
// ============================================================================

import "server-only";
import {
  whatsappAdapter,
  buildWhatsAppButtonsBody,
  buildWhatsAppListBody,
  buildWhatsAppImageBody,
  buildWhatsAppImageLinkBody,
  buildWhatsAppAudioBody,
  buildWhatsAppTemplateBody,
  sendWhatsAppBody,
  uploadWhatsAppMedia,
} from "./adapters/whatsapp";
import { isWhatsAppConfigured } from "./config";
import { retrySend } from "./retry-policy";
import type { SendResult } from "./types";
import type { Presentation } from "@/lib/ai/tools";
import type { TemplateDef } from "./templates";

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

  const { result, attempts } = await retrySend(
    () => whatsappAdapter.sendMessage({ channel: "whatsapp", to: args.to, text: args.text }),
    args.retries ?? 2
  );
  return { ...result, windowState: "in_window", attempts };
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
  const { result, attempts } = await retrySend(() => sendWhatsAppBody(waBody as Record<string, unknown>), retries);
  if (result.ok) return { ...result, windowState: "in_window", attempts };

  // Degrade: interactive failed → re-send as numbered text.
  const fb = await sendWhatsAppText({
    to: args.to,
    text: presentationToNumberedText(args.body, p),
    lastInboundAtMs: args.lastInboundAtMs,
    retries,
  });
  return { ...fb, fallbackToText: true };
}

export interface SendImageArgs {
  to: string;
  png: Buffer;
  caption?: string;
  lastInboundAtMs?: number | null;
  retries?: number;
}

export interface SendImageLinkArgs {
  to: string;
  imageUrl: string;
  caption?: string;
  lastInboundAtMs?: number | null;
  retries?: number;
}

/** Send a WhatsApp image by public URL (dish photos already live in menu_items.image_url). */
export async function sendWhatsAppImageLink(args: SendImageLinkArgs): Promise<WindowedSendResult> {
  const base = { channel: "whatsapp" as const, to: args.to };
  if (!isWhatsAppConfigured()) {
    return { ...base, ok: false, status: "skipped", error: "WhatsApp غير مُهيأ (الوضع التجريبي).", windowState: "test_mode", attempts: 0 };
  }
  if (args.lastInboundAtMs !== undefined && !within24hWindow(args.lastInboundAtMs)) {
    return { ...base, ok: false, status: "failed", error: "خارج نافذة الـ24 ساعة — يتطلب قالباً معتمداً.", windowState: "out_of_window", attempts: 0 };
  }

  const body = buildWhatsAppImageLinkBody(args.to, args.imageUrl, args.caption);
  const { result, attempts } = await retrySend(() => sendWhatsAppBody(body as Record<string, unknown>), args.retries ?? 2);
  return { ...result, windowState: "in_window", attempts };
}

/** WO-VOICE-2: upload synthesized audio bytes and send them as a WhatsApp voice
 *  note. Same 24h-window + test-mode gating as images; the text reply is sent
 *  separately (voice is additive, never a replacement). */
export async function sendWhatsAppAudio(args: { to: string; audio: Buffer; mime?: string; lastInboundAtMs?: number; retries?: number }): Promise<WindowedSendResult> {
  const base = { channel: "whatsapp" as const, to: args.to };
  if (!isWhatsAppConfigured()) {
    return { ...base, ok: false, status: "skipped", error: "WhatsApp غير مُهيأ (الوضع التجريبي).", windowState: "test_mode", attempts: 0 };
  }
  if (args.lastInboundAtMs !== undefined && !within24hWindow(args.lastInboundAtMs)) {
    return { ...base, ok: false, status: "failed", error: "خارج نافذة الـ24 ساعة — يتطلب قالباً معتمداً.", windowState: "out_of_window", attempts: 0 };
  }
  if (!args.audio || args.audio.length === 0) {
    return { ...base, ok: false, status: "failed", error: "no audio bytes", windowState: "in_window", attempts: 0 };
  }

  const upload = await uploadWhatsAppMedia(args.audio, args.mime ?? "audio/ogg", "voice.ogg");
  if (!upload.ok || !upload.mediaId) {
    return { ...base, ok: false, status: "failed", error: upload.error ?? "media upload failed", windowState: "in_window", attempts: 1 };
  }

  const body = buildWhatsAppAudioBody(args.to, upload.mediaId);
  const { result, attempts } = await retrySend(() => sendWhatsAppBody(body as Record<string, unknown>), args.retries ?? 2);
  return { ...result, windowState: "in_window", attempts };
}

/** Upload a PNG and send it as a WhatsApp image (e.g. a receipt). */
export async function sendWhatsAppImage(args: SendImageArgs): Promise<WindowedSendResult> {
  const base = { channel: "whatsapp" as const, to: args.to };
  if (!isWhatsAppConfigured()) {
    return { ...base, ok: false, status: "skipped", error: "WhatsApp غير مُهيأ (الوضع التجريبي).", windowState: "test_mode", attempts: 0 };
  }
  if (args.lastInboundAtMs !== undefined && !within24hWindow(args.lastInboundAtMs)) {
    return { ...base, ok: false, status: "failed", error: "خارج نافذة الـ24 ساعة — يتطلب قالباً معتمداً.", windowState: "out_of_window", attempts: 0 };
  }

  const upload = await uploadWhatsAppMedia(args.png, "image/png", "receipt.png");
  if (!upload.ok || !upload.mediaId) {
    return { ...base, ok: false, status: "failed", error: upload.error ?? "media upload failed", windowState: "in_window", attempts: 1 };
  }

  const body = buildWhatsAppImageBody(args.to, upload.mediaId, args.caption);
  const { result, attempts } = await retrySend(() => sendWhatsAppBody(body as Record<string, unknown>), args.retries ?? 2);
  return { ...result, windowState: "in_window", attempts };
}

/**
 * Send a pre-approved template message (S9-4). UNLIKE text/interactive, templates
 * are allowed OUTSIDE the 24h window — that is their whole purpose — so there is
 * no window gate here. Delivery still requires the template to be APPROVED in
 * Meta on the verified account; until then Meta rejects with a 4xx (surfaced).
 */
export async function sendWhatsAppTemplate<P>(
  to: string,
  def: TemplateDef<P>,
  params: P,
  retries = 2
): Promise<WindowedSendResult> {
  const base = { channel: "whatsapp" as const, to };
  if (!isWhatsAppConfigured()) {
    return { ...base, ok: false, status: "skipped", error: "WhatsApp غير مُهيأ (الوضع التجريبي).", windowState: "test_mode", attempts: 0 };
  }
  const body = buildWhatsAppTemplateBody(to, def.name, def.language, def.build(params));
  const { result, attempts } = await retrySend(() => sendWhatsAppBody(body as Record<string, unknown>), retries);
  return { ...result, windowState: "out_of_window", attempts };
}
