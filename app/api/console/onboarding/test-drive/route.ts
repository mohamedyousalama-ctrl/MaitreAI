// ============================================================================
// MaitreAI — Item 15 (Onboarding): the AGENT TEST-DRIVE door — SERVER ONLY.
// A manager talks to Karim on their OWN tenant before any real customer does.
// This runs the EXACT production Brain via runCustomerTurn — same menu, same
// deterministic allergen gate — with two differences that make it a sandbox:
//   • conversationId = null → nothing is persisted as a customer conversation,
//   • it returns the reply as JSON and NEVER sends anything to WhatsApp.
//
// Mode note (why this is faithful even before go-live): the allergen gate runs
// UNCONDITIONALLY inside runCustomerTurn, ahead of and independent of agent_mode,
// and runCustomerTurn always produces the Brain's reply (mode only governs the
// SEND path, which we don't touch here). So a test-drive on a setup-mode tenant
// exercises the real safety floor exactly as production would — the whole point.
//
// Safety is structural, never a go-live checkbox: an allergen-avoidance message
// forces a deterministic escalation (no LLM), which we surface so the manager can
// SEE the gate hold. Manager-only; the agent turn costs real tokens, so it runs
// only on an explicit manager action.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCustomerTurn, CustomerTurnError } from "@/lib/ai/customer-turn";
import { recordAuditEvent } from "@/lib/db/audit";
import type { LlmMessage } from "@/lib/ai/llm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  // Onboarding / go-live is a manager surface; the test-drive costs tokens.
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: unknown; history?: unknown };
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Sandbox history = prior test-drive turns from the client (bounded). This never
  // reads a real conversation — the test-drive is stateless on the server.
  const history: LlmMessage[] = Array.isArray(body.history)
    ? (body.history as unknown[]).slice(-20).flatMap((m) => {
        if (!m || typeof m !== "object") return [];
        const role = (m as { role?: unknown }).role === "assistant" ? "assistant" : "user";
        const content = String((m as { content?: unknown }).content ?? "").trim();
        return content ? [{ role, content } as LlmMessage] : [];
      })
    : [];

  try {
    const out = await runCustomerTurn(admin, {
      restaurantId: tenant.restaurantId,
      conversationId: null, // ephemeral — no customer conversation, nothing sent
      history,
      userMessage: text,
    });
    // The deterministic allergen gate stamps this exact model id when it fires.
    const allergenGate = out.model === "deterministic_allergen_gate";
    // WO-GATE-ALLERGY — when the gate FIRES in the test-drive, record the durable,
    // timestamped proof the go-live gate requires (the allergy hard-test passed in
    // test mode). Best-effort (recordAuditEvent never throws); entity = the tenant.
    if (allergenGate) {
      await recordAuditEvent(admin, {
        restaurantId: tenant.restaurantId,
        userId: tenant.userId,
        role: tenant.role,
        action: "onboarding_allergy_test_passed",
        entityType: "restaurant",
        entityId: tenant.restaurantId,
        metadata: { message: text.slice(0, 200), reason: out.escalationReason ?? null },
      });
    }
    return NextResponse.json({
      ok: true,
      reply: out.reply,
      escalate: out.escalate,
      escalationReason: out.escalationReason,
      mode: out.mode,
      allergenGate,
    });
  } catch (e) {
    if (e instanceof CustomerTurnError && e.code === "restaurant_not_found") {
      return NextResponse.json({ error: "restaurant_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "agent_error", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
