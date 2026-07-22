// WO-PROOF-2 observability proof.
// Run:
//   node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//     scripts/proof-observability.test.ts

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { recordCriticalAlert, type CriticalAlertType } from "../lib/alerts/record.ts";
import { sendAlertEmail } from "../lib/alerts/email.ts";
import { sendAlertWhatsApp } from "../lib/alerts/whatsapp.ts";
import { alertGuidance } from "../lib/alerts/guidance.ts";
import { withinCooldown } from "../lib/monitoring/checks.ts";

const ROOT = resolve(process.cwd());
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

type Severity = "critical" | "high";
type Channel =
  | "system_alerts_banner"
  | "alert_whatsapp_if_configured"
  | "email_scaffold"
  | "external_github_whatsapp_if_configured"
  | "github_actions_failure_email";

const ALERT_CATALOG: Record<CriticalAlertType, { severity: Severity; channels: readonly Channel[] }> = {
  agent_error: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  whatsapp_send_failed: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  inbound_persist_failed: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  order_persist_failed: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  receipt_send_failed: { severity: "high", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  cod_capture_failed: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  operator_send_failed: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  delivered_without_driver_override: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  payment_unspecified: { severity: "high", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  outcome_classify_failed: { severity: "high", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  payment_amount_mismatch: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  payment_stamp_failed: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  paid_after_expiry: { severity: "high", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  paid_while_safety_held: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  voice_tts_fallback: { severity: "high", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  voice_stt_unavailable: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  delivery_silence: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  webhook_signature_spike: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  webhook_unresolved_spike: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  webhook_tenant_resolution_failed: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  agent_error_rate: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  daily_spend: { severity: "high", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  uptime_down: { severity: "critical", channels: ["external_github_whatsapp_if_configured", "github_actions_failure_email"] },
  allergy_added_post_commit: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  safety_notify_no_hold: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  allergy_emergency_active: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  allergy_calm_hold: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
  safety_unattended_handoff: { severity: "critical", channels: ["system_alerts_banner", "alert_whatsapp_if_configured", "email_scaffold"] },
};

const ENV_KEYS = [
  "ALERT_EMAILS",
  "ALERT_WHATSAPP_TO",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "NEXT_PUBLIC_APP_URL",
] as const;
const SAVED_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let pass = 0;
let fail = 0;
let openFinding = 0;
let skipped = 0;

function line(kind: string, name: string, detail?: unknown): void {
  if (detail === undefined) console.log(`${kind} ${name}`);
  else console.log(`${kind} ${name}`, detail);
}

function INVARIANT(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    pass++;
    line("PASS", name);
  } else {
    fail++;
    line("FAIL", name, detail);
  }
}

function OPEN_FINDING(name: string, present: boolean, detail?: unknown): void {
  if (present) {
    openFinding++;
    line("OPEN_FINDING", name, detail);
  } else {
    fail++;
    line("FAIL OPEN_FINDING no longer reproduces; update proof", name);
  }
}

function SKIP(name: string, reason: string): void {
  skipped++;
  line("SKIP", `${name}: ${reason}`);
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = SAVED_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearAlertEnv(): void {
  delete process.env.ALERT_EMAILS;
  delete process.env.ALERT_WHATSAPP_TO;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
}

type DbFilter = { method: string; col: string; val: unknown };
type DbCall = {
  table: string;
  op: string;
  payload?: unknown;
  select?: string | null;
  filters: DbFilter[];
};
type ActiveAlert = {
  id: string;
  conversation_id?: string | null;
  context?: Record<string, unknown> | null;
};

function hasFilter(call: DbCall | undefined, method: string, col: string, val: unknown): boolean {
  return !!call?.filters.some((filter) => filter.method === method && filter.col === col && filter.val === val);
}

function makeFakeAdmin(opts: {
  activeAlerts?: ActiveAlert[];
  systemAlertInsertThrows?: boolean;
  restaurantName?: string | null;
} = {}) {
  const calls: DbCall[] = [];

  function resultFor(call: DbCall): { data: unknown; error: null } {
    if (call.table === "system_alerts" && call.op === "select") {
      return { data: opts.activeAlerts ?? [], error: null };
    }
    if (call.table === "system_alerts" && call.op === "insert") {
      return { data: [{ id: "alert-new" }], error: null };
    }
    if (call.table === "system_alerts" && call.op === "update") {
      return { data: [{ id: "alert-existing" }], error: null };
    }
    if (call.table === "restaurants" && call.op === "select") {
      return { data: opts.restaurantName ? { name: opts.restaurantName } : null, error: null };
    }
    return { data: null, error: null };
  }

  function from(table: string) {
    const state: DbCall = { table, op: "query", select: null, filters: [] };
    const remember = (op: string, payload?: unknown) => {
      state.op = op;
      state.payload = payload;
      if (!calls.includes(state)) calls.push(state);
    };
    const builder: Record<string, unknown> = {};
    builder.select = (cols?: string) => {
      if (state.op === "query") state.op = "select";
      state.select = cols ?? "*";
      if (!calls.includes(state)) calls.push(state);
      return builder;
    };
    builder.insert = (payload: unknown) => {
      if (opts.systemAlertInsertThrows && table === "system_alerts") {
        throw new Error("system_alerts insert boom");
      }
      remember("insert", payload);
      return builder;
    };
    builder.update = (payload: unknown) => {
      remember("update", payload);
      return builder;
    };
    builder.upsert = (payload: unknown) => {
      remember("upsert", payload);
      return builder;
    };
    for (const method of ["eq", "neq", "is", "not", "gt", "gte", "lt", "lte", "order", "limit", "in", "contains"]) {
      builder[method] = (col?: string, val?: unknown) => {
        if (typeof col === "string") state.filters.push({ method, col, val });
        return builder;
      };
    }
    builder.maybeSingle = async () => resultFor(state);
    builder.single = async () => resultFor(state);
    builder.then = (resolveFn: (value: unknown) => unknown, rejectFn?: (reason: unknown) => unknown) =>
      Promise.resolve(resultFor(state)).then(resolveFn, rejectFn);
    return builder;
  }

  return { client: { from } as never, calls };
}

async function captureErrors<T>(fn: () => Promise<T>): Promise<{ value: T; errors: unknown[][] }> {
  const orig = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    return { value: await fn(), errors };
  } finally {
    console.error = orig;
  }
}

function extractCriticalAlertTypes(): string[] {
  const source = read("lib/alerts/record.ts");
  const sf = ts.createSourceFile("record.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const types: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "CriticalAlertType" && ts.isUnionTypeNode(node.type)) {
      for (const part of node.type.types) {
        if (ts.isLiteralTypeNode(part) && ts.isStringLiteral(part.literal)) {
          types.push(part.literal.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return types.sort();
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const full = join(ROOT, dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...tsFilesUnder(relative(ROOT, full)));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(relative(ROOT, full));
  }
  return out;
}

function alertTypeLiterals(expr: ts.Expression): string[] {
  if (ts.isStringLiteral(expr)) return [expr.text];
  if (ts.isConditionalExpression(expr)) {
    return [...alertTypeLiterals(expr.whenTrue), ...alertTypeLiterals(expr.whenFalse)];
  }
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return alertTypeLiterals(expr.expression);
  }
  return [];
}

function findRecordAlertCallTypes(): Map<string, Set<string>> {
  const files = [...tsFilesUnder("app"), ...tsFilesUnder("lib")];
  const found = new Map<string, Set<string>>();
  for (const file of files) {
    const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const calleeName = ts.isIdentifier(callee) ? callee.text : "";
        if (calleeName === "recordCriticalAlert" || calleeName === "recordAlert") {
          for (const arg of node.arguments) {
            if (!ts.isObjectLiteralExpression(arg)) continue;
            for (const prop of arg.properties) {
              if (!ts.isPropertyAssignment(prop)) continue;
              const name = prop.name;
              if ((ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === "type") {
                for (const value of alertTypeLiterals(prop.initializer)) {
                  if (!found.has(value)) found.set(value, new Set());
                  found.get(value)?.add(file);
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }
  return found;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

try {
  clearAlertEnv();

  const unionTypes = extractCriticalAlertTypes();
  const catalogTypes = Object.keys(ALERT_CATALOG).sort();
  INVARIANT("CriticalAlertType union was extracted by AST", unionTypes.length === 28, unionTypes);
  INVARIANT("alert catalog covers the union exactly", sameSet(unionTypes, catalogTypes), {
    unionOnly: unionTypes.filter((type) => !catalogTypes.includes(type)),
    catalogOnly: catalogTypes.filter((type) => !unionTypes.includes(type)),
  });
  for (const type of unionTypes as CriticalAlertType[]) {
    const meta = ALERT_CATALOG[type];
    INVARIANT(`catalog severity/channel defined for ${type}`, !!meta?.severity && meta.channels.length > 0);
  }

  const callTypes = findRecordAlertCallTypes();
  const unknownCallTypes = [...callTypes.keys()].filter((type) => !unionTypes.includes(type));
  INVARIANT("all statically discoverable recordCriticalAlert/recordAlert types are in the union", unknownCallTypes.length === 0, unknownCallTypes);
  INVARIANT("static call-site scan sees the core request-path alerts", [
    "agent_error",
    "whatsapp_send_failed",
    "inbound_persist_failed",
    "order_persist_failed",
    "voice_stt_unavailable",
    "payment_amount_mismatch",
  ].every((type) => callTypes.has(type)), [...callTypes.keys()].sort());

  {
    const fake = makeFakeAdmin();
    await recordCriticalAlert(fake.client, {
      restaurantId: "restaurant-1",
      type: "agent_error",
      detail: "adapter timeout",
      conversationId: "conversation-1",
      context: { orderId: "order-1" },
    });
    const insert = fake.calls.find((call) => call.table === "system_alerts" && call.op === "insert");
    const select = fake.calls.find((call) => call.table === "system_alerts" && call.op === "select");
    const payload = insert?.payload as Record<string, unknown> | undefined;
    INVARIANT("recordCriticalAlert inserts the expected system_alerts row shape",
      payload?.restaurant_id === "restaurant-1" &&
        payload?.type === "agent_error" &&
        payload?.detail === "adapter timeout" &&
        payload?.conversation_id === "conversation-1" &&
        (payload.context as { orderId?: string } | undefined)?.orderId === "order-1",
      payload);
    INVARIANT("dedupe read is tenant/type/active scoped",
      hasFilter(select, "eq", "restaurant_id", "restaurant-1") &&
        hasFilter(select, "eq", "type", "agent_error") &&
        hasFilter(select, "is", "dismissed_at", null),
      select);
  }

  {
    const fake = makeFakeAdmin({ systemAlertInsertThrows: true });
    let completed = false;
    const captured = await captureErrors(async () => {
      await recordCriticalAlert(fake.client, {
        restaurantId: "restaurant-1",
        type: "order_persist_failed",
        detail: "insert exploded",
        conversationId: "conversation-1",
      });
      completed = true;
    });
    INVARIANT("recordCriticalAlert swallows system_alerts insert failure", completed);
    INVARIANT("system_alerts insert failure is visible in console.error",
      captured.errors.some((args) => args.join(" ").includes("[alerts] failed to record system_alert")),
      captured.errors);
  }

  {
    clearAlertEnv();
    const noRecipient = await captureErrors(() => sendAlertWhatsApp({
      type: "agent_error",
      detail: "probe",
      restaurantName: "Wesaya",
      restaurantId: "restaurant-1",
      conversationId: "conversation-1",
      at: new Date(0).toISOString(),
    }));
    INVARIANT("WhatsApp alert channel cleanly no-ops when ALERT_WHATSAPP_TO is unset",
      noRecipient.value.sent === false && noRecipient.value.reason === "no_recipient",
      noRecipient.value);
    OPEN_FINDING("ALERT_WHATSAPP_TO unset is not logged loudly by the channel or recorder",
      noRecipient.errors.length === 0,
      noRecipient.errors);
  }

  {
    clearAlertEnv();
    process.env.ALERT_WHATSAPP_TO = "966500000000";
    const fake = makeFakeAdmin({ restaurantName: "Wesaya" });
    const captured = await captureErrors(() => recordCriticalAlert(fake.client, {
      restaurantId: "restaurant-1",
      type: "agent_error",
      detail: "probe",
      conversationId: "conversation-1",
    }));
    INVARIANT("configured WhatsApp recipient plus missing sender creds logs a channel failure",
      captured.errors.some((args) => args.join(" ").includes("[alerts] WhatsApp alert send failed")),
      captured.errors);
  }

  {
    clearAlertEnv();
    const noRecipients = await sendAlertEmail({
      type: "agent_error",
      detail: "probe",
      restaurantId: "restaurant-1",
      conversationId: null,
      at: new Date(0).toISOString(),
    });
    process.env.ALERT_EMAILS = "ops@example.test";
    const noProvider = await sendAlertEmail({
      type: "agent_error",
      detail: "probe",
      restaurantId: "restaurant-1",
      conversationId: null,
      at: new Date(0).toISOString(),
    });
    INVARIANT("email path reports no_recipients when ALERT_EMAILS is unset",
      noRecipients.sent === false && noRecipients.reason === "no_recipients",
      noRecipients);
    INVARIANT("email path reports provider_not_configured when recipients exist but no provider is wired",
      noProvider.sent === false && noProvider.reason === "provider_not_configured",
      noProvider);
  }

  {
    clearAlertEnv();
    const fake = makeFakeAdmin({
      activeAlerts: [{ id: "alert-existing", conversation_id: "conversation-1", context: { recurrenceCount: 2 } }],
    });
    await recordCriticalAlert(fake.client, {
      restaurantId: "restaurant-1",
      type: "agent_error",
      detail: "same active issue again",
      conversationId: "conversation-1",
    });
    const inserts = fake.calls.filter((call) => call.table === "system_alerts" && call.op === "insert");
    const update = fake.calls.find((call) => call.table === "system_alerts" && call.op === "update");
    const updateContext = (update?.payload as { context?: Record<string, unknown> } | undefined)?.context;
    INVARIANT("duplicate active alert does not insert a second banner row", inserts.length === 0, inserts);
    INVARIANT("duplicate active alert bumps recurrence metadata",
      updateContext?.recurrenceCount === 3 && typeof updateContext.lastSeenAt === "string",
      update?.payload);
  }

  {
    const now = 1_700_000_000_000;
    INVARIANT("monitor cooldown suppresses repeated synthetic alert inside the window",
      withinCooldown(now - 5 * 60_000, now, 60 * 60_000) === true);
    INVARIANT("monitor cooldown allows re-alert after the window",
      withinCooldown(now - 61 * 60_000, now, 60 * 60_000) === false);
  }

  {
    const vercel = JSON.parse(read("vercel.json")) as { crons?: Array<{ path?: string; schedule?: string }> };
    const cronPaths = (vercel.crons ?? []).map((cron) => cron.path).filter(Boolean);
    const workflow = read(".github/workflows/uptime-monitor.yml");
    INVARIANT("vercel.json does not schedule /api/monitor/sweep", !cronPaths.includes("/api/monitor/sweep"), cronPaths);
    INVARIANT("GitHub workflow schedules /api/monitor/sweep", workflow.includes("*/5 * * * *") && workflow.includes("$BASE_URL/api/monitor/sweep"));
  }

  {
    const missingGuidance = unionTypes.filter((type) => !alertGuidance(type));
    OPEN_FINDING("most CriticalAlertType values have no plain-Arabic guidance fallback beyond raw detail",
      missingGuidance.length > 0,
      missingGuidance);
  }

  SKIP("production ALERT_WHATSAPP_TO", "production Vercel/GitHub secret values are not readable from this proof window");
  SKIP("production monitor scheduler run status", "GitHub Actions enablement, last run, and secrets require repository settings access");
  SKIP("production system_alerts table presence", "database migrations are not applied from builder windows");
} finally {
  restoreEnv();
}

console.log(`\nOBSERVABILITY PROOF: ${pass} passed, ${fail} failed, ${openFinding} open findings, ${skipped} skipped`);
if (fail > 0) process.exit(1);
