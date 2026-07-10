// Unit tests for WO-SIGNUP-ENV-SPLIT — the dedicated Embedded Signup OAuth app.
// RED-FIRST proof: the token exchange uses SIGNUP_* and the messaging app's
// WHATSAPP_APP_SECRET is NEVER sent to Meta's token endpoint; absent SIGNUP_* →
// clean not-configured degrade (no silent fallback to the messaging secret).
// Run: node --experimental-strip-types scripts/test-signup-env-split.test.ts
import {
  signupAppCreds,
  isSignupConfigured,
  buildSignupTokenExchangeUrl,
} from "../lib/onboarding/signup-oauth.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// A messaging secret that MUST NEVER leak into the signup token exchange.
const MESSAGING_SECRET = "MESSAGING_SECRET_MUST_NEVER_LEAK";
const MESSAGING_APP_ID = "MESSAGING_APP_ID_000";

function clearEnv() {
  delete process.env.SIGNUP_APP_ID;
  delete process.env.SIGNUP_APP_SECRET;
}

// ── Configured: distinct signup values, distinct messaging values present ────
clearEnv();
process.env.WHATSAPP_APP_ID = MESSAGING_APP_ID;
process.env.WHATSAPP_APP_SECRET = MESSAGING_SECRET;
process.env.SIGNUP_APP_ID = "SIGNUP_ID_123";
process.env.SIGNUP_APP_SECRET = "SIGNUP_SECRET_abc";

const creds = signupAppCreds();
ok("signupAppCreds returns the SIGNUP_* values", !!creds && creds.appId === "SIGNUP_ID_123" && creds.appSecret === "SIGNUP_SECRET_abc");
ok("isSignupConfigured true when both set", isSignupConfigured() === true);

const url = buildSignupTokenExchangeUrl("theAuthCode");
ok("token exchange URL is built when configured", typeof url === "string" && url!.length > 0);
ok("URL sends client_id = SIGNUP_APP_ID", url!.includes("client_id=SIGNUP_ID_123"));
ok("URL sends client_secret = SIGNUP_APP_SECRET", url!.includes("client_secret=SIGNUP_SECRET_abc"));
ok("URL carries the auth code", url!.includes("code=theAuthCode"));
ok("URL hits Meta's oauth/access_token endpoint", url!.includes("/oauth/access_token"));
// ★ the incident-class guarantee: the messaging secret is NEVER in the request.
ok("★ messaging WHATSAPP_APP_SECRET is NEVER in the token request", !url!.includes(MESSAGING_SECRET));
ok("★ messaging WHATSAPP_APP_ID is NEVER used as client_id", !url!.includes(MESSAGING_APP_ID));

// ── Absent SIGNUP_* → clean not-configured (NO fallback to messaging secret) ──
clearEnv();
// messaging vars STILL present — must not be borrowed.
process.env.WHATSAPP_APP_SECRET = MESSAGING_SECRET;
process.env.WHATSAPP_APP_ID = MESSAGING_APP_ID;
ok("signupAppCreds null when SIGNUP_* absent", signupAppCreds() === null);
ok("isSignupConfigured false when absent", isSignupConfigured() === false);
ok("buildSignupTokenExchangeUrl null when absent (clean degrade)", buildSignupTokenExchangeUrl("x") === null);
ok("★ NO fallback: messaging secret never surfaces when signup is unconfigured",
  buildSignupTokenExchangeUrl("x") === null);

// ── Partial config → treated as not configured (both required) ───────────────
clearEnv();
process.env.SIGNUP_APP_ID = "only_id_no_secret";
ok("id without secret → not configured", isSignupConfigured() === false && buildSignupTokenExchangeUrl("x") === null);
clearEnv();
process.env.SIGNUP_APP_SECRET = "only_secret_no_id";
ok("secret without id → not configured", isSignupConfigured() === false);

// ── Hygiene: whitespace-only is treated as unset; values are trimmed ─────────
clearEnv();
process.env.SIGNUP_APP_ID = "   ";
process.env.SIGNUP_APP_SECRET = "   ";
ok("whitespace-only → not configured", isSignupConfigured() === false);
clearEnv();
process.env.SIGNUP_APP_ID = "  padded_id  ";
process.env.SIGNUP_APP_SECRET = "  padded_secret  ";
ok("values are trimmed", signupAppCreds()?.appId === "padded_id" && signupAppCreds()?.appSecret === "padded_secret");

console.log(`\nSIGNUP-ENV-SPLIT UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
