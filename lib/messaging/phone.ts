// ============================================================================
// MaitreAI — Phone number normalization (E.164-ish, no leading "+")
// WhatsApp Cloud API's `to` field wants international format with NO "+", NO
// spaces, and NO national trunk "0" — e.g. Egyptian 201030036000, not
// 01030036000 / +20 10... / 1030036000. A local-format number reaches Meta as
// an unknown recipient and is rejected with #131030 ("Recipient phone number
// not in allowed list"). This module turns whatever an operator typed (or a
// legacy row stored) into the canonical wire format.
//
// Country-AWARE by design: Kivo expands to Saudi/MENA, so we never assume
// "leading 0 → 20". Each country is one entry in COUNTRY_DIAL; adding a new
// market is a config addition, not a rewrite. Pure (no node-only deps) so it is
// safe to bundle alongside the WhatsApp adapter on both server and client.
// ============================================================================

interface DialRule {
  /** ISO-3166 alpha-2 (matches restaurants.country). */
  readonly iso: string;
  /** Country calling code, digits only (Egypt "20", Saudi "966"). */
  readonly cc: string;
  /** Length of the national significant number (mobile), excluding trunk/cc. */
  readonly nationalLen: number;
  /** Leading digit(s) of a national mobile number (Egypt "1", Saudi "5"). */
  readonly mobilePrefix: string;
}

// Order matters only for the country-agnostic fallback scan below; explicit
// country lookups are exact. Add a market by appending one row.
export const COUNTRY_DIAL: Readonly<Record<string, DialRule>> = {
  EG: { iso: "EG", cc: "20", nationalLen: 10, mobilePrefix: "1" }, // 01XXXXXXXXX → 201XXXXXXXXX
  SA: { iso: "SA", cc: "966", nationalLen: 9, mobilePrefix: "5" }, // 05XXXXXXXX  → 9665XXXXXXXX
};

const RULES = Object.values(COUNTRY_DIAL);

/** Does `d` look like a valid INTERNATIONAL number under `r` (cc + national)? */
function isInternational(d: string, r: DialRule): boolean {
  return d.startsWith(r.cc) && d.length === r.cc.length + r.nationalLen && d[r.cc.length] === r.mobilePrefix;
}

/** Apply one country rule to bare digits; null if it doesn't fit this country. */
function applyRule(d: string, r: DialRule): string | null {
  // Already international (20… / 966…) — leave unchanged.
  if (isInternational(d, r)) return d;
  // Local with trunk "0" (01… / 05…) — drop the 0, prepend the calling code.
  if (d.startsWith("0" + r.mobilePrefix) && d.length === 1 + r.nationalLen) return r.cc + d.slice(1);
  // Bare national, no trunk and no cc (1030036000 / 5XXXXXXXX) — prepend cc.
  if (d.startsWith(r.mobilePrefix) && d.length === r.nationalLen) return r.cc + d;
  return null;
}

/**
 * Normalize a phone number to WhatsApp wire format (international, no "+").
 *
 * @param raw      Whatever was typed/stored ("+20 10…", "01030036000", …).
 * @param country  Tenant ISO country (restaurants.country) to disambiguate a
 *                 local number. When omitted, every known country rule is tried
 *                 and the unambiguous match wins (EG 11-digit "01…" and SA
 *                 10-digit "05…" never collide), so existing mis-stored rows
 *                 still send correctly.
 *
 * Never corrupts: if no rule fits (junk, unknown country, partial input) the
 * bare digits are returned unchanged — the caller's worst case is the status
 * quo, never a silently mangled number.
 */
export function normalizePhone(raw: string, country?: string | null): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  // "00" international access prefix → drop it (e.g. 002010… → 2010…).
  if (d.startsWith("00")) d = d.slice(2);

  const iso = country?.toUpperCase();
  if (iso && COUNTRY_DIAL[iso]) {
    const hit = applyRule(d, COUNTRY_DIAL[iso]);
    if (hit) return hit;
  }
  // No country (or it didn't fit): try every rule, accept the first that fits.
  for (const r of RULES) {
    const hit = applyRule(d, r);
    if (hit) return hit;
  }
  return d;
}
