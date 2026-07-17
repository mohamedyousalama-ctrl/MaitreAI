// ============================================================================
// MaitreAI — Payment settings route (Payment Sprint 1) — SERVER ONLY
// Per-tenant manual-wallet payment config (restaurants.payment_config, migration
// 0021). GET + POST manager-only (T4/M2.2). Config storage only — COD stays the
// default-on path and no order/checkout behavior changes here. A partial POST
// merges over the stored config so a single toggle never drops other fields.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/db/require-tenant";
import {
  DEFAULT_PAYMENT_CONFIG,
  type PaymentConfig,
  type WalletConfig,
} from "@/lib/payments/config";
import { loadResolvedPaymentMethods, enforceNeverAllOff } from "@/lib/payments/resolve";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  // T4/M2.2 — payment_config is manager-only; operations members must not read it.
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data } = await supabase
    .from("restaurants")
    .select("payment_config, feature_flags")
    .eq("id", tenant.restaurantId)
    .single();
  // WO-T1-PAYMENTS: read through the single resolver (flag-off = legacy, identical).
  const resolved = await loadResolvedPaymentMethods(supabase, tenant.restaurantId, {
    paymentConfig: data?.payment_config ?? DEFAULT_PAYMENT_CONFIG,
    featureFlags: (data?.feature_flags as Record<string, unknown> | null) ?? null,
  });
  return NextResponse.json(resolved.config);
}

/** Merge a partial wallet patch over the current wallet, keeping the id field
 *  (`number` for Vodafone Cash, `handle` for InstaPay). */
function mergeWallet(current: WalletConfig, patch: unknown, kind: "number" | "handle"): WalletConfig {
  if (!patch || typeof patch !== "object") return current;
  const p = patch as Record<string, unknown>;
  return {
    enabled: typeof p.enabled === "boolean" ? p.enabled : current.enabled,
    [kind]: typeof p[kind] === "string" ? (p[kind] as string).trim() : (current[kind] ?? ""),
    instructions: typeof p.instructions === "string" ? p.instructions : current.instructions,
  } as WalletConfig;
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Start from the stored config so a partial patch preserves untouched fields.
  const { data } = await supabase
    .from("restaurants")
    .select("payment_config, feature_flags")
    .eq("id", tenant.restaurantId)
    .single();
  const flags = (data?.feature_flags as Record<string, unknown> | null) ?? null;
  // WO-T1-PAYMENTS: current config comes through the single resolver.
  const current = (
    await loadResolvedPaymentMethods(supabase, tenant.restaurantId, {
      paymentConfig: data?.payment_config ?? DEFAULT_PAYMENT_CONFIG,
      featureFlags: flags,
    })
  ).config;

  let next: PaymentConfig = {
    cod_enabled: typeof body.cod_enabled === "boolean" ? body.cod_enabled : current.cod_enabled,
    wallet_policy: body.wallet_policy === "lenient" || body.wallet_policy === "strict" ? body.wallet_policy : current.wallet_policy,
    vodafone_cash: mergeWallet(current.vodafone_cash, body.vodafone_cash, "number"),
    instapay: mergeWallet(current.instapay, body.instapay, "handle"),
  };
  // never-all-off at WRITE time — a save that would leave zero enabled methods keeps
  // COD on (safe default). Flag-gated so flag-off saves stay byte-identical to today.
  if (isFeatureExplicitlyEnabled("canonical_payment_methods", flags)) {
    next = enforceNeverAllOff(next);
  }

  try {
    await mustWrite<{ id: string }>(
      supabase
        .from("restaurants")
        .update({ payment_config: next })
        .eq("id", tenant.restaurantId)
        .select("id"),
      "settings.payment.update",
      { exactRows: 1 },
    );
  } catch (error) {
    if (error instanceof DatabaseOperationError && error.code === "KIVO_ROW_COUNT_MISMATCH") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "update_failed", detail }, { status: 502 });
  }
  return NextResponse.json(next);
}
