// Unit tests for the WhatsApp webhook routing decision (WO — Wesaya restore, Option B).
// RED-FIRST: reproduces tonight's drop — an inbound phone_number_id that equals the
// configured global WHATSAPP_PHONE_NUMBER_ID was being DROPPED; it must now route via
// the global env creds. Also proves the fallback is NARROW: any OTHER unmapped number
// still drops (per-tenant isolation), and a mapped tenant still resolves per-tenant.
// Run: node --experimental-strip-types scripts/test-webhook-routing.test.ts
import { decideWebhookRouting } from "../lib/messaging/webhook-routing.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const WESAYA_NEW = "1235877629606597"; // tonight's new Wesaya number (= global env PNID)
const OTHER = "9999999999999";          // some other, unmapped number

// ★ RED-FIRST — tonight's incident: unmapped PNID == configured global → was DROPPED,
// now routes via global env creds (Wesaya restored).
ok("global number (no tenant) → env_fallback (was dropped — the fix)",
  decideWebhookRouting(false, WESAYA_NEW, WESAYA_NEW) === "env_fallback");

// Narrowness — a DIFFERENT unmapped number still drops (per-tenant isolation intact).
ok("other unmapped number → drop (isolation intact)",
  decideWebhookRouting(false, OTHER, WESAYA_NEW) === "drop");

// A mapped tenant still resolves per-tenant, untouched — even if its PNID equals global.
ok("resolved tenant → per_tenant (untouched)",
  decideWebhookRouting(true, OTHER, WESAYA_NEW) === "per_tenant");
ok("resolved tenant wins even when PNID == global",
  decideWebhookRouting(true, WESAYA_NEW, WESAYA_NEW) === "per_tenant");

// Legacy: no phone_number_id at all → env fallback (unchanged).
ok("no phone_number_id → env_fallback (legacy)", decideWebhookRouting(false, null, WESAYA_NEW) === "env_fallback");
ok("empty phone_number_id → env_fallback (legacy)", decideWebhookRouting(false, "", WESAYA_NEW) === "env_fallback");

// Narrowness guard — the global branch only applies when global env is CONFIGURED.
ok("unmapped PNID with UNSET global env → drop (no accidental catch-all)",
  decideWebhookRouting(false, WESAYA_NEW, "") === "drop");
ok("unmapped PNID with null global env → drop", decideWebhookRouting(false, WESAYA_NEW, null) === "drop");

// Hygiene: whitespace/trim tolerance on the match.
ok("PNID match tolerates surrounding whitespace", decideWebhookRouting(false, ` ${WESAYA_NEW} `, WESAYA_NEW) === "env_fallback");

console.log(`\nWEBHOOK ROUTING UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
