// ============================================================================
// Kivo — PUBLIC KHALID DEMO turn. No login, no tenant session, no WhatsApp.
//
// This runs the REAL Brain via runCustomerTurn against a synthetic tenant, so a
// visitor is talking to the actual agent — same menu, same deterministic allergen
// gate, same safety floor — not a script. That is the point of the demo and it is
// why the hardening below is not optional.
//
// PUBLIC + UNAUTHENTICATED + CALLS AN LLM. Three things follow, and each is a
// deliberate control rather than a precaution:
//
// 1. INPUT IS CAPPED, HARD. The manager test-drive route this is modelled on caps
//    history by COUNT (slice(-20)) and not by LENGTH. Behind an authenticated
//    manager that is fine. Here it is a funded denial-of-wallet: `text` and every
//    `history[i]` reach the model unbounded, and respond.ts runs up to
//    MAX_ITERATIONS = 6 model calls per request, so ONE request can drive six
//    passes over an attacker-chosen context — bounded only by the platform body
//    limit and the model's context window. Measured turns on this tenant cost
//    ~$0.002; a crafted one is estimated at $0.60–$3.60. The caps below are what
//    keep a public URL from being a bill.
//
// 2. THE RESPONSE IS AN ALLOWLIST, NOT THE OUTCOME. CustomerTurnOutcome carries
//    `features` (the raw tenant flag JSON), `costUsd`, `usage`, `model`, `tier`
//    and `agentRunId`. Returning it wholesale would publish our unit economics on
//    a sales page. Only the named fields below leave this handler — an ALLOWLIST, so a
//    new field on the outcome is never published by accident.
//
//    It is a positive list, which means it can also FAIL BY OMISSION: `presentation`
//    and `photoRequests` were missing, so the interactive menu the Brain built every
//    turn was silently discarded and Khalid pointed at categories nobody could see.
//    proof-public-demo-hardening now asserts both directions — what must never leave,
//    and what must always be forwarded.
//
// 3. THE TENANT IS PINNED SERVER-SIDE and never read from the request. A client
//    that could name its own restaurantId could drive the Brain against a real
//    tenant's menu and bill it to them.
//
// 4. THE SESSION ID IS RESOLVED, NEVER TRUSTED (WO-KHALID-ORDER). This route now
//    accepts a `conversationId` so the basket survives a turn — without it the agent
//    could not close an order at all, and a live 50-conversation run caught it asking
//    «أجهّز لك الطلب؟» six times in a row and never producing an order number. But that
//    id comes from a public page's sessionStorage, so it is looked up with the tenant
//    AND the channel pinned (lib/demo/session.ts). An id belonging to anything else
//    does not resolve; a fresh session is minted and the visitor never learns whether
//    the id they guessed exists.
//
//    Having a conversation id also REARMED every side effect that was previously off
//    only because the id was null — including recordCriticalAlert, which emails and
//    WhatsApps the Founder. Those are now gated on `demoRun` inside customer-turn.ts
//    (`staffFacingConversationId`), which is why `demoRun: true` below is not optional
//    and is not redundant with anything.
//
// The host check is IN THIS HANDLER, not middleware, on purpose: the middleware
// matcher skips any path ending .svg/.png/.jpg/.gif/.webp/.ico, so a middleware-only
// gate is bypassable by suffix. This route also deliberately has NO trailing
// dynamic segment, so there is no user-controlled path component to smuggle one in.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCustomerTurn, CustomerTurnError } from "@/lib/ai/customer-turn";
import { formatCustomerVisibleText, formatCustomerVisiblePresentation } from "@/lib/util/customer-visible-format";
import { handleTypedInteractiveAction, handleTypedQuantityFill, isTypedInteractiveActionId, safetyProbeFired } from "@/lib/messaging/typed-actions";
import { detectAllergenAvoidance } from "@/lib/ai/allergen-gate";
import { detectAllergenSymptom } from "@/lib/ai/allergen-gate-symptoms";
import { detectAllergenEmergency } from "@/lib/ai/allergen-emergency";
import { detectAllergyContext } from "@/lib/ai/allergen-context";
import { rateLimit } from "@/lib/rate-limit";
import { isDemoHost } from "@/lib/demo/config";
import {
  DEMO_RESTAURANT_ID, DEMO_MAX_CHARS, DEMO_MAX_HISTORY, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS,
  DEMO_GLOBAL_DAILY_TURNS, globalBucket, ipBucket,
} from "@/lib/demo/config";
import { resolveDemoSession } from "@/lib/demo/session";
import { closeDemoOrder } from "@/lib/demo/order";
import type { LlmMessage } from "@/lib/ai/llm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One perception call plus up to MAX_ITERATIONS model calls over a ~17k-token system
// prompt. The platform default timeout can kill that mid-turn, after the guard slot and
// the model spend are already gone, leaving the visitor a generic error.
export const maxDuration = 60;

/** First hop of x-forwarded-for — the client as the edge saw it. */
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  // Host gate, in-handler (see header). Serves only where the demo is meant to live.
  if (!isDemoHost(req.headers.get("host"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Cheap pre-filter only. lib/rate-limit is a process-local Map that resets on a
  // cold start and is not shared across lambdas — it is a speed bump, NOT the cap.
  // The real ceiling is the input caps below plus a platform-level firewall rule.
  const rl = rateLimit(`demo:${clientIp(req)}`, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // THE DURABLE CAP. Everything above this point is a speed bump; this is the control.
  // Two ceilings and a kill switch, all in one atomic call (migration 0119):
  //   - a GLOBAL daily ceiling, which is what actually protects the card — a per-IP
  //     limit alone is defeated by any number of source addresses;
  //   - a per-IP hourly ceiling, shared across lambdas unlike the Map above;
  //   - `demo_controls.enabled`, read on every turn, so the demo can be stopped in
  //     seconds by flipping one boolean — no redeploy, no env change, no build.
  // Fails CLOSED: if the guard itself errors we refuse the turn rather than spend.
  const body = (await req.json().catch(() => ({}))) as {
    text?: unknown; history?: unknown; conversationId?: unknown; interactiveId?: unknown;
  };
  // LENGTH cap, not just a count cap. This is the control that bounds spend.
  const text = String(body.text ?? "").trim().slice(0, DEMO_MAX_CHARS);
  if (!text) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const history: LlmMessage[] = Array.isArray(body.history)
    ? (body.history as unknown[]).slice(-DEMO_MAX_HISTORY).flatMap((m) => {
        if (!m || typeof m !== "object") return [];
        const role = (m as { role?: unknown }).role === "assistant" ? "assistant" : "user";
        // Every history entry is capped too — an attacker controls this array.
        const content = String((m as { content?: unknown }).content ?? "").trim().slice(0, DEMO_MAX_CHARS);
        return content ? [{ role, content } as LlmMessage] : [];
      })
    : [];

  // GUARD CONSUMED ONLY AFTER THE REQUEST IS VALID.
  //
  // This block used to run before the body was parsed, and the guard increments its
  // GLOBAL counter on the way in. So `POST {}` — no text, rejected below as bad_request —
  // still burned one of the day's slots at zero cost to the sender. About a thousand empty
  // posts, trivially spread across an IPv6 /64 so neither per-IP cap ever engages, took the
  // demo dark until 00:00 UTC (03:00 Riyadh), with no auto-recovery and no alert. That is
  // the single most likely thing to happen to a public URL once it is being shared.
  //
  // Validation is free — no model call, no provider, no bytes beyond a parsed JSON body —
  // so doing it first costs nothing, and the guard still precedes every PAID operation,
  // which the proof asserts by source ordering rather than by comment.
  const ip = clientIp(req);
  const { data: guard, error: guardErr } = await admin
    .rpc("kv_demo_try_consume", {
      p_ip_bucket: ipBucket(ip),
      p_global_bucket: globalBucket(),
      p_ip_limit: DEMO_PER_IP_TURNS,
      p_global_limit: DEMO_GLOBAL_DAILY_TURNS,
    })
    .maybeSingle<{ allowed: boolean; reason: string | null; global_turns: number }>();

  if (guardErr || !guard) {
    console.error("[demo] spend guard unavailable — refusing the turn", guardErr?.message);
    return NextResponse.json({ error: "demo_unavailable" }, { status: 503 });
  }
  if (!guard.allowed) {
    // 503 for a deliberately stopped demo, 429 for a quota. Never leak the counts.
    const stopped = guard.reason === "disabled";
    return NextResponse.json(
      { error: stopped ? "demo_unavailable" : "rate_limited" },
      { status: stopped ? 503 : 429 },
    );
  }

  // THE EPHEMERAL ORDER SESSION. The id below is attacker-controlled — it comes from
  // the visitor's own sessionStorage — and is NEVER used as given: resolveDemoSession
  // resolves it against the database with `restaurant_id = DEMO_RESTAURANT_ID` AND
  // `channel = 'demo'`, so another tenant's conversation id simply does not resolve and
  // a fresh session is minted instead. It returns null when the database cannot give us
  // a session at all, in which case this turn runs exactly as the demo ran before the
  // session existed: stateless, and still a working demo.
  const session = await resolveDemoSession(admin, body.conversationId);
  const conversationId = session?.conversationId ?? null;

  // THE DETERMINISTIC RAIL — what a TAP does on WhatsApp, now on the demo too.
  //
  // lib/messaging/typed-actions.ts turns a tapped row id into an ACTION with no model call
  // at all: set pickup/delivery, set a quantity, add a category's items, cancel. Only
  // lib/messaging/respond-and-send.ts — the WhatsApp bridge — ever reached it; this route
  // calls runCustomerTurn directly and so reached NONE of it, even though the demo tenant's
  // seed turns `typed_interactive_actions` and `typed_quantity_fill` ON. Dead configuration.
  //
  // `confirm_gate` is deliberately NOT handled here: it canonicalises the tap to the fixed
  // «تأكيد الطلب.» string and falls through to the normal turn, so a tap and a typed confirm
  // land on the SAME text and the same closeDemoOrder path. That is exactly what
  // respond-and-send.ts does with it.
  //
  // The id arrives from a public page, so it is length-capped and MUST pass
  // isTypedInteractiveActionId first — handleTypedInteractiveAction THROWS on an
  // unregistered id. An id we do not recognise is ignored and the turn proceeds as text;
  // handleUnknownInteractiveCommand is never called here, because it writes a staff-facing
  // row carrying the visitor's own words, which is precisely what `demoRun` forbids.
  const rawInteractiveId = String(body.interactiveId ?? "").trim().slice(0, 64);
  let userMessage = text;

  // ONE PROBE, BOTH RAILS. `text` and `interactiveId` are INDEPENDENT fields on a public
  // endpoint, so a request can carry a tap id AND «عندي حساسية وصار عندي ضيق تنفس» in the
  // same body. The tap rail answers with no model call and returns early, which skips
  // runCustomerTurn and the deterministic allergen gate with it — so a tap must not be
  // allowed to outrank a safety signal in the text. WhatsApp does exactly this
  // (respond-and-send.ts `burstSafetyTakesPriority`), and this route's own header promises
  // «the same deterministic allergen gate».
  const safetyProbe = {
    allergenAvoidance: detectAllergenAvoidance(text).fired,
    allergenSymptom: detectAllergenSymptom(text).fired,
    allergyContext: detectAllergyContext(text).fired,
    allergenEmergency: detectAllergenEmergency(text).fired,
  };
  const safetyFired = safetyProbeFired(safetyProbe);

  if (conversationId && rawInteractiveId && !safetyFired && isTypedInteractiveActionId(rawInteractiveId)) {
    try {
      const typed = await handleTypedInteractiveAction(admin, {
        restaurantId: DEMO_RESTAURANT_ID,
        conversationId,
        interactiveId: rawInteractiveId,
        features: null,
        safetyProbe,
        demoRun: true,
      });
      if (typed.kind === "confirm_gate") {
        userMessage = typed.userMessage;
      } else {
        return NextResponse.json({
          ok: true,
          conversationId,
          reply: formatCustomerVisibleText(typed.reply, typed.dialect),
          presentation: typed.presentation
            ? formatCustomerVisiblePresentation(typed.presentation, typed.dialect)
            : null,
          photoRequests: [],
        });
      }
    } catch (e) {
      // Never let the rail break a turn that the text path can still serve.
      console.error("[demo] typed action failed; falling through to the model", e);
    }
  }

  // THE QUANTITY RAIL. The tap rail above resolves «qty:2»; this is the same rail for a
  // customer who TYPES the answer — «وحده بس», «حبتين», «٣ حبات» — which is what a customer
  // actually does. lib/messaging/quantity-fill.ts parses it deterministically and it was
  // reachable only from WhatsApp, so on the demo the most natural reply to our own
  // «كم حبة تبي؟» went to the model and hoped.
  //
  // Only when no interactive id was sent (a tap was already handled above) and a real
  // session exists. handleTypedQuantityFill is self-gating: it passes through on a
  // non-numeric answer, on no pending quantity question, on an ambiguous draft, and — as
  // of this change — on ANY safety signal in the turn.
  //
  // The tenant is PINNED to the demo restaurant and its seed enables `typed_quantity_fill`
  // (asserted in scripts/proof-demo-interactive-rail.test.ts), so the route does not spend
  // a second round-trip re-reading a flag the handler already reads with the row it needs.
  if (conversationId && !rawInteractiveId) {
    try {
      const filled = await handleTypedQuantityFill(admin, {
        restaurantId: DEMO_RESTAURANT_ID,
        conversationId,
        userMessage: text,
        interactiveId: null,
        features: null,
        // The same probe. It GATES rather than merely being recorded, so an allergen or
        // emergency turn can never be short-circuited past the safety pipeline by looking
        // like a bare quantity.
        safetyProbe,
        demoRun: true,
      });
      if (filled.kind === "handled") {
        return NextResponse.json({
          ok: true,
          conversationId,
          reply: formatCustomerVisibleText(filled.reply, filled.dialect),
          presentation: filled.presentation
            ? formatCustomerVisiblePresentation(filled.presentation, filled.dialect)
            : null,
          photoRequests: [],
        });
      }
    } catch (e) {
      console.error("[demo] typed quantity fill failed; falling through to the model", e);
    }
  }

  try {
    const out = await runCustomerTurn(admin, {
      restaurantId: DEMO_RESTAURANT_ID, // pinned; never from the request
      // Tenant-validated above. This is what makes the basket survive a turn — without
      // it customer-turn's draft reload is skipped and the agent asks «أجهّز لك الطلب؟»
      // forever because, from its side, the basket was empty every single time.
      conversationId,
      history,
      userMessage,
      // TRUE now, and only for the draft. The row it writes is OUR reply plus
      // `meta.draft` — the basket. The visitor's own message is still never persisted as
      // a message row, which also keeps the demo tenant out of the monitor's
      // `delivery_silence` check (it needs a recent INBOUND row to become eligible, and
      // that alert WhatsApps the Founder).
      persistReply: true,
      // UNCHANGED AND INDEPENDENT OF THE ABOVE. This is now the ONLY demo switch:
      // agent_runs.input/.output stay null, conversation_signals is skipped entirely,
      // and every staff-facing side effect in customer-turn.ts is gated on it rather
      // than on the conversation id.
      demoRun: true,          // do not keep a stranger's words; keep the cost row
    });

    // THE CLOSE. A finalized draft becomes a real orders row with a real order number
    // from the atomic allocator, stamped `is_test` + `source:"demo"`, and the honest
    // "this is a demo, nothing was charged" line is appended to what the visitor sees.
    // Never throws; a no-op unless this turn actually finalized a basket.
    const closed = await closeDemoOrder(admin, {
      conversationId,
      draft: out.draft,
      agentRunId: out.agentRunId,
      reply: formatCustomerVisibleText(out.reply, out.dialect),
      dialect: out.dialect,
    });

    return NextResponse.json({
      ok: true,
      // The session id goes back so the client can hold it for the next turn. Safe to
      // return: it is the id of a row that belongs to this visitor's own demo session
      // and to nothing else, and presenting it back is the only way the basket persists.
      conversationId,
      reply: closed.reply,
      orderNumber: closed.orderNumber,
      escalate: out.escalate,
      escalationReason: out.escalationReason,
      // The deterministic allergen gate stamps this exact model id when it fires.
      // Derived here so `model` itself never leaves the handler.
      allergenGate: out.model === "deterministic_allergen_gate",
      // THE INTERACTIVE PAYLOAD. Omitting this is why the demo answered «ايش المنيو» with
      // «اختار من التصنيفات» and no categories on screen: present_menu builds the real
      // list into ctx.presentation and tells the model it was rendered, WhatsApp renders
      // it at respond-and-send.ts, and this handler was dropping it. Every tap-first
      // affordance in the product — category list, item list, quantity, confirm/cancel,
      // payment methods, dish photos — was invisible here.
      //
      // Safe to return: titles, prices and captions come from the tenant's own menu and
      // are customer-visible by construction on WhatsApp. It carries no tenant flags, no
      // cost, no model identity — the allowlist above still holds for those.
      // FORMAT IT THE WAY WHATSAPP DOES. formatCustomerVisibleText was called only in
      // respond-and-send.ts, so the demo shipped the model's RAW output: no digit
      // normalisation and no bold sanitisation. The Saudi profile declares
      // digitStyle:"western" and the live demo was answering «الإجمالي: ٧٠.١٥ ر.س»
      // and «برقم #١٠٠١» in Arabic-Indic — the digit style the tenant bans.
      // The presentation carries prices in its row descriptions, so it needs the same pass.
      presentation: out.presentation
        ? formatCustomerVisiblePresentation(out.presentation, out.dialect)
        : out.presentation,
      photoRequests: out.photoRequests,
    });
  } catch (e) {
    if (e instanceof CustomerTurnError && e.code === "restaurant_not_found") {
      return NextResponse.json({ error: "demo_unavailable" }, { status: 503 });
    }
    // Never surface the underlying error text on a public endpoint.
    console.error("[demo] turn failed", e);
    return NextResponse.json({ error: "agent_error" }, { status: 502 });
  }
}
