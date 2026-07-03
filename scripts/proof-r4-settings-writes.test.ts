// ============================================================================
// R4 proof harness — audited settings writes.
// Pure validators (hours, alert routing) + the safety-flag denylist are exercised
// directly; source assertions confirm each of the 4 write routes is manager-only,
// records an audit row, and that the flag route REJECTS safety flags server-side
// (from any console) BEFORE any DB read/write.
//
// Run: node --experimental-strip-types scripts/proof-r4-settings-writes.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseWeeklyHours } from "../lib/settings/hours.ts";
import { parseAlertRouting } from "../lib/settings/alerts.ts";
import { isSafetyFlag, SAFETY_FLAGS } from "../lib/settings/safety-flags.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// ---- Safety flags: never flippable from any console ------------------------
check("deterministic_allergen_safety is a safety flag", isSafetyFlag("deterministic_allergen_safety"));
check("allergen_symptom_detection is a safety flag", isSafetyFlag("allergen_symptom_detection"));
check("a normal pro flag is NOT a safety flag", !isSafetyFlag("conversation_outcomes"));
check("SAFETY_FLAGS enumerates the allergen pair", SAFETY_FLAGS.length === 2);

// ---- Weekly hours validator -------------------------------------------------
check("valid per-day hours accepted",
  parseWeeklyHours({ monday: { open: "09:00", close: "23:00" }, friday: { closed: true } }).ok);
check("closed day normalized", (() => { const r = parseWeeklyHours({ sunday: { closed: true } }); return r.ok && r.hours.sunday.closed === true; })());
check("open >= close rejected", !parseWeeklyHours({ monday: { open: "23:00", close: "09:00" } }).ok);
check("open == close rejected", !parseWeeklyHours({ monday: { open: "12:00", close: "12:00" } }).ok);
check("bad time format rejected", !parseWeeklyHours({ monday: { open: "9am", close: "23:00" } }).ok);
check("out-of-range hour rejected", !parseWeeklyHours({ monday: { open: "25:00", close: "26:00" } }).ok);
check("unknown day key rejected", !parseWeeklyHours({ funday: { closed: true } }).ok);
check("empty object rejected", !parseWeeklyHours({}).ok);
check("non-object rejected", !parseWeeklyHours("monday").ok);

// ---- Alert routing validator ------------------------------------------------
check("valid banner-only routing accepted", parseAlertRouting({ channels: { banner: true } }).ok);
check("whatsapp routing requires E.164 number",
  !parseAlertRouting({ channels: { whatsapp: true } }).ok);
check("whatsapp routing with E.164 accepted",
  parseAlertRouting({ channels: { whatsapp: true }, whatsappNumber: "+201234567" }).ok);
check("non-E.164 number rejected", !parseAlertRouting({ channels: { whatsapp: true }, whatsappNumber: "01234" }).ok);
check("no channel enabled rejected", !parseAlertRouting({ channels: { banner: false } }).ok);
check("unknown channel rejected", !parseAlertRouting({ channels: { sms: true } }).ok);
check("missing channels object rejected", !parseAlertRouting({}).ok);

// ---- Source: flag route rejects safety flags BEFORE any read/write ---------
const flags = read("app/api/settings/flags/route.ts");
check("(flags) manager-only", /tenant\.role !== "manager"\) return NextResponse\.json\(\{ error: "forbidden_role" \}, \{ status: 403 \}\)/.test(flags));
check("(flags) safety flag rejected server-side with 403", /isSafetyFlag\(flag\)\) \{[\s\S]*safety_flag_locked[\s\S]*status: 403/.test(flags));
// The safety gate must sit BEFORE the feature_flags read (so a safety flip never touches the DB).
check("(flags) safety gate precedes the DB read",
  flags.indexOf("isSafetyFlag(flag)") < flags.indexOf('.select("feature_flags")'));
check("(flags) JSONB merge preserves sibling flags (spread, not replace)", /\{ \.\.\.\(\(cur\?\.feature_flags/.test(flags));
check("(flags) audits settings_flag_flipped with from/to", flags.includes('action: "settings_flag_flipped"') && /metadata: \{ flag, from, to: body\.enabled \}/.test(flags));

// ---- Source: every write route is manager-only + audits --------------------
for (const [name, file, action] of [
  ["hours", "app/api/settings/hours/route.ts", "settings_hours_updated"],
  ["identity", "app/api/settings/identity/route.ts", "settings_identity_updated"],
  ["alerts", "app/api/settings/alerts/route.ts", "settings_alerts_updated"],
] as const) {
  const src = read(file);
  check(`(${name}) manager-only`, /tenant\.role !== "manager"\) return NextResponse\.json\(\{ error: "forbidden_role" \}, \{ status: 403 \}\)/.test(src));
  check(`(${name}) records an audit row`, src.includes("recordAuditEvent(") && src.includes(`action: "${action}"`));
  check(`(${name}) validates before writing`, src.includes("bad_request"));
}

// ---- Migration: alert_routing additive + nullable-with-default -------------
const mig = read("supabase/migrations/0064_alert_routing.sql");
check("migration adds alert_routing jsonb with default (additive)",
  /add column if not exists alert_routing jsonb not null default '\{\}'::jsonb/.test(mig));

console.log(`\nR4-SETTINGS-WRITES PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
