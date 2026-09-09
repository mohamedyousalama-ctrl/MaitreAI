// ============================================================================
// فيصل / Faysal — POST /api/faysal/reset. START, AND RESTART.
//
// The founder needs to be able to wipe the thread mid-demo and start clean, in
// one tap, on a client's screen. So this route does exactly one thing and does it
// the same way every time: it drops the old session, mints a new one, and returns
// the opener — Rule DEMO-1(b)'s system line followed by the greeting SPEC-2 §2.2
// selects for the current Riyadh hour.
//
// THE PAGE CALLS THE SAME ROUTE ON MOUNT. Start and restart are the same
// operation, so there is no second code path that could drift: whatever the
// founder sees when they tap «محادثة جديدة» is what a visitor sees on arrival.
//
// A RESET IS THE ONLY WAY OUT OF A TRIAGE HOLD, and that is deliberate. SPEC-4
// §1.5 R2 makes the verdict non-revisable for the life of the thread; a new
// thread is a new patient. Nothing in `/turn` can clear the flag.
//
// IT SPENDS NOTHING. No model call, no database write, so it takes the free
// per-IP pre-filter and never touches the durable daily ceiling — otherwise a
// stream of resets could take the demo dark at zero cost to the sender, which is
// the single most likely thing to happen to a public URL once it is being shared.
// ============================================================================

import { NextResponse } from "next/server";
import { detectLanguage } from "../_engine/intent";
import { preFilter } from "../_engine/guard";
import { FAYSAL_PER_IP_RESETS } from "../_engine/limits";
import { openConversation } from "../_engine/scenes";
import { encodeSession, newSession, pushHistory } from "../_engine/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const pre = preFilter(req, "faysal:reset", FAYSAL_PER_IP_RESETS);
  if (!pre.ok) {
    return NextResponse.json(
      { error: pre.error, retryAfterSec: pre.retryAfterSec },
      { status: pre.status, headers: pre.retryAfterSec ? { "Retry-After": String(pre.retryAfterSec) } : undefined },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { lang?: unknown };
  // Nothing to drop: the old session lived only in the client's own sealed token,
  // and this response replaces it. That is also what makes reset the ONLY exit
  // from a triage hold — a new token is a new thread, and a new thread is a new
  // patient (SPEC-4 §1.5 R2).
  const session = newSession();
  const language = typeof body.lang === "string" ? detectLanguage(body.lang) : "ar";
  const opener = openConversation(session, new Date(), language);
  for (const m of opener.messages) if (m.from === "faysal") pushHistory(session, "assistant", m.text);

  return NextResponse.json({
    ok: true,
    sessionId: encodeSession(session),
    messages: opener.messages,
    chips: opener.chips,
    stopReason: null,
    scene: opener.scene,
  });
}
