export const MOYASAR_COUNTRY = "SA";
export const MOYASAR_CURRENCY_ISO = "SAR";

const MOYASAR_DISPLAY_CURRENCIES = new Set(["SAR", "ر.س", "ر.س."]);

export type MoyasarEligibilityFailure =
  | "psp_country_not_supported"
  | "psp_currency_mismatch";

export type MoyasarEligibilityResult =
  | { ok: true; country: string; tenantCurrency: string }
  | {
      ok: false;
      error: MoyasarEligibilityFailure;
      alertType: "psp_country_not_supported" | "psp_currency_mismatch";
      detail: string;
      context: Record<string, unknown>;
    };

export function normalizedMoyasarCountry(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function isMoyasarTenantCurrency(value: unknown): boolean {
  return typeof value === "string" && MOYASAR_DISPLAY_CURRENCIES.has(value.trim().toUpperCase());
}

export function checkMoyasarTenantEligibility(input: {
  restaurantId: string;
  country: unknown;
  tenantCurrency: unknown;
}): MoyasarEligibilityResult {
  const country = normalizedMoyasarCountry(input.country);
  if (country !== MOYASAR_COUNTRY) {
    return {
      ok: false,
      error: "psp_country_not_supported",
      alertType: "psp_country_not_supported",
      detail: `Refused Moyasar session for restaurant ${input.restaurantId}: country ${country || "missing"} is not ${MOYASAR_COUNTRY}.`,
      context: { country: country || null, expectedCountry: MOYASAR_COUNTRY },
    };
  }

  const tenantCurrency = typeof input.tenantCurrency === "string" ? input.tenantCurrency.trim() : "";
  if (!isMoyasarTenantCurrency(tenantCurrency)) {
    return {
      ok: false,
      error: "psp_currency_mismatch",
      alertType: "psp_currency_mismatch",
      detail: `Refused Moyasar session for restaurant ${input.restaurantId}: tenant currency ${tenantCurrency || "missing"} is not ${MOYASAR_CURRENCY_ISO}.`,
      context: { tenantCurrency: tenantCurrency || null, expectedCurrency: MOYASAR_CURRENCY_ISO },
    };
  }

  return { ok: true, country, tenantCurrency };
}
