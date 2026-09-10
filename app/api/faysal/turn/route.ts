// ============================================================================
// فيصل / Faysal — POST /api/faysal/turn. THE CONVERSATION.
//
// ORDER IS NOT OPTIONAL, AND IT IS THE ARCHITECTURE OF THIS FILE:
//
//   inbound text
//     → cheap per-IP pre-filter (free)
//     → parse + cap the body (free)
//     → readRedFlag() on the RAW INBOUND        ← PURE, pre-model, no state
//     → if fired:  openTriageHold()  (§1.5 R2, session.triageHold)
//                  emergencyRail()   ← frozen string; NO model call this turn
//                  RETURN.           ← the turn ends here
//     → consume the durable spend guard         ← the first PAID line
//     → classify()                              ← at most ONE model call
//     → runTurn()                               ← the scene machine, deterministic
//
// THE RAIL RUNS BEFORE THE SPEND GUARD ON PURPOSE. A patient with chest pain must
// get 997 even on a day the demo is rate-limited, out of budget, or switched off.
// The rail makes no model call and no database call, so letting it through costs
// nothing — and a safety rail gated on a billing counter is not a safety rail.
//
// THE HOLD IS THE MECHANISM BEHIND "NOT REVISABLE BY LATER TURNS". Once
// `session.triageHold` is set, every later turn in this thread re-reads the
// detector and re-renders the rail. There is no branch below that can book, quote
// hours, offer a slot or greet while it is set. "عادي، أنا بخير" does not reopen
// booking — SPEC-4 §1.2 makes the verdict non-revisable and the persona must not
// talk around it.
//
// WHAT LEAVES THIS HANDLER IS AN ALLOWLIST. The session object carries the
// patient's own words, the hold id and the booking ref; none of that is published.
// A new field on the session is never published by accident.
// ============================================================================

import { NextResponse } from "next/server";
import { REAL_CONTACTS, RAIL_STOP_REASON, SITES, emergencyRailText, readRedFlag, siteInDistrict, snapshotOfStore, storeFromSnapshot } from "../_domain";
import { classify, type Classification } from "../_engine/intent";
import { compose } from "../_engine/render";
import { consumeSpendGuard, clientIp, preFilter } from "../_engine/guard";
import { FAYSAL_MAX_CHARS } from "../_engine/limits";
import { openConversation, runTurn, type Reply } from "../_engine/scenes";
import type { FaysalStore } from "../_domain";
import { encodeSession, pushHistory, resetCourtesy, resolveSession, type FaysalSession } from "../_engine/session";
import * as S from "../_engine/strings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One Haiku-tier classification call over a small prompt. 30s is generous; the
// platform default can kill a cold provider connection after the guard slot is
// already spent, leaving the visitor a generic error on a sales page.
export const maxDuration = 30;

interface TurnBody {
  text?: unknown;
  sessionId?: unknown;
}

function payload(sessionId: string, r: Reply) {
  return NextResponse.json({
    ok: true,
    sessionId,
    messages: r.messages,
    chips: r.chips,
    stopReason: r.stopReason,
    scene: r.scene,
  });
}

/**
 * The number handed over inside a triage hold. Read straight off the raw text with
 * the domain's own district resolver — no classifier, no model, no session state, so
 * it cannot be influenced by anything the hold is meant to block. A district we do
 * not recognise falls back to the group's unified line, which is never wrong.
 */
function heldBranchPhone(raw: string): string {
  const siteId = siteInDistrict(raw);
  return siteId ? SITES[siteId].phoneAr : REAL_CONTACTS.unified;
}

export async function POST(req: Request) {
  // 1. FREE PRE-FILTER. A speed bump, not the cap (see `_engine/guard.ts`).
  const pre = preFilter(req, "faysal:turn");
  if (!pre.ok) {
    return NextResponse.json(
      { error: pre.error, retryAfterSec: pre.retryAfterSec },
      { status: pre.status, headers: pre.retryAfterSec ? { "Retry-After": String(pre.retryAfterSec) } : undefined },
    );
  }

  // 2. FREE VALIDATION. LENGTH cap, not just a count cap — this is the control
  //    that bounds prompt size, and it is applied before anything can spend.
  const body = (await req.json().catch(() => ({}))) as TurnBody;
  const raw = String(body.text ?? "").trim().slice(0, FAYSAL_MAX_CHARS);
  if (!raw) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // The id comes from a public page's sessionStorage, so it is RESOLVED, never
  // trusted: an id that does not resolve mints a fresh session and the visitor
  // never learns whether the id they guessed exists.
  const session = resolveSession(body.sessionId);

  // 3. S0 — THE SAFETY SCREEN. On the RAW inbound, before the model, before the
  //    guard, before any scene, before the greeting. §5.1: "the red-flag triage
  //    screen runs BEFORE any greeting is selected. If the inbound message
  //    carries a red-flag symptom, NO greeting is sent at all."
  const verdict = readRedFlag(raw);

  if (verdict.fired && verdict.tier === "emergency") {
    // openTriageHold() — §1.5 R2. Set BEFORE the reply is enqueued. A rail that
    // speaks without holding is a rail the next turn walks past.
    session.triageHold = true;
    session.triageClass = verdict.cls;
    // The audit row references the rule, NEVER the patient's sentence (§6.4).
    console.warn("[faysal] red flag", { ruleId: verdict.ruleId, cls: verdict.cls, session: session.id });
    pushHistory(session, "user", raw);
    resetCourtesy(session);

    // Rule DEMO-1 detail 5: the rail is exempt from (b) and (c), and only from
    // those. Nothing is prepended or appended to §4.2's copy. `compose` with
    // `isRail` normalizes digits and does nothing else, so `997` stays `997`.
    const railText = compose(emergencyRailText(verdict), { isRail: true });
    pushHistory(session, "assistant", railText);

    return NextResponse.json({
      ok: true,
      sessionId: encodeSession(session),
      messages: [{ from: "faysal", text: railText }],
      // presentation: null — no list, no buttons, no quick replies. A tappable
      // "Book now" beside an ambulance instruction is the defect.
      chips: [],
      stopReason: RAIL_STOP_REASON,
      scene: "S0_safety",
    });
  }

  // The hold survives the turn that set it. Every later inbound in this thread is
  // still refused a booking — including "never mind, I'm fine".
  //
  // WHAT IT SAYS CHANGED; WHAT IT DOES DID NOT. A new HARD hit re-fires the frozen
  // rail byte for byte (§1.5 R2 H-7). Anything else — a thank-you, «هو بخير الحين»,
  // «عطني رقم الفرع» — gets §5.3's refusal plus the branch number, because H-6 says
  // a held patient «may always be handed a phone number. The hold blocks committing,
  // never unwinding or helping», and six verbatim sirens in one thread is not help.
  if (session.triageHold) {
    const held = readRedFlag(raw);
    const railText = held.fired
      ? compose(emergencyRailText(held), { isRail: true })
      : compose(S.holdTurn(heldBranchPhone(raw)), { isRail: true });
    pushHistory(session, "user", raw);
    pushHistory(session, "assistant", railText);
    return NextResponse.json({
      ok: true,
      sessionId: encodeSession(session),
      messages: [{ from: "faysal", text: railText }],
      chips: [],
      stopReason: RAIL_STOP_REASON,
      scene: "S0_safety",
    });
  }

  // 3b. THE URGENT TIER. Set HERE — above the guard, beside the emergency check —
  //     because this file's own header rule is that a safety rail gated on a billing
  //     counter is not a safety rail. Unlike `emergency` it does not stop the turn:
  //     §1.3 says the same-day appointment is offered AND the ER is named, so the
  //     booking machinery runs underneath the line.
  if (verdict.fired && verdict.tier === "urgent") {
    session.urgentPending = true;
    // The audit row references the rule, NEVER the patient's sentence (§6.4).
    console.warn("[faysal] urgent", { ruleId: verdict.ruleId, cls: verdict.cls, session: session.id });
  }

  // 4. THE FIRST PAID LINE. Everything above is free; the guard precedes every
  //    operation that can cost money, and it is consumed only now that the
  //    request is known to be valid and non-emergency.
  const guard = await consumeSpendGuard(clientIp(req));
  if (!guard.ok) {
    // …but an urgent verdict is already in hand, and it is free to say. A patient
    // who tripped the daily ceiling still gets told their symptom needs seeing today
    // and that 997 exists; what they lose is the booking, not the warning.
    if (session.urgentPending) {
      session.urgentPending = false;
      const urgentText = compose(S.SAFETY_URGENT_OFFER);
      pushHistory(session, "user", raw);
      pushHistory(session, "assistant", urgentText);
      return NextResponse.json({
        ok: true,
        sessionId: encodeSession(session),
        messages: [{ from: "faysal", text: urgentText }],
        chips: [],
        stopReason: "spend_guard_urgent",
        scene: session.scene,
      });
    }
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  // 5. At most ONE model call, and only for intent. It never sees a slot, a
  //    price, a doctor or a branch status, and its output is parsed into a fixed
  //    union — there is no field through which a fact can arrive.
  const cls = await classify(raw, session.history, session.offeredSlots.length);

  pushHistory(session, "user", raw);
  resetCourtesy(session);

  // `lib/health`'s booking store, rebuilt from the sealed session and written back
  // after the turn. See `_domain/index.ts` header note 2 — a process-local store
  // loses a hold the moment two turns land on two lambdas.
  const store = storeFromSnapshot(session.store);

  let out: Reply;
  try {
    out = session.greeted
      ? runTurn(session, raw, cls, new Date(), store)
      : // The visitor typed before the opener rendered (a page refresh, or a
        // client that skipped `/reset`). The greeting is still owed, and Rule
        // DEMO-1(b) with it.
        mergeOpening(session, raw, cls, store);
  } catch (e) {
    // A composition guard threw — Rule DEMO-1(c), Rule PKG-1, the cadence rule or
    // the English register. Those exist to stop a bad message shipping, so the
    // correct behaviour is the honest-unknown path, not a broken block.
    console.error("[faysal] composition refused", e);
    out = {
      messages: [{ from: "faysal", text: compose(S.fallbackHonestUnknown(`تتصل على ${REAL_CONTACTS.unified} والاستقبال يساعدك`)) }],
      chips: [],
      stopReason: "composition_refused",
      scene: session.scene,
    };
  }

  session.store = snapshotOfStore(store);
  for (const m of out.messages) if (m.from === "faysal") pushHistory(session, "assistant", m.text);
  return payload(encodeSession(session), out);
}

/**
 * First inbound with no opener yet: send Rule DEMO-1(b) + the greeting, then
 * answer the substance in the same turn. That is the engine's bundled-greeting
 * rule and it is what §9's turn 2 does — «وعليكم السلام … إي عندنا ليزر …» is one
 * turn carrying both.
 */
function mergeOpening(session: FaysalSession, raw: string, cls: Classification, store: FaysalStore): Reply {
  const now = new Date();
  const opening = openConversation(session, now, cls.language);
  if (cls.kind === "greeting_only") return opening;
  const rest = runTurn(session, raw, cls, now, store);
  // The system line is not negotiable — Rule DEMO-1(b) is defined as the FIRST
  // message of every conversation. `runTurn` will not re-emit it (it is already
  // marked sent), so it is carried over from the opening here.
  const system = opening.messages.filter((m) => m.from === "system");
  const greeting = opening.messages.filter((m) => m.from === "faysal");
  const merged = [...system, ...greeting, ...rest.messages];
  // THE ONE DOCUMENTED SPLIT-RECAP: the system line, the greeting, and the answer to
  // what they actually asked, in the same turn (§9's turn 2). Everywhere else the cap
  // is two, and `assertCadence` now enforces that rather than assuming three is free.
  const faysalCount = merged.filter((m) => m.from === "faysal").length;
  if (faysalCount <= 3) return { ...rest, messages: merged };
  // Over the §4.2 cap. The substantive answer wins; the greeting is what a real
  // coordinator drops when the patient opened with a request.
  return { ...rest, messages: [...system, ...rest.messages] };
}
