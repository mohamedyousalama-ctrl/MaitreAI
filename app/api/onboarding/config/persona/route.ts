// ============================================================================
// MaitreAI — Onboarding Step 3: persona + tone config
//
// GET  /api/onboarding/config/persona  — manager only (T4/M2.2)
// PUT  /api/onboarding/config/persona  — manager only
//
// Covers three restaurants columns:
//   agent_persona_name  text|null  — WhatsApp-facing agent name (migration 0012)
//   dialect             text       — 'saudi' | 'egyptian' (migration 0008)
//   ai_tone             jsonb      — AiToneConfig shape (lib/types.ts)
//
// Guardrails: zero changes to lib/ai/* — this endpoint only persists config.
// The AI prompt builder reads ai_tone and dialect on its own read path; we do
// not touch that path. Validation enforces known enum values so the prompt
// builder never receives an unrecognised variant.
//
// Auth: same pattern as /api/settings/ops and /api/settings/payment.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/db/require-tenant";
import type { AiToneConfig, AiPersonality, AiResponseLength, AiEmojiUsage, AiLanguage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIALECTS = ["saudi", "egyptian"] as const;
const PERSONALITIES: AiPersonality[] = ["formal", "friendly", "premium", "fastfood", "luxury"];
const LENGTHS: AiResponseLength[] = ["short", "medium", "detailed"];
const EMOJIS: AiEmojiUsage[] = ["none", "minimal", "normal"];
const LANGUAGES: AiLanguage[] = ["ar", "en", "bilingual"];

function normalizeAiTone(raw: unknown): AiToneConfig {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    personality: (PERSONALITIES.includes(o.personality as AiPersonality) ? o.personality : "friendly") as AiPersonality,
    responseLength: (LENGTHS.includes(o.responseLength as AiResponseLength) ? o.responseLength : "medium") as AiResponseLength,
    emojiUsage: (EMOJIS.includes(o.emojiUsage as AiEmojiUsage) ? o.emojiUsage : "minimal") as AiEmojiUsage,
    language: (LANGUAGES.includes(o.language as AiLanguage) ? o.language : "ar") as AiLanguage,
    greeting: typeof o.greeting === "string" ? o.greeting : "",
  };
}

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  // T4/M2.2 — persona/tone config is manager-only; operations members can't read it.
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("restaurants")
    .select("agent_persona_name, dialect, ai_tone")
    .eq("id", tenant.restaurantId)
    .single();

  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 502 });

  return NextResponse.json({
    agentPersonaName: data.agent_persona_name ?? null,
    dialect: data.dialect ?? "saudi",
    aiTone: normalizeAiTone(data.ai_tone),
  });
}

export async function PUT(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if ("agentPersonaName" in body) {
    if (body.agentPersonaName === null || body.agentPersonaName === "") {
      patch.agent_persona_name = null;
    } else if (typeof body.agentPersonaName === "string") {
      const name = body.agentPersonaName.trim();
      if (name.length > 60) {
        return NextResponse.json({ error: "bad_request", detail: "agentPersonaName must be ≤ 60 characters" }, { status: 400 });
      }
      patch.agent_persona_name = name;
    } else {
      return NextResponse.json({ error: "bad_request", detail: "agentPersonaName must be a string or null" }, { status: 400 });
    }
  }

  if ("dialect" in body) {
    if (!DIALECTS.includes(body.dialect as typeof DIALECTS[number])) {
      return NextResponse.json({ error: "bad_request", detail: `dialect must be one of: ${DIALECTS.join(", ")}` }, { status: 400 });
    }
    patch.dialect = body.dialect;
  }

  if ("aiTone" in body) {
    const t = body.aiTone;
    if (!t || typeof t !== "object" || Array.isArray(t)) {
      return NextResponse.json({ error: "bad_request", detail: "aiTone must be an object" }, { status: 400 });
    }
    const tone = t as Record<string, unknown>;

    if (tone.personality !== undefined && !PERSONALITIES.includes(tone.personality as AiPersonality)) {
      return NextResponse.json({ error: "bad_request", detail: `aiTone.personality must be one of: ${PERSONALITIES.join(", ")}` }, { status: 400 });
    }
    if (tone.responseLength !== undefined && !LENGTHS.includes(tone.responseLength as AiResponseLength)) {
      return NextResponse.json({ error: "bad_request", detail: `aiTone.responseLength must be one of: ${LENGTHS.join(", ")}` }, { status: 400 });
    }
    if (tone.emojiUsage !== undefined && !EMOJIS.includes(tone.emojiUsage as AiEmojiUsage)) {
      return NextResponse.json({ error: "bad_request", detail: `aiTone.emojiUsage must be one of: ${EMOJIS.join(", ")}` }, { status: 400 });
    }
    if (tone.language !== undefined && !LANGUAGES.includes(tone.language as AiLanguage)) {
      return NextResponse.json({ error: "bad_request", detail: `aiTone.language must be one of: ${LANGUAGES.join(", ")}` }, { status: 400 });
    }
    if (tone.greeting !== undefined && typeof tone.greeting !== "string") {
      return NextResponse.json({ error: "bad_request", detail: "aiTone.greeting must be a string" }, { status: 400 });
    }
    if (typeof tone.greeting === "string" && tone.greeting.length > 300) {
      return NextResponse.json({ error: "bad_request", detail: "aiTone.greeting must be ≤ 300 characters" }, { status: 400 });
    }

    // Read current then merge so a partial patch preserves untouched fields.
    const { data: current } = await supabase
      .from("restaurants")
      .select("ai_tone")
      .eq("id", tenant.restaurantId)
      .single();
    const merged = { ...normalizeAiTone(current?.ai_tone), ...tone };
    patch.ai_tone = merged;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "bad_request", detail: "no recognised fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("restaurants")
    .update(patch)
    .eq("id", tenant.restaurantId);

  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });

  return NextResponse.json({ ok: true });
}
