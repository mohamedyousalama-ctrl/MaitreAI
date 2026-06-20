"use client";

// ============================================================================
// MaitreAI — Payment Sprint 1: manual-wallet config card (settings)
// Operator toggles for cash-on-delivery + two manual wallets (Vodafone Cash,
// InstaPay), persisting restaurants.payment_config via /api/settings/payment.
// Config only — turning COD off just stops offering it; no order-flow change.
// ============================================================================

import { useEffect, useState } from "react";
import { SettingsCard } from "@/components/ui/SettingsCard";
import { cn } from "@/lib/utils";
import { Wallet } from "lucide-react";
import { DEFAULT_PAYMENT_CONFIG, type PaymentConfig, type WalletConfig } from "@/lib/payments/config";

export function PaymentConfigCard() {
  const [cfg, setCfg] = useState<PaymentConfig>(DEFAULT_PAYMENT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/payment")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCfg(d as PaymentConfig);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const r = await fetch("/api/settings/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (r.ok) setCfg((await r.json()) as PaymentConfig);
    } catch {
      /* ignore — the toggle reverts on next load if the write failed */
    }
    setSaving(false);
  }

  const busy = !loaded || saving;

  return (
    <SettingsCard
      title="طرق الدفع"
      description="الدفع عند الاستلام والمحافظ اليدوية (فودافون كاش / إنستاباي)."
      icon={Wallet}
      accentBg="bg-settings"
    >
      {/* Cash on delivery */}
      <ToggleRow
        label="الدفع عند الاستلام (كاش)"
        sub="الوضع الافتراضي مفعّل."
        checked={cfg.cod_enabled}
        disabled={busy}
        onToggle={(v) => save({ cod_enabled: v })}
      />

      {/* Vodafone Cash */}
      <WalletRow
        label="فودافون كاش"
        idLabel="رقم المحفظة"
        idPlaceholder="01xxxxxxxxx"
        idValue={cfg.vodafone_cash.number ?? ""}
        wallet={cfg.vodafone_cash}
        disabled={busy}
        onSave={(patch) => save({ vodafone_cash: patch })}
        idKey="number"
      />

      {/* InstaPay */}
      <WalletRow
        label="إنستاباي"
        idLabel="العنوان / المعرّف"
        idPlaceholder="name@instapay"
        idValue={cfg.instapay.handle ?? ""}
        wallet={cfg.instapay}
        disabled={busy}
        onSave={(patch) => save({ instapay: patch })}
        idKey="handle"
      />
    </SettingsCard>
  );
}

function ToggleRow({
  label,
  sub,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onToggle(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-settings" : "bg-slate-200"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "right-0.5" : "right-[22px]"
          )}
        />
      </button>
    </div>
  );
}

function WalletRow({
  label,
  idLabel,
  idPlaceholder,
  idValue,
  wallet,
  disabled,
  onSave,
  idKey,
}: {
  label: string;
  idLabel: string;
  idPlaceholder: string;
  idValue: string;
  wallet: WalletConfig;
  disabled?: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  idKey: "number" | "handle";
}) {
  const [id, setId] = useState(idValue);
  const [instructions, setInstructions] = useState(wallet.instructions);

  useEffect(() => setId(idValue), [idValue]);
  useEffect(() => setInstructions(wallet.instructions), [wallet.instructions]);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <ToggleRow
        label={label}
        checked={wallet.enabled}
        disabled={disabled}
        onToggle={(v) => onSave({ enabled: v })}
      />
      {wallet.enabled && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-slate-500">
            {idLabel}
            <input
              type="text"
              dir="ltr"
              value={id}
              placeholder={idPlaceholder}
              disabled={disabled}
              onChange={(e) => setId(e.target.value)}
              onBlur={() => onSave({ [idKey]: id })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-settings"
            />
          </label>
          <label className="block text-xs text-slate-500">
            تعليمات للعميل (اختياري)
            <textarea
              rows={2}
              value={instructions}
              placeholder="مثال: حوّل المبلغ ثم ابعت صورة التحويل."
              disabled={disabled}
              onChange={(e) => setInstructions(e.target.value)}
              onBlur={() => onSave({ instructions })}
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-settings"
            />
          </label>
        </div>
      )}
    </div>
  );
}
