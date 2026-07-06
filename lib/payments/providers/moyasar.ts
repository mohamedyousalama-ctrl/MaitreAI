// ============================================================================
// Kivo (KSA) — Moyasar payment provider (design §5). Hosted payment page
// (Option A): we create a Moyasar INVOICE and hand the customer its hosted
// `url`; settlement truth arrives later via a signed webhook (WO-3b — NOT wired
// here). Plain `fetch` against the Moyasar REST API, HTTP Basic with the secret
// key (no SDK, matching the codebase's dependency-light style).
//
// Wesaya impact: none. Nothing imports this on a live path until a tenant turns
// on the `psp_payments` flag (default OFF) AND the psp_* columns exist.
//
// Value imports are node-builtin only (`crypto`) so this module is reachable by
// the node-run unit tests; the `@/` imports are TYPE-ONLY (erased at strip).
// ============================================================================

import { timingSafeEqual } from "crypto";
import type { PaymentSessionStatus } from "@/lib/types";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  FetchPaymentResult,
  PaymentProvider,
  WebhookVerification,
} from "@/lib/payments/provider";

const MOYASAR_BASE = "https://api.moyasar.com/v1";
const MOYASAR_TIMEOUT_MS = 15000;

/**
 * `fetch` bounded by a hard timeout so a slow/hung Moyasar can't pin the request
 * worker indefinitely. A timeout or transport failure is converted into a clear
 * provider error (the caller's create-session try/catch maps it to a failure).
 */
async function moyasarFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(MOYASAR_TIMEOUT_MS) });
  } catch (e) {
    const name = e instanceof Error ? e.name : "Error";
    throw new Error(`moyasar_unreachable: ${name}`);
  }
}

// ── Money: the SINGLE site that converts SAR → integer halalas (design §5) ──
/**
 * Convert a SAR major amount (2-decimal money) to integer halalas, the minor
 * unit Moyasar charges in (1 SAR = 100 halalas). This is the ONLY place the
 * conversion happens.
 *
 * STRICT: the input must already be a whole number of halalas (≤ 2 decimals).
 * An amount with sub-halala precision (e.g. 1.005) is REJECTED, not silently
 * rounded — silent rounding could change the charged amount if a caller ever
 * passed a non-2dp value. (The `EPSILON` tolerance only absorbs IEEE-754 float
 * error from `sar * 100`, which stays well under 1e-4 across the full
 * numeric(10,2) range; a real 3rd-decimal digit is off by ≥ 0.1 halala and so
 * always trips.) Throws on non-finite, negative, or non-representable amounts
 * rather than charging a wrong value.
 */
const HALALA_EPSILON = 1e-4;
export function toHalalas(sar: number): number {
  if (typeof sar !== "number" || !Number.isFinite(sar)) {
    throw new Error(`toHalalas: amount must be a finite number, got ${sar}`);
  }
  if (sar < 0) throw new Error(`toHalalas: amount must be >= 0, got ${sar}`);
  const scaled = sar * 100;
  const halalas = Math.round(scaled);
  if (Math.abs(scaled - halalas) > HALALA_EPSILON) {
    throw new Error(`toHalalas: ${sar} SAR is not representable in whole halalas (max 2 decimals)`);
  }
  return halalas;
}

// ── Status mapping: Moyasar (payment + invoice) → our vocabulary ────────────
// Covers both Moyasar payment statuses (initiated/paid/failed/authorized/
// captured/refunded/voided) and invoice statuses (initiated/paid/canceled/
// expired). Fails CLOSED: an unrecognized status is NEVER treated as paid.
const STATUS_MAP: Record<string, PaymentSessionStatus> = {
  initiated: "created",
  authorized: "opened",
  captured: "paid",
  paid: "paid",
  failed: "failed",
  refunded: "refunded",
  voided: "cancelled",
  canceled: "cancelled", // Moyasar spelling (one 'l')
  cancelled: "cancelled",
  expired: "expired",
};

export function mapMoyasarStatus(raw: string | null | undefined): PaymentSessionStatus {
  const key = (raw ?? "").toString().trim().toLowerCase();
  return STATUS_MAP[key] ?? "failed";
}

// ── REST helpers ────────────────────────────────────────────────────────────
/** Moyasar HTTP Basic: secret key as username, empty password. */
function basicAuth(secretKey: string): string {
  return "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const moyasarProvider: PaymentProvider = {
  id: "moyasar",

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    // `amountMinor` is already integer halalas (converted at the single site,
    // toHalalas, by the caller). We assert integrality defensively but do NOT
    // re-convert here — double conversion is exactly what we guard against.
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error(`moyasar.createPayment: amountMinor must be a positive integer, got ${input.amountMinor}`);
    }
    const res = await moyasarFetch(`${MOYASAR_BASE}/invoices`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(input.secretKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        description: input.description,
        // Redirect fields are UX-only AND caller-sanitized (same-origin). Omit
        // them entirely when empty rather than sending blank URLs to the PSP.
        ...(input.callbackUrl
          ? { callback_url: input.callbackUrl, success_url: input.callbackUrl, back_url: input.callbackUrl }
          : {}),
        // WO-PAYLINK-EXPIRY — provider-side invoice expiry (ISO 8601). Moyasar
        // stops accepting payment on the hosted page after this instant, so a
        // stale link dies at the provider, not just in our session row.
        ...(input.expiresAt ? { expired_at: input.expiresAt } : {}),
        metadata: input.metadata,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`moyasar_create_failed status=${res.status} ${body}`.slice(0, 300));
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string; url?: string };
    if (!data.id || !data.url) throw new Error("moyasar_create_bad_response: missing id/url");
    return { providerRef: data.id, payUrl: data.url };
  },

  async fetchPayment(providerRef: string, secretKey: string): Promise<FetchPaymentResult> {
    const res = await moyasarFetch(`${MOYASAR_BASE}/invoices/${encodeURIComponent(providerRef)}`, {
      headers: { Authorization: basicAuth(secretKey) },
    });
    if (!res.ok) throw new Error(`moyasar_fetch_failed status=${res.status}`);
    const data = (await res.json().catch(() => ({}))) as { status?: string };
    return { providerRef, status: mapMoyasarStatus(data.status), raw: data };
  },

  // Implemented per Moyasar's shared-secret webhook model (they deliver a
  // `secret_token` inside the JSON body). Constant-time compared. WIRED TO NO
  // ROUTE in Part 1 — the signed-webhook route is WO-3b.
  verifyWebhook(
    rawBody: string,
    _headers: Record<string, string | undefined>,
    webhookSecret: string
  ): WebhookVerification {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { valid: false };
    }
    const provided = typeof parsed.secret_token === "string" ? parsed.secret_token : "";
    const valid = !!webhookSecret && constantTimeEqual(provided, webhookSecret);
    if (!valid) return { valid: false, raw: parsed };
    const data = (parsed.data ?? {}) as Record<string, unknown>;
    return {
      valid: true,
      event: typeof parsed.type === "string" ? parsed.type : undefined,
      providerRef: typeof data.id === "string" ? data.id : undefined,
      status: mapMoyasarStatus(typeof data.status === "string" ? data.status : undefined),
      raw: parsed,
    };
  },
};
