// ============================================================================
// DRYRUN-2 proof harness — console-initiated sends use TENANT creds (audit F1).
// Two layers of proof:
//  (A) RUNTIME: the real runWithTenantWhatsAppCreds binds the tenant's decrypted
//      creds when present, and is a transparent env pass-through when absent —
//      observed through the SAME getWhatsAppCredsOverride() the outbound layer
//      reads. This proves both "tenant creds win when present" AND the byte-
//      identical no-regression fallback.
//  (B) SOURCE: the three console-initiated call sites (manual send, resume,
//      receipt image) are wrapped, the webhook binding is unchanged, and the
//      alerts path stays intentionally global.
//
// Run (server-only stubbed via the react-server condition; real crypto key):
//   CREDENTIALS_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
//     node --conditions=react-server --import <tsx>/dist/loader.mjs scripts/proof-tenant-creds.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runWithTenantWhatsAppCreds } from "../lib/messaging/tenant-creds.ts";
import { getWhatsAppCredsOverride } from "../lib/messaging/creds-context.ts";
import { encryptSecret } from "../lib/crypto/secrets.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); }
}

// A fake service-role admin client: only .from("restaurants").select(...).eq("id",…)
// .maybeSingle() is exercised by resolveTenantWhatsAppEnvById. We return a row
// whose wa_access_token_enc decrypts (or not) per the scenario.
function fakeAdmin(row: Record<string, unknown> | null) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: row, error: null }); },
      };
    },
  } as unknown as Parameters<typeof runWithTenantWhatsAppCreds>[0];
}

async function run() {
  // ---- (A1) tenant configured → override is the tenant's decrypted creds ----
  const tokenEnc = encryptSecret("TENANT_TOKEN_123");
  const configuredRow = {
    id: "rest-1",
    wa_phone_number_id: "PNID_TENANT",
    wa_verify_token: "vt",
    wa_access_token_enc: tokenEnc,
    wa_app_secret_enc: null,
    wa_configured_at: "2026-01-01T00:00:00Z",
  };
  let observed: unknown = "UNSET";
  await runWithTenantWhatsAppCreds(fakeAdmin(configuredRow), "rest-1", async () => {
    observed = getWhatsAppCredsOverride();
  });
  const o = observed as { accessToken?: string; phoneNumberId?: string } | null;
  check("(A1) configured tenant → override set to tenant creds", !!o && o.accessToken === "TENANT_TOKEN_123");
  check("(A1) override carries the tenant phone_number_id", !!o && o.phoneNumberId === "PNID_TENANT");

  // ---- (A2) NO per-tenant creds → override is null (env fallback) -----------
  // Case: not configured (wa_configured_at null).
  let observed2: unknown = "UNSET";
  await runWithTenantWhatsAppCreds(fakeAdmin({ id: "rest-1", wa_configured_at: null, wa_access_token_enc: null }), "rest-1", async () => {
    observed2 = getWhatsAppCredsOverride();
  });
  check("(A2) unconfigured tenant → override null (env pass-through, no regression)", observed2 === null);

  // Case: row missing entirely (e.g. lookup returned nothing) → null.
  let observed3: unknown = "UNSET";
  await runWithTenantWhatsAppCreds(fakeAdmin(null), "rest-1", async () => {
    observed3 = getWhatsAppCredsOverride();
  });
  check("(A2) missing row → override null (env pass-through)", observed3 === null);

  // Case: configured flag set but token ciphertext is garbage → decrypt fails → null.
  let observed4: unknown = "UNSET";
  await runWithTenantWhatsAppCreds(
    fakeAdmin({ id: "rest-1", wa_configured_at: "2026-01-01T00:00:00Z", wa_access_token_enc: "not-a-valid-ciphertext" }),
    "rest-1",
    async () => { observed4 = getWhatsAppCredsOverride(); }
  );
  check("(A2) undecryptable token → override null (env fallback, never throws)", observed4 === null);

  // ---- (A3) outside any wrapper the override is null (baseline) -------------
  check("(A3) no wrapper → override null (baseline env behavior)", getWhatsAppCredsOverride() === null);

  // ---- (B) SOURCE assertions: the three wraps + invariants -----------------
  const send = readFileSync(join(ROOT, "app/api/whatsapp/send/route.ts"), "utf8");
  check("(B) manual send wraps sendWhatsAppText in runWithTenantWhatsAppCreds",
    send.includes("runWithTenantWhatsAppCreds(") && send.includes("sendWhatsAppText({ to: phone, text, lastInboundAtMs })"));
  check("(B) manual send keeps a bare fallback when admin unavailable",
    /credsAdmin\s*\?/.test(send));

  const resume = readFileSync(join(ROOT, "app/api/conversations/[id]/resume/route.ts"), "utf8");
  check("(B) resume wraps respondAndSendWhatsApp in runWithTenantWhatsAppCreds",
    resume.includes("runWithTenantWhatsAppCreds(") && resume.includes("respondAndSendWhatsApp(admin, tenant.restaurantId, params.id)"));

  const receipt = readFileSync(join(ROOT, "app/api/orders/[id]/send-receipt/route.ts"), "utf8");
  check("(B) receipt wraps sendReceiptToCustomer in runWithTenantWhatsAppCreds",
    receipt.includes("runWithTenantWhatsAppCreds(") && receipt.includes("sendReceiptToCustomer(supabase, params.id)"));

  // Webhook binding UNCHANGED (still binds perTenantEnv the original way).
  const webhook = readFileSync(join(ROOT, "app/api/whatsapp/webhook/route.ts"), "utf8");
  check("(B) webhook still binds via runWithWhatsAppCreds(perTenantEnv, …) — unchanged",
    webhook.includes("runWithWhatsAppCreds(perTenantEnv"));
  check("(B) webhook does NOT use the console helper (untouched)",
    !webhook.includes("runWithTenantWhatsAppCreds"));

  // Alerts path intentionally global — must NOT adopt the tenant helper.
  const alerts = readFileSync(join(ROOT, "lib/alerts/whatsapp.ts"), "utf8");
  check("(B) alerts path stays global (runWithWhatsAppCreds(null, …), no tenant helper)",
    alerts.includes("runWithWhatsAppCreds(null") && !alerts.includes("runWithTenantWhatsAppCreds"));

  // Crypto is reused, not duplicated: the by-id resolver lives in db/restaurants.ts
  // and there is exactly ONE decrypt helper module import in the new wrapper.
  const tc = readFileSync(join(ROOT, "lib/messaging/tenant-creds.ts"), "utf8");
  check("(B) wrapper reuses the db resolver (no crypto in the wrapper)",
    tc.includes("resolveTenantWhatsAppEnvById") && !tc.includes("decryptSecret"));

  console.log(`\nTENANT-CREDS PROOF: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
run();
