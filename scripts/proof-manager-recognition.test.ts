// ============================================================================
// WO-MANAGER-RECOGNITION proof — a manager added in Settings/Team is auto-recognized
// on the staff command channel (Mohamed note 45). Tests the roster-sync helpers with
// a mock admin, and SOURCE-ASSERTS that (a) the ADD is flag-gated + manager-only in
// team/invite, and (b) the HARD LINE still holds: a roster number is parsed ONLY for
// commands and a non-command NEVER reaches runCustomerTurn.
//
// Run (server-only + @/ alias → prompt-snapshot-loader):
//   node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//     scripts/proof-manager-recognition.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { syncManagerToRoster, removeMemberFromRoster } from "../lib/staff/roster-sync.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// --- chainable mock admin: records upsert/update calls -----------------------
function mockAdmin(errorOnOp?: string) {
  const calls: any[] = [];
  const from = (table: string) => {
    const rec: any = { table, eqs: [] };
    const result = () => ({ error: errorOnOp === rec.op ? { message: "boom" } : null });
    const c: any = {
      upsert(obj: any, opts: any) { rec.op = "upsert"; rec.obj = obj; rec.opts = opts; calls.push(rec); return Promise.resolve(result()); },
      update(obj: any) { rec.op = "update"; rec.obj = obj; calls.push(rec); return c; },
      eq(k: string, v: any) { rec.eqs.push([k, v]); return c; },
      then(res: any) { return Promise.resolve(result()).then(res); },
    };
    return c;
  };
  return { from, calls } as any;
}

// --- syncManagerToRoster -----------------------------------------------------
{
  const admin = mockAdmin();
  const r = await syncManagerToRoster(admin, { restaurantId: "rest-1", memberId: "mem-1", phone: "0501234567", country: "SA" });
  ok("manager+phone → ok", r.ok === true);
  const call = admin.calls[0];
  ok("writes to staff_numbers via upsert", call?.table === "staff_numbers" && call?.op === "upsert");
  ok("upsert sets active:true + member_id + normalized wa_phone", call?.obj?.active === true && call?.obj?.member_id === "mem-1" && typeof call?.obj?.wa_phone === "string" && call.obj.wa_phone.length > 0);
  ok("upsert conflict target is (restaurant_id, wa_phone)", call?.opts?.onConflict === "restaurant_id,wa_phone");
  ok("does NOT touch pending_command/pending_at", !("pending_command" in (call?.obj ?? {})) && !("pending_at" in (call?.obj ?? {})));
}
{
  const admin = mockAdmin();
  const r = await syncManagerToRoster(admin, { restaurantId: "rest-1", memberId: "mem-1", phone: "   ", country: "SA" });
  ok("empty phone → no_phone, NO db write", r.ok === false && (r as any).reason === "no_phone" && admin.calls.length === 0);
}
{
  const admin = mockAdmin("upsert");
  const r = await syncManagerToRoster(admin, { restaurantId: "rest-1", memberId: "mem-1", phone: "0501234567", country: "SA" });
  ok("db error → ok:false db_error", r.ok === false && (r as any).reason === "db_error");
}

// --- removeMemberFromRoster (ready-to-wire) ----------------------------------
{
  const admin = mockAdmin();
  const r = await removeMemberFromRoster(admin, { restaurantId: "rest-1", memberId: "mem-9" });
  ok("remove → ok", r.ok === true);
  const call = admin.calls[0];
  ok("remove DEACTIVATES (active:false), never deletes", call?.op === "update" && call?.obj?.active === false && call?.table === "staff_numbers");
  ok("remove is scoped to tenant + member", JSON.stringify(call?.eqs) === JSON.stringify([["restaurant_id", "rest-1"], ["member_id", "mem-9"]]));
}

// ============================================================================
// SOURCE-ASSERTS — the ADD wiring (flag-gated, manager-only) + the HARD LINE
// ============================================================================
const inv = read("app/api/team/invite/route.ts");
ok("invite imports syncManagerToRoster", /import \{ syncManagerToRoster \} from "@\/lib\/staff\/roster-sync"/.test(inv));
ok("invite reads an optional phone (absent → unchanged)", /const phone = String\(body\.phone \?\? ""\)\.trim\(\)/.test(inv));
ok("roster sync ONLY when role==='manager' AND phone present",
  /if \(role === "manager" && phone && newMember\?\.id\)/.test(inv));
ok("roster sync is FLAG-GATED on manager_command_recognition (default OFF)",
  /isFeatureExplicitlyEnabled\("manager_command_recognition", flags\)[\s\S]*syncManagerToRoster\(/.test(inv));
// flag-OFF byte-identical: the ONLY roster write sits inside the flag check, and the
// member-insert/audit/return are otherwise unchanged.
ok("the syncManagerToRoster call sits INSIDE the flag check",
  inv.indexOf("isFeatureExplicitlyEnabled(\"manager_command_recognition\"") < inv.indexOf("syncManagerToRoster(") &&
  inv.indexOf("syncManagerToRoster(") > 0);

// HARD LINE — command-channel never imports / calls the customer Brain.
const cc = read("lib/staff/command-channel.ts");
ok("command-channel does NOT import runCustomerTurn / customer-turn", !/customer-turn|runCustomerTurn/.test(cc));
ok("a non-command from a roster number → bounded help reply (default case)", /default: \{[\s\S]*REPLY\.help/.test(cc));

// HARD LINE — the webhook diverts staff BEFORE customer work and skips them from persist.
const wh = read("app/api/whatsapp/webhook/route.ts");
ok("webhook computes isStaffMsg from the roster (loadStaffNumbers)", /loadStaffNumbers\(admin, restaurantId/.test(wh));
ok("staff messages are SKIPPED from the persist/answer loop (never reach the Brain)",
  /if \(isStaffMsg\(m\)\) continue;/.test(wh));
ok("staff messages are handled by handleStaffCommand, not runCustomerTurn",
  /if \(row\) await handleStaffCommand\(/.test(wh));
// A non-roster (customer) number → isStaffMsg is false → the existing customer path
// is unchanged (the staff branch only runs for roster numbers).
ok("non-roster number falls through to the customer path (isStaffMsg default false)",
  /isStaffMsg: \(m: \{ from\?: string \| null \}\) => boolean = \(\) => false/.test(wh));

// roster-sync documents removeMemberFromRoster as ready-to-wire (WO-MEMBER-LIFECYCLE).
const rsync = read("lib/staff/roster-sync.ts");
ok("removeMemberFromRoster is documented ready-to-wire (WO-MEMBER-LIFECYCLE)", /WO-MEMBER-LIFECYCLE/.test(rsync));
ok("manager_command_recognition is a typed ProFeature", /"manager_command_recognition"/.test(read("lib/tenant/tier.ts")));

console.log(`\nWO-MANAGER-RECOGNITION PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
