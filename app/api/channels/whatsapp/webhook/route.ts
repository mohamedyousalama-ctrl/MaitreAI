// ============================================================================
// MaitreAI — WhatsApp Cloud API webhook (Sprint 6 + Sprint 7 Pass 2)
// GET  : Meta webhook verification handshake (hub.mode/verify_token/challenge).
// POST : verifies the X-Hub signature (when an app secret is set), normalizes
//        inbound messages, and — when Supabase is configured — persists them
//        idempotently (customer + conversation + message, deduped on
//        channel_message_id). Falls back to console logging in test mode.
//        Returns 200 quickly so Meta does not retry.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  normalizeWhatsAppInbound,
  verifyWhatsAppWebhook,
} from "@/lib/messaging/adapters/whatsapp";
import { isWhatsAppConfigured, readWhatsAppEnv } from "@/lib/messaging/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistInboundMessage } from "@/lib/db/messages";
import { resolveWebhookRestaurantId } from "@/lib/db/restaurants";

export const dynamic = "force-dynamic";

// --- GET: verification handshake -------------------------------------------
export function GET(req: NextRequest) {
  const env = readWhatsAppEnv();
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  // No verify token configured → helpful dev response instead of a crash.
  if (!env.verifyToken) {
    return NextResponse.json(
      {
        ok: false,
        mode: "test",
        message:
          "WhatsApp verify token غير مُهيأ. عيّن WHATSAPP_VERIFY_TOKEN لتفعيل التحقق من الـ webhook.",
      },
      { status: 200 }
    );
  }

  const result = verifyWhatsAppWebhook({
    mode,
    token,
    challenge,
    verifyToken: env.verifyToken,
  });

  if (result !== null) {
    // Meta expects the raw challenge string echoed back as text/plain.
    return new NextResponse(result, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json(
    { ok: false, message: "verify token mismatch" },
    { status: 403 }
  );
}

// --- signature verification (server-only) ----------------------------------
/** Verify Meta's X-Hub-Signature-256 HMAC over the raw request body. */
function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// --- POST: inbound messages ------------------------------------------------
export async function POST(req: NextRequest) {
  const env = readWhatsAppEnv();
  const rawBody = await req.text();

  // Signature check only when an app secret is configured (placeholder-friendly).
  if (env.appSecret) {
    const sig = req.headers.get("x-hub-signature-256");
    if (!verifySignature(rawBody, sig, env.appSecret)) {
      return NextResponse.json({ ok: false, message: "invalid signature" }, { status: 401 });
    }
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, message: "invalid json" }, { status: 400 });
  }

  const messages = normalizeWhatsAppInbound(payload);

  // Persist to Supabase when configured (idempotent on channel_message_id);
  // otherwise fall back to console logging (test mode).
  let persisted = 0;
  let deduped = 0;
  const admin = createAdminClient();
  if (admin && messages.length > 0) {
    const restaurantId = await resolveWebhookRestaurantId(admin);
    if (restaurantId) {
      for (const m of messages) {
        try {
          const r = await persistInboundMessage(admin, restaurantId, m);
          if (r.inserted) persisted++;
          else deduped++;
        } catch (e) {
          console.error("[whatsapp:webhook] persist error", e);
        }
      }
    } else {
      console.warn("[whatsapp:webhook] no restaurant to attach inbound messages to");
    }
  } else if (messages.length > 0) {
    console.log(
      `[whatsapp:webhook] received ${messages.length} message(s)`,
      messages.map((m) => ({ from: m.from, name: m.customerName, text: m.text }))
    );
  }

  return NextResponse.json({
    ok: true,
    mode: isWhatsAppConfigured(env) ? "connected" : "test",
    received: messages.length,
    persisted,
    deduped,
  });
}
