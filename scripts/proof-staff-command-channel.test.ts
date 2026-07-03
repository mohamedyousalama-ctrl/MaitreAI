// ============================================================================
// WO-2 proof harness — staff command channel.
// Exercises the REAL parse/match/handler against a fake admin + injected send.
// Covers: parse, matching, each command (incl. gate-refused شغل, fuzzy-86 confirm
// flow, registered-number help), supremacy + flag-off webhook invariance (source
// assertions on the webhook), audit rows, tenant isolation + cross-tenant collision.
//
// Run: node --conditions=react-server --import <tsx>/dist/loader.mjs \
//        scripts/proof-staff-command-channel.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseStaffCommand, matchMenuItem, normalizeArabic, REPLY, handleStaffCommand,
  type StaffRow, type MenuItemLite,
} from "../lib/staff/command-channel.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); }
}

// ---- fake admin ------------------------------------------------------------
type Row = Record<string, unknown>;
function makeAdmin(store: Record<string, Row[]>) {
  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    let counting = false;
    const q: Record<string, unknown> = {};
    q.select = (_c?: unknown, opts?: { head?: boolean; count?: string }) => { if (opts?.count) counting = true; return q; };
    q.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; };
    q.in = (c: string, arr: unknown[]) => { filters.push((r) => arr.includes(r[c])); return q; };
    q.gte = (c: string, v: unknown) => { filters.push((r) => String(r[c]) >= String(v)); return q; };
    q.update = (p: Row) => { patch = p; return q; };
    q.insert = async (row: Row) => { (store[table] ??= []).push(Array.isArray(row) ? row : { ...row }); return { error: null }; };
    const rows = () => (store[table] ?? []).filter((r) => filters.every((f) => f(r)));
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    q.single = async () => ({ data: rows()[0] ?? null, error: null });
    q.then = (resolve: (v: unknown) => unknown) => {
      if (patch) { rows().forEach((r) => Object.assign(r, patch)); return resolve({ data: null, error: null }); }
      if (counting) return resolve({ count: rows().length, data: null, error: null });
      return resolve({ data: rows(), error: null });
    };
    return q;
  }
  return { from: (t: string) => builder(t) } as never;
}
const staffRow = (over: Partial<StaffRow> = {}): StaffRow => ({
  id: "s1", member_id: "m1", wa_phone: "201000000001", pending_command: null, pending_at: null,
  members: { user_id: "u1", role: "manager" }, ...over,
});
function capture() {
  const sent: string[] = [];
  return { sent, deps: { send: async (_to: string, text: string) => { sent.push(text); }, now: () => 1_000_000 } };
}

async function run() {
  // ---- parse ----------------------------------------------------------------
  check("parse وقف كريم → pause", parseStaffCommand("وقف كريم").kind === "pause");
  check("parse شغل كريم → live", parseStaffCommand("شغل كريم").kind === "live");
  check("parse الحالة → status", parseStaffCommand("الحالة").kind === "status");
  check("parse نعم → confirm", parseStaffCommand("نعم").kind === "confirm");
  check("parse 86 فراخ → eightysix 'فراخ'", (() => { const c = parseStaffCommand("86 فراخ"); return c.kind === "eightysix" && c.item === "فراخ"; })());
  check("parse ٨٦ (arabic digits) فراخ → eightysix", (() => { const c = parseStaffCommand("٨٦ فراخ"); return c.kind === "eightysix" && c.item === "فراخ"; })());
  check("parse رجع فراخ → restore 'فراخ'", (() => { const c = parseStaffCommand("رجع فراخ"); return c.kind === "restore" && c.item === "فراخ"; })());
  check("parse random → help", parseStaffCommand("ازيك يا كريم").kind === "help");
  check("normalizeArabic unifies alef/ta/ya + digits", normalizeArabic("إفرَاخ٥") === "افراخ5");

  // ---- matching -------------------------------------------------------------
  const menu: MenuItemLite[] = [
    { id: "i1", name: "فراخ بروستد", available: true },
    { id: "i2", name: "بيتزا مارجريتا", available: true },
    { id: "i3", name: "برجر لحم", available: true },
  ];
  check("match exact", (() => { const m = matchMenuItem(menu, "فراخ بروستد"); return m.kind === "exact" && m.item.id === "i1"; })());
  check("match fuzzy (substring)", (() => { const m = matchMenuItem(menu, "فراخ"); return m.kind === "fuzzy" && m.item.id === "i1"; })());
  check("match none → candidates", (() => { const m = matchMenuItem(menu, "كشري كبير"); return m.kind === "none"; })());

  // ---- pause / live ---------------------------------------------------------
  {
    const store = { restaurants: [{ id: "A", agent_mode: "live", active: true }], audit_events: [] as Row[] };
    const admin = makeAdmin(store); const { sent, deps } = capture();
    await handleStaffCommand(admin, "A", staffRow(), "وقف كريم", "201000000001", deps);
    check("pause → agent_mode=paused", store.restaurants[0].agent_mode === "paused");
    check("pause → reply template", sent[0] === REPLY.pause);
    check("pause → audit row", store.audit_events.length === 1 && store.audit_events[0].action === "staff_agent_mode_changed");
  }
  {
    const store = { restaurants: [{ id: "A", agent_mode: "paused", active: false }], audit_events: [] as Row[] };
    const admin = makeAdmin(store); const { sent, deps } = capture();
    await handleStaffCommand(admin, "A", staffRow(), "شغل كريم", "201000000001", deps);
    check("live gate-refused when not activated → no mode change", store.restaurants[0].agent_mode === "paused");
    check("live gate-refused → refusal reply", sent[0] === REPLY.liveRefused);
    check("live gate-refused → audit result=refused", String(store.audit_events[0].metadata && (store.audit_events[0].metadata as Row).result) === "refused_not_activated");
  }
  {
    const store = { restaurants: [{ id: "A", agent_mode: "paused", active: true }], audit_events: [] as Row[] };
    const admin = makeAdmin(store); const { sent, deps } = capture();
    await handleStaffCommand(admin, "A", staffRow(), "شغل كريم", "201000000001", deps);
    check("live (activated) → agent_mode=live", store.restaurants[0].agent_mode === "live");
    check("live → reply template", sent[0] === REPLY.live);
  }

  // ---- 86 exact / fuzzy-confirm / none --------------------------------------
  {
    const store = { menu_items: [{ id: "i1", name: "فراخ بروستد", available: true, restaurant_id: "A" }], menu_availability_events: [] as Row[], audit_events: [] as Row[] };
    const admin = makeAdmin(store); const { sent, deps } = capture();
    await handleStaffCommand(admin, "A", staffRow(), "86 فراخ بروستد", "201000000001", deps);
    check("86 exact → available=false", store.menu_items[0].available === false);
    check("86 exact → menu_availability_events row (0030)", store.menu_availability_events.length === 1 && store.menu_availability_events[0].source === "staff_whatsapp");
    check("86 exact → confirm reply", sent[0] === REPLY.eightysix("فراخ بروستد"));
    check("86 exact → audit menu_item entity", store.audit_events[0].entity_type === "menu_item");
  }
  {
    // fuzzy → pending set → «تقصد» → نعم confirm applies
    const staff = staffRow();
    const store: Record<string, Row[]> = {
      menu_items: [{ id: "i1", name: "فراخ بروستد", available: true, restaurant_id: "A" }],
      staff_numbers: [{ id: "s1", pending_command: null, pending_at: null }],
      menu_availability_events: [], audit_events: [],
    };
    const admin = makeAdmin(store); const c1 = capture();
    await handleStaffCommand(admin, "A", staff, "86 فراخ", "201000000001", c1.deps);
    check("86 fuzzy → «تقصد» reply", c1.sent[0] === REPLY.fuzzy("فراخ بروستد"));
    check("86 fuzzy → pending stored", (store.staff_numbers[0].pending_command as Row | null)?.menu_item_id === "i1");
    check("86 fuzzy → not applied yet", store.menu_items[0].available === true);
    // now the SAME staff sends نعم — reconstruct staff row with the stored pending
    const pend = store.staff_numbers[0];
    const staff2 = staffRow({ pending_command: pend.pending_command as StaffRow["pending_command"], pending_at: new Date(999_000).toISOString() });
    const c2 = capture();
    await handleStaffCommand(admin, "A", staff2, "نعم", "201000000001", c2.deps);
    check("confirm نعم (fresh) → applies 86", store.menu_items[0].available === false);
    check("confirm نعم → confirm reply", c2.sent[0] === REPLY.eightysix("فراخ بروستد"));
    check("confirm نعم → pending cleared", store.staff_numbers[0].pending_command === null);
  }
  {
    const store = { staff_numbers: [{ id: "s1" }], audit_events: [] as Row[] };
    const admin = makeAdmin(store); const { sent, deps } = capture();
    await handleStaffCommand(admin, "A", staffRow({ pending_command: null }), "نعم", "201000000001", deps);
    check("confirm with NO pending → noPending reply", sent[0] === REPLY.noPending);
  }
  {
    const store = { menu_items: [{ id: "i1", name: "بيتزا", available: true, restaurant_id: "A" }], audit_events: [] as Row[] };
    const admin = makeAdmin(store); const { sent, deps } = capture();
    await handleStaffCommand(admin, "A", staffRow(), "86 حاجة مش موجودة خالص", "201000000001", deps);
    check("86 no-match → notFound reply", sent[0].startsWith("مالقيتش") || sent[0] === REPLY.notFound([]));
    check("86 no-match → item unchanged", store.menu_items[0].available === true);
  }

  // ---- registered non-command → help + status ------------------------------
  {
    const store = { audit_events: [] as Row[] };
    const admin = makeAdmin(store); const { sent, deps } = capture();
    await handleStaffCommand(admin, "A", staffRow(), "شكراً يا معلم", "201000000001", deps);
    check("registered non-command → help reply", sent[0] === REPLY.help);
    check("every command → audit row (help audited too)", store.audit_events.length === 1);
  }
  {
    const store = {
      restaurants: [{ id: "A", agent_mode: "live" }],
      orders: [{ id: "o1", restaurant_id: "A", created_at: new Date(1_000_000).toISOString() }],
      conversations: [{ id: "c1", restaurant_id: "A", ownership_state: "HUMAN_IDLE" }],
      audit_events: [] as Row[],
    };
    const admin = makeAdmin(store); const { sent, deps } = capture();
    await handleStaffCommand(admin, "A", staffRow(), "الحالة", "201000000001", deps);
    check("status → reply shows mode + counts", sent[0].includes("حالة كريم") && sent[0].includes("طلبات النهارده") && sent[0].includes("محادثات محتاجة موظف"));
  }

  // ---- tenant isolation / cross-tenant collision ----------------------------
  {
    // Same phone registered in tenant A and tenant B; a command handled for A
    // updates ONLY A's restaurant, never B's.
    const store = {
      restaurants: [{ id: "A", agent_mode: "live", active: true }, { id: "B", agent_mode: "live", active: true }],
      audit_events: [] as Row[],
    };
    const admin = makeAdmin(store); const { deps } = capture();
    await handleStaffCommand(admin, "A", staffRow({ wa_phone: "201000000009" }), "وقف كريم", "201000000009", deps);
    check("cross-tenant: command scoped to resolved tenant A", store.restaurants[0].agent_mode === "paused");
    check("cross-tenant: tenant B untouched", store.restaurants[1].agent_mode === "live");
    check("cross-tenant: audit scoped to A", store.audit_events[0].restaurant_id === "A");
  }

  // ---- webhook source assertions: supremacy + flag-off invariance -----------
  const wh = readFileSync(join(ROOT, "app/api/whatsapp/webhook/route.ts"), "utf8");
  check("webhook: staff branch gated by staff_command_channel flag (first statement)",
    /if \(isFeatureExplicitlyEnabled\("staff_command_channel", flags\)\) \{/.test(wh));
  check("webhook: isStaffMsg defaults to ()=>false (flag off → byte-equivalent)",
    wh.includes("let isStaffMsg") && wh.includes("= () => false;"));
  const idxStaff = wh.indexOf("handleStaffCommand(admin");
  const idxPersist = wh.indexOf("persistInboundMessage(admin");
  check("webhook: staff handled BEFORE customer persist (supremacy)", idxStaff > 0 && idxPersist > idxStaff);
  check("webhook: staff message skipped in persist loop (never a customer conversation)",
    /if \(isStaffMsg\(m\)\) continue;/.test(wh));
  check("webhook: staff msg excluded from cadence receipts too",
    /m\.externalMessageId && !isStaffMsg\(m\)/.test(wh));

  console.log(`\nSTAFF-COMMAND-CHANNEL PROOF: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
run();
