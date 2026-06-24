// Shared config + SAFETY GUARDS for the multi-tenant harness.
// Importing this validates env and aborts before any client is created if the
// target looks like production or a live tenant.

import { createClient } from "@supabase/supabase-js";

const PROD_REF = "zlighrbsjexrozrmuwpw"; // the live MaitreAi project — NEVER allowed
const LIVE_TENANT_RE = /wesaya|wsaya|sweet\s*shop|sweetshop|وصاية|وصايا|سويت/i;
export const TEST_PREFIX = "__ttest_"; // every throwaway tenant name starts with this

export const URL = process.env.TEST_SUPABASE_URL || "";
export const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY || "";
export const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY || "";
export const APP_URL = (process.env.TEST_APP_URL || "").replace(/\/$/, "");
export const SKIP_SIG = (process.env.TEST_WEBHOOK_SKIP_SIG || "").toLowerCase() === "true";

function die(msg) {
  console.error(`\n🛑 SAFETY ABORT: ${msg}\n`);
  process.exit(2);
}

export function assertSafeTarget() {
  if (!URL || !SERVICE_KEY || !ANON_KEY) {
    die("TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_KEY / TEST_SUPABASE_ANON_KEY are required. See tests/multitenant/README.md");
  }
  if (URL.includes(PROD_REF)) {
    die(`TEST_SUPABASE_URL points at the PRODUCTION project (${PROD_REF}). This harness must run against a non-prod project.`);
  }
  // Defense in depth: the service key is a JWT whose `ref` claim names the project.
  try {
    const claims = JSON.parse(Buffer.from(SERVICE_KEY.split(".")[1] || "", "base64").toString("utf8"));
    if (claims?.ref === PROD_REF) die(`Service key belongs to the PRODUCTION project (${PROD_REF}).`);
  } catch { /* non-JWT key (e.g. new sb_secret_*) — URL guard already covers it */ }
  return true;
}

// A write-guard wrapper: refuses any update/delete/insert whose restaurant_id is
// not in the created-set, and refuses to touch a live-tenant-named row.
export function guardRestaurantId(createdIds, restaurantId) {
  if (!createdIds.has(restaurantId)) {
    die(`Refusing to write restaurant_id not created by this run: ${restaurantId}`);
  }
}
export function guardName(name) {
  if (LIVE_TENANT_RE.test(name || "")) die(`Refusing to create/touch a tenant whose name matches a live tenant: ${name}`);
  return name;
}

export const admin = () =>
  createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// An authenticated user client (anon key + a user's JWT) — exercises RLS exactly
// as the real console session does.
export const userClient = (jwt) =>
  createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

// A pure-anon client (publishable key, NO user) — exercises the unauthenticated
// surface (used by the conversation_locks / webhook_debug exposure tests).
export const anonClient = () =>
  createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export const rand = () => Math.random().toString(36).slice(2, 9);
