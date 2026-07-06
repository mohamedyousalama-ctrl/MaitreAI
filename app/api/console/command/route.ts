// ============================================================================
// MaitreAI — Item 14 (Ask Kivo): the CONSOLE command door — SERVER ONLY.
// The ⌘K palette is a SECOND DOOR to the SAME deterministic command brain (WO-2),
// never a second parser: this route imports and reuses parseStaffCommand +
// matchMenuItem + handleStaffCommand from lib/staff/command-channel — the exact core
// the staff-WhatsApp webhook uses. The only difference is the door identity: the actor
// is the signed-in console MEMBER (not a registered wa_phone), and effects/audit are
// stamped channel="console_command".
//
// TWO-STEP by design (confirm-before-act): a PREVIEW (no confirm) parses + resolves the
// menu match and echoes what WILL happen without touching anything; an EXECUTE
// (confirm:true) runs the same core and applies. Read-only commands (status/help) run on
// the preview call (nothing to confirm). Safety vocabulary is NOT commandable — the
// parser has no such command, so any attempt falls to help; the palette states the rule.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseStaffCommand, matchMenuItem, handleStaffCommand, REPLY,
  type StaffRow, type MenuItemLite,
} from "@/lib/staff/command-channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: unknown; confirm?: unknown };
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ ok: true, reply: REPLY.help, done: true });

  // The console actor as a synthetic StaffRow so the SAME core stamps the member.
  const memberId = ((await admin.from("members").select("id").eq("user_id", tenant.userId).eq("restaurant_id", tenant.restaurantId).maybeSingle()).data as { id?: string } | null)?.id ?? null;
  // `members` has no name column — resolve the actor's display name from the auth
  // user (user_metadata.name → email local-part → fallback), exactly as /api/members.
  let memberName = "موظف";
  try {
    const { data } = await admin.auth.admin.getUserById(tenant.userId);
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const metaName = typeof meta.name === "string" ? meta.name.trim() : "";
    memberName = metaName || (data.user?.email ? data.user.email.split("@")[0] : "") || "موظف";
  } catch { /* name stays the safe fallback */ }
  const staff: StaffRow = {
    id: "console", member_id: memberId, wa_phone: "console",
    pending_command: null, pending_at: null,
    members: { user_id: tenant.userId, role: tenant.role },
  };

  // Run the command through the exact WO-2 core, capturing its byte-stable reply
  // instead of sending it over WhatsApp. Audits with channel="console_command".
  async function execute(runText: string): Promise<string> {
    let captured = "";
    await handleStaffCommand(admin!, tenant.restaurantId, staff, runText, "console", {
      channel: "console_command",
      send: async (_to, txt) => { captured = txt; },
    });
    return captured;
  }

  // EXECUTE — the caller confirmed an act. Return the actor name so the palette can
  // stamp the audited action under the member's name (attribution law).
  if (body.confirm === true) {
    return NextResponse.json({ ok: true, reply: await execute(text), done: true, member: memberName });
  }

  // PREVIEW — parse (the SHARED parser; the palette never parses) and echo what WILL
  // happen; touch nothing. `recognized` lets the palette route tiers WITHOUT re-parsing:
  // the command brain alone decides what is a command; anything it doesn't recognize
  // (parse falls through to help) is reported recognized:false so the palette can route
  // it to the honest Questions GATHERING tier instead of pretending to answer.
  const cmd = parseStaffCommand(text);

  if (cmd.kind === "pause" || cmd.kind === "live") {
    return NextResponse.json({ ok: true, recognized: true, needsConfirm: true, command: cmd.kind, confirmText: text });
  }
  // Read-only status → run now; there is nothing to confirm.
  if (cmd.kind === "status" || cmd.kind === "confirm") {
    return NextResponse.json({ ok: true, recognized: true, reply: await execute(text), done: true });
  }
  // eightysix / restore — resolve the menu match to echo the exact item before acting.
  if (cmd.kind === "eightysix" || cmd.kind === "restore") {
    const { data } = await admin.from("menu_items").select("id, name, available").eq("restaurant_id", tenant.restaurantId);
    const match = matchMenuItem((data ?? []) as MenuItemLite[], cmd.item);
    if (match.kind === "exact" || match.kind === "fuzzy") {
      // Confirm with the EXACT name so execute matches exact (no fuzzy round-trip).
      const confirmText = `${cmd.kind === "eightysix" ? "86" : "رجع"} ${match.item.name}`;
      return NextResponse.json({ ok: true, recognized: true, needsConfirm: true, command: cmd.kind, itemName: match.item.name, fuzzy: match.kind === "fuzzy", confirmText });
    }
    return NextResponse.json({ ok: true, recognized: true, reply: REPLY.notFound(match.candidates.map((c) => c.name)), done: true });
  }
  // kind === "help" — the brain did NOT recognize a command. Report the command
  // vocabulary as a hint, but recognized:false so the palette routes to Questions GATHERING.
  return NextResponse.json({ ok: true, recognized: false, reply: REPLY.help, done: true });
}
