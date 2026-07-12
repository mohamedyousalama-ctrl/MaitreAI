// WO-LIVE6-TURN-LOCK — RED-FIRST: two concurrent Brain turns for one conversation must
// collapse to exactly ONE reply. Live dup (conv 68966859, 15:19): two turns 56ms apart on
// identical input «تياسز» → two «مش فاهم» replies 31ms apart, because inbound coalescing
// read `last_answered_inbound_at` at turn-start but stamped it only at turn-end and the
// conversation_locks mutex did not serialize them. Fix: an ATOMIC compare-and-set claim on
// conversations.turn_claimed_at before the turn (blocking; loser re-reads the advanced
// watermark → covered=silent, straggler=answered).
// Run: node --conditions=react-server --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-turn-lock.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import { claimTurnOnce, releaseTurn, TURN_CLAIM_TTL_MS } from "../lib/db/turn-claim.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── Faithful mock of the compare-and-set: a single shared turn_claimed_at + the exact
//    `.or("turn_claimed_at.is.null,turn_claimed_at.lt.<cutoff>")` semantics. Thenable so
//    both `…select()` (claim) and `…eq()` (release) resolve. ──────────────────────────
function makeAdmin(init: { claimed_at: string | null; missingColumn?: boolean }) {
  const state = { turn_claimed_at: init.claimed_at };
  const builder = () => {
    const b: Record<string, unknown> = {};
    let patch: { turn_claimed_at: string | null } | null = null;
    let filter: string | null = null;
    const exec = () => {
      if (init.missingColumn) return { data: null, error: { code: "42703", message: "column turn_claimed_at does not exist" } };
      if (filter) {
        // CLAIM: apply iff no fresh claim is held.
        const m = /turn_claimed_at\.lt\.([^,]+)$/.exec(filter);
        const cutoff = m ? Date.parse(m[1]) : NaN;
        const cur = state.turn_claimed_at ? Date.parse(state.turn_claimed_at) : null;
        const claimable = cur === null || (Number.isFinite(cutoff) && cur < cutoff);
        if (claimable) { state.turn_claimed_at = patch!.turn_claimed_at; return { data: [{ id: "c1" }], error: null }; }
        return { data: [], error: null };
      }
      // RELEASE: no filter → unconditional set (to null).
      state.turn_claimed_at = patch!.turn_claimed_at;
      return { data: null, error: null };
    };
    b.update = (p: { turn_claimed_at: string | null }) => { patch = p; return b; };
    b.eq = () => b;
    b.or = (f: string) => { filter = f; return b; };
    b.select = () => b;
    (b as { then: (r: (v: unknown) => void) => void }).then = (resolveFn) => resolveFn(exec());
    return b;
  };
  return { _state: state, from: () => builder() } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const T0 = Date.parse("2026-07-12T15:19:15.000Z");

// ── A — the atomic claim: winner vs loser (the live 56ms race) ────────────────
{
  const admin = makeAdmin({ claimed_at: null });
  const a = await claimTurnOnce(admin, "conv", { nowMs: T0 });          // webhook A
  const b = await claimTurnOnce(admin, "conv", { nowMs: T0 + 56 });     // webhook B, 56ms later
  ok("A wins the claim (fresh conversation)", a.claimed === true && a.deployed === true);
  ok("B LOSES the claim (a fresh claim is held) → it must not run a 2nd turn", b.claimed === false);
}

// ── B — a stale claim (crashed turn, older than the TTL) is reclaimable ────────
{
  const stale = new Date(T0 - TURN_CLAIM_TTL_MS - 1000).toISOString();
  const admin = makeAdmin({ claimed_at: stale });
  const r = await claimTurnOnce(admin, "conv", { nowMs: T0 });
  ok("a claim older than the TTL is reclaimable (never wedge a conversation)", r.claimed === true);
}
{
  const fresh = new Date(T0 - 2000).toISOString(); // 2s old — well within the TTL
  const admin = makeAdmin({ claimed_at: fresh });
  const r = await claimTurnOnce(admin, "conv", { nowMs: T0 });
  ok("a fresh claim (within the TTL) is NOT stealable", r.claimed === false);
}

// ── C — release frees the conversation for the next turn ──────────────────────
{
  const admin = makeAdmin({ claimed_at: null });
  await claimTurnOnce(admin, "conv", { nowMs: T0 });
  await releaseTurn(admin, "conv");
  const after = await claimTurnOnce(admin, "conv", { nowMs: T0 + 10 });
  ok("after release, the next arrival claims cleanly", after.claimed === true);
}

// ── D — deploy-safe: a missing 0086 column PROCEEDS (never drop; inert pre-migration) ──
{
  const admin = makeAdmin({ claimed_at: null, missingColumn: true });
  const r = await claimTurnOnce(admin, "conv", { nowMs: T0 });
  ok("missing column (42703) → proceed anyway (claimed:true) …", r.claimed === true);
  ok("… but NOT marked deployed (caller won't try to release)", r.deployed === false);
}

// ── E — wiring (red witness): respond-and-send claims before coalescing + releases; the
//    webhook triggers a turn ONLY for a newly-inserted (idempotent) wa_message_id ──────
const rs = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");
const wh = readFileSync(resolve(process.cwd(), "app/api/whatsapp/webhook/route.ts"), "utf8");
ok("E: respond-and-send acquires the claim (claimTurn) gated on coalescingOn",
  /if \(coalescingOn\)\s*\{[\s\S]{0,160}?await claimTurn\(admin, conversationId\)/.test(rs));
ok("E: the claim is taken BEFORE the coalesce read (serialize before deciding the burst)",
  rs.indexOf("await claimTurn(admin, conversationId)") < rs.indexOf("coalesceInbound(rows,") &&
  rs.indexOf("await claimTurn(admin, conversationId)") > 0);
ok("E: the covered-burst early return releases the claim (never wedge)",
  /if \(!coalesced\)\s*\{[\s\S]{0,260}?releaseTurn\(admin, conversationId\)/.test(rs));
ok("E: the winner releases after the post-success watermark stamp",
  /last_answered_inbound_at[\s\S]{0,520}?turnClaimDeployed\) await releaseTurn/.test(rs));
ok("E: the agent-error path releases the claim too",
  /agent_error[\s\S]{0,400}?turnClaimDeployed\) await releaseTurn/.test(rs));
ok("E: wa_message_id idempotency — a turn is queued ONLY when the message was newly inserted",
  /if \(r\.inserted\)[\s\S]{0,120}?toAnswer\.add\(/.test(wh) || /r\.inserted[\s\S]{0,60}?toAnswer\.add/.test(wh));

console.log(`\n${fail === 0 ? "✅" : "❌"} turn-lock: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
