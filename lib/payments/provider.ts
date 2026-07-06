// ============================================================================
// Kivo (KSA) — PaymentProvider interface + registry (design §2).
//
// A PSP-agnostic seam so a real payment provider can be plugged in per tenant
// without the session-create path knowing provider specifics. The registry is
// keyed by `restaurants.psp_provider` (e.g. 'moyasar'). NOTHING here reads a
// `psp_*` column or performs I/O — the caller (create-session) does the
// flag-gated DB read and passes decrypted creds into `createPayment`.
//
// Wesaya impact: none. This is inert plumbing; no live path resolves a provider
// until a tenant explicitly enables the `psp_payments` flag (default OFF).
//
// ============================================================================

import type { PaymentSessionStatus } from "@/lib/types";
import { moyasarProvider } from "@/lib/payments/providers/moyasar";

/** Input to create a hosted payment. Amounts are ALREADY in the provider's
 *  integer minor unit (halalas for SAR) — the single-site conversion lives in
 *  the provider module and is applied by the caller before this is built. */
export interface CreatePaymentInput {
  /** Integer minor units (halalas). Never a float, never client-supplied. */
  amountMinor: number;
  /** ISO currency the PROVIDER expects (e.g. "SAR"), not the display glyph. */
  currency: string;
  description: string;
  /** UX-only redirect after the hosted page — NEVER trusted for settlement. */
  callbackUrl: string;
  /** Correlation only: {sessionId, restaurantId, orderId}. */
  metadata: Record<string, string>;
  /** Decrypted secret key (sk_…). Passed in; never read from env here. */
  secretKey: string;
  /** WO-PAYLINK-EXPIRY — ISO 8601 provider-side invoice expiry (= our session
   *  expiry). When set, the PSP itself dead-links the hosted page after this
   *  instant so a stale link can't be paid. Optional; omitted ⇒ no provider expiry. */
  expiresAt?: string;
}

export interface CreatePaymentResult {
  /** The provider's payment/invoice id — stored as payment_sessions.provider_ref. */
  providerRef: string;
  /** The hosted payment page URL — stored as payment_sessions.link. */
  payUrl: string;
}

export interface FetchPaymentResult {
  providerRef: string;
  /** Mapped into OUR vocabulary — see the provider's status table. */
  status: PaymentSessionStatus;
  raw: unknown;
}

/** Result of validating an inbound webhook. `valid` is the ONLY thing a route
 *  should trust before acting; the rest are conveniences extracted from a
 *  verified payload. (verifyWebhook is implemented in Part 1 but wired to NO
 *  route — that is WO-3b.) */
export interface WebhookVerification {
  valid: boolean;
  event?: string;
  providerRef?: string;
  status?: PaymentSessionStatus;
  raw?: unknown;
}

export interface PaymentProvider {
  /** Matches `restaurants.psp_provider`. */
  readonly id: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  fetchPayment(providerRef: string, secretKey: string): Promise<FetchPaymentResult>;
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
    webhookSecret: string
  ): WebhookVerification;
}

// Registry keyed by restaurants.psp_provider. Additive — new providers slot in
// here without touching the create-session path.
const REGISTRY: Record<string, PaymentProvider> = {
  [moyasarProvider.id]: moyasarProvider,
};

/** Resolve a provider by its `restaurants.psp_provider` id, or null if unknown
 *  / unset. Null means "no PSP configured" — the caller must fall back safely,
 *  never assume a default provider. */
export function getPaymentProvider(providerId: string | null | undefined): PaymentProvider | null {
  const id = (providerId ?? "").trim();
  if (!id) return null;
  return REGISTRY[id] ?? null;
}
