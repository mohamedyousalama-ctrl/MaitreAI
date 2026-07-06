// ============================================================================
// MaitreAI — WO-2: STAFF COMMAND CHANNEL handler — SERVER ONLY.
// A second lane with absolute supremacy: a registered staff number controls
// Karim from its own WhatsApp. This module owns the DETERMINISTIC (no-LLM) parse,
// apply, reply, and audit for staff commands. The webhook router diverts staff
// messages here BEFORE any customer-agent work; nothing here ever touches a
// customer conversation — its only effects are the command's own (mode /
// availability), each confirmed with a byte-stable Arabic template + an audit row.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppText } from "@/lib/messaging/outbound";
import { normalizePhone } from "@/lib/messaging/phone";

const PENDING_TTL_MS = 10 * 60 * 1000; // fuzzy-confirm window
const FUZZY_MIN = 0.5;
const CONFIRM_WORDS = new Set(["نعم", "اه", "ايوه", "تمام", "اوك"]);

// ---------------------------------------------------------------------------
// Arabic normalization (leaf, inlined) — for command parse + item matching.
// ---------------------------------------------------------------------------
export function normalizeArabic(input: string): string {
  let s = (input ?? "").trim();
  // Arabic-Indic + Extended digits → western.
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
       .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  // Strip harakat + tatweel.
  s = s.replace(/[ؐ-ًؚ-ٰٟـ]/g, "");
  // Unify letter variants.
  s = s.replace(/[آأإ]/g, "ا") // آأإ → ا
       .replace(/ى/g, "ي")                 // ى → ي
       .replace(/ة/g, "ه");                 // ة → ه
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Command parse (deterministic, NO LLM)
// ---------------------------------------------------------------------------
export type ParsedCommand =
  | { kind: "pause" }
  | { kind: "live" }
  | { kind: "status" }
  | { kind: "confirm" }
  | { kind: "eightysix"; item: string }
  | { kind: "restore"; item: string }
  | { kind: "help" };

export function parseStaffCommand(text: string): ParsedCommand {
  const n = normalizeArabic(text);
  if (!n) return { kind: "help" };
  if (CONFIRM_WORDS.has(n)) return { kind: "confirm" };
  if (n.startsWith("وقف كريم")) return { kind: "pause" };
  if (n.startsWith("شغل كريم")) return { kind: "live" };
  if (n === "الحاله" || n.startsWith("الحاله")) return { kind: "status" };
  if (n === "86" || n.startsWith("86 ")) return { kind: "eightysix", item: n.slice(2).trim() };
  if (n.startsWith("رجع")) return { kind: "restore", item: n.slice(3).trim() };
  return { kind: "help" };
}

// ---------------------------------------------------------------------------
// Menu-item matching (deterministic)
// ---------------------------------------------------------------------------
export interface MenuItemLite { id: string; name: string; available?: boolean }
export type MatchResult =
  | { kind: "exact"; item: MenuItemLite }
  | { kind: "fuzzy"; item: MenuItemLite }
  | { kind: "none"; candidates: MenuItemLite[] };

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

export function matchMenuItem(items: MenuItemLite[], query: string): MatchResult {
  const q = normalizeArabic(query);
  if (!q) return { kind: "none", candidates: [] };
  const exact = items.find((it) => normalizeArabic(it.name) === q);
  if (exact) return { kind: "exact", item: exact };
  const scored = items
    .map((it) => ({ it, score: similarity(q, normalizeArabic(it.name)) }))
    .sort((x, y) => y.score - x.score);
  const best = scored[0];
  if (best && best.score >= FUZZY_MIN) return { kind: "fuzzy", item: best.it };
  return { kind: "none", candidates: scored.slice(0, 3).map((s) => s.it) };
}

// ---------------------------------------------------------------------------
// Byte-stable Arabic reply templates
// ---------------------------------------------------------------------------
export const REPLY = {
  pause: "تم إيقاف كريم مؤقتًا ✋ — العملاء يستلمون رسالة الانتظار.",
  live: "تم تشغيل كريم ✅ — يستقبل الطلبات الآن.",
  liveRefused: "مش ممكن تشغيل كريم — التفعيل (go-live) لسه ما اكتملش. أكمل الإعداد من لوحة التحكم الأول.",
  eightysix: (name: string) => `تم إيقاف «${name}» من القائمة 🚫 — كريم مش هيعرضه للعملاء.`,
  restore: (name: string) => `رجّعنا «${name}» للقائمة ✅ — كريم هيعرضه تاني.`,
  fuzzy: (name: string) => `تقصد: «${name}»؟ رد بـ «نعم» للتأكيد.`,
  notFound: (names: string[]) =>
    names.length
      ? `مالقيتش الصنف ده. أقرب أصناف: ${names.map((n) => `«${n}»`).join("، ")}. اكتب الاسم بالظبط.`
      : "مفيش أصناف مطابقة في القائمة.",
  noPending: "مفيش أمر مستني تأكيد. ابعت الأمر من جديد.",
  status: (mode: string, ordersToday: number, awaiting: number) =>
    `حالة كريم: ${mode}\nطلبات النهارده: ${ordersToday}\nمحادثات محتاجة موظف: ${awaiting}`,
  help: [
    "أوامر التحكم في كريم:",
    "• وقف كريم — إيقاف الرد الآلي",
    "• شغل كريم — تشغيل الرد الآلي",
    "• 86 [اسم الصنف] — إيقاف صنف من القائمة",
    "• رجع [اسم الصنف] — إرجاع صنف للقائمة",
    "• الحالة — عرض حالة كريم وطلبات اليوم",
  ].join("\n"),
  opFailed: "حصل خطأ أثناء تنفيذ الأمر — حاول تاني أو راجع لوحة التحكم.",
} as const;

// ---------------------------------------------------------------------------
// Registry load
// ---------------------------------------------------------------------------
export interface StaffRow {
  id: string;
  member_id: string | null;
  wa_phone: string;
  pending_command: { kind: "eightysix" | "restore"; menu_item_id: string; item_name: string } | null;
  pending_at: string | null;
  members?: { user_id?: string | null; role?: string | null } | null;
}

/** Load the tenant's ACTIVE staff registry as a Map keyed by normalized phone. */
export async function loadStaffNumbers(
  admin: SupabaseClient,
  restaurantId: string,
  country: string | null
): Promise<Map<string, StaffRow>> {
  const { data } = await admin
    .from("staff_numbers")
    .select("id, member_id, wa_phone, pending_command, pending_at, members(user_id, role)")
    .eq("restaurant_id", restaurantId)
    .eq("active", true);
  const map = new Map<string, StaffRow>();
  for (const r of (data ?? []) as StaffRow[]) {
    map.set(normalizePhone(r.wa_phone, country), r);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export interface StaffCommandDeps {
  send?: (to: string, text: string) => Promise<void>;
  now?: () => number;
  /** Which door issued this command — stamped into the audit metadata. Defaults to
   *  "staff_whatsapp" (the webhook door). The console ⌘K palette (item 14) passes
   *  "console_command": ONE command brain, two doors, distinguishable in the trail. */
  channel?: string;
}

async function reply(deps: StaffCommandDeps, to: string, text: string): Promise<void> {
  const send = deps.send ?? ((t: string, body: string) => sendWhatsAppText({ to: t, text: body }).then(() => undefined));
  await send(to, text);
}

async function auditCommand(
  admin: SupabaseClient,
  restaurantId: string,
  staff: StaffRow,
  action: string,
  entityType: string,
  entityId: string,
  result: string,
  command: string,
  channel: string
): Promise<void> {
  try {
    await admin.from("audit_events").insert({
      restaurant_id: restaurantId,
      actor_member_id: staff.member_id,
      actor_user_id: staff.members?.user_id ?? null,
      actor_role: staff.members?.role ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: { command, result, phone: staff.wa_phone, channel },
    });
  } catch (e) {
    console.error("[staff] audit insert failed (non-blocking):", e);
  }
}

async function applyAvailability(
  admin: SupabaseClient,
  restaurantId: string,
  staff: StaffRow,
  item: MenuItemLite,
  available: boolean
): Promise<boolean> {
  const { error } = await admin
    .from("menu_items")
    .update({ available, unavailable_until: null })
    .eq("id", item.id)
    .eq("restaurant_id", restaurantId);
  if (error) return false;
  // 0030 model — append the availability audit row (survives renames via snapshot).
  await admin.from("menu_availability_events").insert({
    restaurant_id: restaurantId,
    menu_item_id: item.id,
    item_name: item.name,
    available,
    source: "staff_whatsapp",
    actor_user_id: staff.members?.user_id ?? null,
    actor_role: staff.members?.role ?? null,
  });
  return true;
}

async function loadMenuItems(admin: SupabaseClient, restaurantId: string): Promise<MenuItemLite[]> {
  const { data } = await admin.from("menu_items").select("id, name, available").eq("restaurant_id", restaurantId);
  return (data ?? []) as MenuItemLite[];
}

async function setPending(admin: SupabaseClient, staff: StaffRow, pending: StaffRow["pending_command"], nowIso: string): Promise<void> {
  await admin.from("staff_numbers").update({ pending_command: pending, pending_at: pending ? nowIso : null }).eq("id", staff.id);
}

/**
 * Handle ONE staff message. Deterministic, no LLM. Applies the command's own
 * effect (mode/availability), replies with a byte-stable template, and audits.
 * Never touches any customer conversation.
 */
export async function handleStaffCommand(
  admin: SupabaseClient,
  restaurantId: string,
  staff: StaffRow,
  text: string,
  fromPhone: string,
  deps: StaffCommandDeps = {}
): Promise<void> {
  const now = deps.now ?? (() => Date.now());
  const nowIso = new Date(now()).toISOString();
  const channel = deps.channel ?? "staff_whatsapp";
  const cmd = parseStaffCommand(text);

  try {
    switch (cmd.kind) {
      case "pause": {
        const { error } = await admin.from("restaurants").update({ agent_mode: "paused" }).eq("id", restaurantId);
        const ok = !error;
        await reply(deps, fromPhone, ok ? REPLY.pause : REPLY.opFailed);
        await auditCommand(admin, restaurantId, staff, "staff_agent_mode_changed", "restaurant", restaurantId, ok ? "paused" : "failed", text, channel);
        return;
      }
      case "live": {
        // go-live gate: active=true is the durable proof the gate passed (only the
        // go-live route sets it). A tenant that never activated cannot be flipped
        // live from a staff command.
        const { data: r } = await admin.from("restaurants").select("active").eq("id", restaurantId).single();
        if (r?.active !== true) {
          await reply(deps, fromPhone, REPLY.liveRefused);
          await auditCommand(admin, restaurantId, staff, "staff_agent_mode_changed", "restaurant", restaurantId, "refused_not_activated", text, channel);
          return;
        }
        const { error } = await admin.from("restaurants").update({ agent_mode: "live" }).eq("id", restaurantId);
        const ok = !error;
        await reply(deps, fromPhone, ok ? REPLY.live : REPLY.opFailed);
        await auditCommand(admin, restaurantId, staff, "staff_agent_mode_changed", "restaurant", restaurantId, ok ? "live" : "failed", text, channel);
        return;
      }
      case "eightysix":
      case "restore": {
        const available = cmd.kind === "restore";
        const items = await loadMenuItems(admin, restaurantId);
        const match = matchMenuItem(items, cmd.item);
        if (match.kind === "exact") {
          const ok = await applyAvailability(admin, restaurantId, staff, match.item, available);
          await reply(deps, fromPhone, ok ? (available ? REPLY.restore(match.item.name) : REPLY.eightysix(match.item.name)) : REPLY.opFailed);
          await auditCommand(admin, restaurantId, staff, "staff_item_availability_changed", "menu_item", match.item.id, ok ? (available ? "restored" : "eightysixed") : "failed", text, channel);
          return;
        }
        if (match.kind === "fuzzy") {
          await setPending(admin, staff, { kind: cmd.kind, menu_item_id: match.item.id, item_name: match.item.name }, nowIso);
          await reply(deps, fromPhone, REPLY.fuzzy(match.item.name));
          await auditCommand(admin, restaurantId, staff, "staff_item_availability_changed", "restaurant", restaurantId, "fuzzy_pending", text, channel);
          return;
        }
        await reply(deps, fromPhone, REPLY.notFound(match.candidates.map((c) => c.name)));
        await auditCommand(admin, restaurantId, staff, "staff_item_availability_changed", "restaurant", restaurantId, "no_match", text, channel);
        return;
      }
      case "confirm": {
        const pending = staff.pending_command;
        const fresh = pending && staff.pending_at && now() - Date.parse(staff.pending_at) <= PENDING_TTL_MS;
        if (!pending || !fresh) {
          await reply(deps, fromPhone, REPLY.noPending);
          await auditCommand(admin, restaurantId, staff, "staff_command", "restaurant", restaurantId, "confirm_no_pending", text, channel);
          return;
        }
        const available = pending.kind === "restore";
        const ok = await applyAvailability(admin, restaurantId, staff, { id: pending.menu_item_id, name: pending.item_name }, available);
        await setPending(admin, staff, null, nowIso); // clear
        await reply(deps, fromPhone, ok ? (available ? REPLY.restore(pending.item_name) : REPLY.eightysix(pending.item_name)) : REPLY.opFailed);
        await auditCommand(admin, restaurantId, staff, "staff_item_availability_changed", "menu_item", pending.menu_item_id, ok ? (available ? "restored_confirmed" : "eightysixed_confirmed") : "failed", text, channel);
        return;
      }
      case "status": {
        const { data: r } = await admin.from("restaurants").select("agent_mode").eq("id", restaurantId).single();
        const mode = (r?.agent_mode as string) === "paused" ? "متوقف ✋" : (r?.agent_mode as string) === "live" ? "يعمل ✅" : String(r?.agent_mode ?? "—");
        const dayStart = new Date(now()); dayStart.setUTCHours(0, 0, 0, 0);
        const { count: ordersToday } = await admin
          .from("orders").select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId).gte("created_at", dayStart.toISOString());
        const { count: awaiting } = await admin
          .from("conversations").select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId).in("ownership_state", ["HUMAN_ACTIVE", "HUMAN_IDLE", "SYSTEM_HOLD"]);
        await reply(deps, fromPhone, REPLY.status(mode, ordersToday ?? 0, awaiting ?? 0));
        await auditCommand(admin, restaurantId, staff, "staff_command", "restaurant", restaurantId, "status", text, channel);
        return;
      }
      default: {
        // A registered number sending non-command text → help with the vocabulary.
        await reply(deps, fromPhone, REPLY.help);
        await auditCommand(admin, restaurantId, staff, "staff_command", "restaurant", restaurantId, "help", text, channel);
        return;
      }
    }
  } catch (e) {
    console.error("[staff] handleStaffCommand threw (swallowed):", e);
    try { await reply(deps, fromPhone, REPLY.opFailed); } catch { /* best-effort */ }
  }
}
