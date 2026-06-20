// ============================================================================
// MaitreAI — Payment Sprint 1: manual-wallet payment configuration (types)
// Shared shape for restaurants.payment_config (migration 0021). One source of
// truth for the settings API route and the settings UI card. Sprint 1 is config
// storage only — COD stays the default-on path; wallet enforcement is a later
// sprint. normalize() tolerates partial/legacy JSON so reads never throw.
// ============================================================================

/** A single manual wallet (Vodafone Cash uses `number`, InstaPay uses `handle`). */
export interface WalletConfig {
  enabled: boolean;
  /** Vodafone Cash receiving number. */
  number?: string;
  /** InstaPay handle / address. */
  handle?: string;
  /** Free-text instructions shown to the customer (how to pay this wallet). */
  instructions: string;
}

/** How strictly manual-wallet orders are treated (enforcement wired in a later sprint). */
export type WalletPolicy = "strict" | "lenient";

export interface PaymentConfig {
  /** Cash on delivery — default ON. Disabling it never changes the COD code path,
   *  only whether COD is offered. */
  cod_enabled: boolean;
  wallet_policy: WalletPolicy;
  vodafone_cash: WalletConfig;
  instapay: WalletConfig;
}

/** The exact default seeded by migration 0021 (mirrors the applied prod schema). */
export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  cod_enabled: true,
  wallet_policy: "strict",
  vodafone_cash: { enabled: false, number: "", instructions: "" },
  instapay: { enabled: false, handle: "", instructions: "" },
};

function normalizeWallet(raw: unknown, kind: "number" | "handle"): WalletConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    [kind]: typeof o[kind] === "string" ? (o[kind] as string) : "",
    instructions: typeof o.instructions === "string" ? o.instructions : "",
  } as WalletConfig;
}

/** Tolerant read: merge stored JSON over the defaults so the app never sees
 *  a missing field, regardless of how the row was written. */
export function normalizePaymentConfig(raw: unknown): PaymentConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    cod_enabled: o.cod_enabled !== false, // default ON
    wallet_policy: o.wallet_policy === "lenient" ? "lenient" : "strict",
    vodafone_cash: normalizeWallet(o.vodafone_cash, "number"),
    instapay: normalizeWallet(o.instapay, "handle"),
  };
}
