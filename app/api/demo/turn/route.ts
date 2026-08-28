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
// The host check is IN THIS HANDLER, not middleware, on purpose: the middleware
// matcher skips any path ending .svg/.png/.jpg/.gif/.webp/.ico, so a middleware-only
// gate is bypassable by suffix. This route also deliberately has NO trailing
// dynamic segment, so there is no user-controlled path component to smuggle one in.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCustomerTurn, CustomerTurnError } from "@/lib/ai/customer-turn";
import { rateLimit } from "@/lib/rate-limit";
import { isDemoHost } from "@/lib/demo/config";
import {
  DEMO_RESTAURANT_ID, DEMO_MAX_CHARS, DEMO_MAX_HISTORY, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS,
  DEMO_GLOBAL_DAILY_TURNS, globalBucket, ipBucket,
} from "@/lib/demo/config";
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
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; history?: unknown };
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

  try {
    const out = await runCustomerTurn(admin, {
      restaurantId: DEMO_RESTAURANT_ID, // pinned; never from the request
      conversationId: null,             // ephemeral — no customer conversation, nothing sent
      history,
      userMessage: text,
      persistReply: false,
      demoRun: true,          // do not keep a stranger's words; keep the cost row
    });
    return NextResponse.json({
      ok: true,
      reply: out.reply,
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
      presentation: out.presentation,
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
