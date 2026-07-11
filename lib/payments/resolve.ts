// ============================================================================
// MaitreAI — WO-T1-PAYMENTS: canonical payment-method resolver (THE sole source)
// ----------------------------------------------------------------------------
// Every surface that needs to know "which payment methods can THIS restaurant
// offer" (agent tools, storefront page + checkout, settings) reads through
// resolvePaymentMethods here — nowhere else calls normalizePaymentConfig or reads
// restaurants.payment_config directly (proven by test-payment-resolver: grep).
//
// Two truths, one resolver:
//   • LEGACY (default, and every existing tenant): the resolver returns exactly
//     normalizePaymentConfig(payment_config). BYTE-IDENTICAL to pre-WO behavior.
//   • CANONICAL (flag `canonical_payment_methods` ON + the 0084 table present):
//     the effective config is built from restaurant_payment_methods rows, then
//     the never-all-off guard is applied. The flag is a STRICT per-tenant switch,
//     DEFAULT OFF — Wesaya and every current tenant stay on the legacy path until
//     Mohamed flips it, so this WO ships dark.
//
// Manual methods only (cod / vodafone_cash / instapay). The online-card / PSP
// (Moyasar) stack is deliberately untouched here — a separate follow-up WO.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
// Relative, extensionless internal imports (repo convention: bundler resolution in
// Next/tsc; the proof harness resolves .ts via scripts/ts-ext-loader). This keeps
// resolve.ts importable by node --experimental-strip-types in test-payment-resolver.
import { isFeatureExplicitlyEnabled } from "../tenant/tier";
import {
  DEFAULT_PAYMENT_CONFIG,
  normalizePaymentConfig,
  type PaymentConfig,
  type WalletConfig,
} from "./config";

/** The manual payment methods the canonical model enumerates. */
export type CanonicalMethod = "cod" | "vodafone_cash" | "instapay";
export const CANONICAL_METHODS: readonly CanonicalMethod[] = ["cod", "vodafone_cash", "instapay"] as const;

/** One row of the 0084 restaurant_payment_methods table (canonical store). */
export interface PaymentMethodRow {
  method: string;
  enabled: boolean;
  config?: Record<string, unknown> | null;
}

export interface ResolvedPaymentMethods {
  /** The effective PaymentConfig — the SAME shape every consumer already uses. On
   *  the legacy path this is normalizePaymentConfig(payment_config) verbatim. */
  config: PaymentConfig;
  /** Provenance, for tests/telemetry. "legacy" ⇒ byte-identical to pre-WO. */
  source: "legacy" | "table";
}

/** never-all-off guard: a tenant can never end up with zero enabled methods. When
 *  every method is off we fall back to the safe default (cash / COD). Applied ONLY
 *  on the canonical path so the legacy path stays byte-identical. */
export function enforceNeverAllOff(cfg: PaymentConfig): PaymentConfig {
  if (!cfg.cod_enabled && !cfg.vodafone_cash.enabled && !cfg.instapay.enabled) {
    return { ...cfg, cod_enabled: true };
  }
  return cfg;
}

function walletFromRow(row: PaymentMethodRow | null, kind: "number" | "handle"): WalletConfig {
  const c = (row?.config && typeof row.config === "object" ? row.config : {}) as Record<string, unknown>;
  return {
    enabled: row?.enabled === true,
    [kind]: typeof c[kind] === "string" ? (c[kind] as string) : "",
    instructions: typeof c.instructions === "string" ? c.instructions : "",
  } as WalletConfig;
}

/** Build an effective PaymentConfig from canonical rows. wallet_policy is not a
 *  per-method attribute, so it rides through from the (still-authoritative for
 *  policy) legacy config. A missing cod row defaults COD ON (never-all-off spirit). */
function configFromRows(rows: PaymentMethodRow[], walletPolicy: PaymentConfig["wallet_policy"]): PaymentConfig {
  const rowFor = (m: CanonicalMethod) => rows.find((r) => r.method === m) ?? null;
  const cod = rowFor("cod");
  return {
    cod_enabled: cod ? cod.enabled === true : true,
    wallet_policy: walletPolicy,
    vodafone_cash: walletFromRow(rowFor("vodafone_cash"), "number"),
    instapay: walletFromRow(rowFor("instapay"), "handle"),
  };
}

/** PURE resolver. THE single interpreter of payment-method truth.
 *  - flag off OR no canonical rows → legacy config, byte-identical to pre-WO.
 *  - flag on + rows → config built from rows, then never-all-off. */
export function resolvePaymentMethods(input: {
  paymentConfig: unknown;
  methodRows?: PaymentMethodRow[] | null;
  featureFlags?: Record<string, unknown> | null;
}): ResolvedPaymentMethods {
  const legacy = normalizePaymentConfig(input.paymentConfig);
  const flagOn = isFeatureExplicitlyEnabled("canonical_payment_methods", input.featureFlags ?? null);
  if (!flagOn || !input.methodRows) {
    return { config: legacy, source: "legacy" };
  }
  return { config: enforceNeverAllOff(configFromRows(input.methodRows, legacy.wallet_policy)), source: "table" };
}

/** The offered set derivable from an effective config (a wallet counts only when
 *  it is enabled AND has its receiving id filled — we never offer a method the
 *  restaurant can't actually fulfil). Used for the per-order snapshot. */
export function offeredMethods(cfg: PaymentConfig): CanonicalMethod[] {
  const out: CanonicalMethod[] = [];
  if (cfg.cod_enabled) out.push("cod");
  if (cfg.vodafone_cash.enabled && (cfg.vodafone_cash.number ?? "").trim()) out.push("vodafone_cash");
  if (cfg.instapay.enabled && (cfg.instapay.handle ?? "").trim()) out.push("instapay");
  return out;
}

/** DB entry point: resolve for a restaurant, reading canonical rows only when the
 *  flag is on. Flag off does ZERO extra DB work and returns the legacy config, so
 *  the hot path (customer turn) is byte-identical for existing tenants. If the flag
 *  is on but the 0084 table isn't applied yet, the read fails soft → legacy. */
export async function loadResolvedPaymentMethods(
  db: SupabaseClient,
  restaurantId: string,
  args: { paymentConfig: unknown; featureFlags: Record<string, unknown> | null | undefined }
): Promise<ResolvedPaymentMethods> {
  if (!isFeatureExplicitlyEnabled("canonical_payment_methods", args.featureFlags ?? null)) {
    return resolvePaymentMethods({ paymentConfig: args.paymentConfig, featureFlags: args.featureFlags ?? null });
  }
  try {
    const { data, error } = await db
      .from("restaurant_payment_methods")
      .select("method, enabled, config")
      .eq("restaurant_id", restaurantId);
    if (error || !data) {
      return resolvePaymentMethods({ paymentConfig: args.paymentConfig, featureFlags: args.featureFlags ?? null });
    }
    return resolvePaymentMethods({
      paymentConfig: args.paymentConfig,
      methodRows: data as PaymentMethodRow[],
      featureFlags: args.featureFlags ?? null,
    });
  } catch {
    // Table absent (prepare-only, pre-ceremony) or transient read error → legacy.
    return resolvePaymentMethods({ paymentConfig: args.paymentConfig, featureFlags: args.featureFlags ?? null });
  }
}

/** Best-effort, flag-gated per-order snapshot write. Records what was offered and
 *  what the customer chose at order time, immune to later config edits. No-op when
 *  the flag is off; swallows errors (dup / table-absent) like recordAllergyEvent —
 *  a snapshot must NEVER block or fail an order write. */
export async function recordPaymentSnapshot(
  db: SupabaseClient,
  args: {
    orderId: string;
    restaurantId: string;
    offered: CanonicalMethod[];
    chosen: string | null;
    featureFlags: Record<string, unknown> | null | undefined;
  }
): Promise<void> {
  if (!isFeatureExplicitlyEnabled("canonical_payment_methods", args.featureFlags ?? null)) return;
  try {
    await db.from("order_payment_snapshot").insert({
      order_id: args.orderId,
      restaurant_id: args.restaurantId,
      offered: args.offered,
      chosen: args.chosen,
    });
  } catch {
    // Immutable table: a second insert for the same order_id (idempotent retry)
    // conflicts on the PK and is correctly ignored. Table-absent pre-ceremony → inert.
  }
}

// Re-export so consumers import the effective-config default from one module.
export { DEFAULT_PAYMENT_CONFIG };
