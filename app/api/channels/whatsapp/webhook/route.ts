// ============================================================================
// MaitreAI — WhatsApp Cloud API webhook (Sprint 6)
// GET  : Meta webhook verification handshake (hub.mode/verify_token/challenge).
// POST : accepts a WhatsApp webhook payload, optionally verifies the X-Hub
//        signature, normalizes inbound messages, logs them server-side, and
//        returns 200 quickly.
//
// IMPORTANT (no database yet): this route does NOT persist messages or push
// them into the browser Zustand stores — server routes cannot reach localStorage.
// It normalizes + logs to the server console only. The local simulator injects
// messages into the client stores instead. Persistence arrives in a later sprint.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  normalizeWhatsAppInbound,
  verifyWhatsAppWebhook,
} from "@/lib/messaging/adapters/whatsapp";
import { isWhatsAppConfigured, readWhatsAppEnv } from "@/lib/messaging/config";

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

  // No DB yet → log server-side only and acknowledge fast (Meta needs a 200).
  if (messages.length > 0) {
    console.log(
      `[whatsapp:webhook] received ${messages.length} message(s)`,
      messages.map((m) => ({ from: m.from, name: m.customerName, text: m.text }))
    );
  }

  return NextResponse.json({
    ok: true,
    mode: isWhatsAppConfigured(env) ? "connected" : "test",
    received: messages.length,
    // Echo normalized messages back in dev so the payload shape is easy to verify.
    normalized: messages,
  });
}
