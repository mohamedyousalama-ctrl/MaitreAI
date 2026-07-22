import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto/secrets";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseBrainIngressStore, handleWhatsAppBrainIngress, type BrainIngressTenantResolver } from "@/lib/brain/ingress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tenantResolver(supabase: SupabaseClient): BrainIngressTenantResolver {
  return {
    async resolveByPhoneNumberId(phoneNumberId) {
      const pnid = (phoneNumberId ?? "").trim();
      if (!pnid) return null;
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, wa_phone_number_id, wa_app_secret_enc")
        .eq("wa_phone_number_id", pnid)
        .eq("active", true)
        .maybeSingle();
      if (error || !data?.id || !data.wa_app_secret_enc) return null;
      try {
        const appSecret = decryptSecret(String(data.wa_app_secret_enc));
        return {
          tenantId: String(data.id),
          phoneNumberId: pnid,
          appSecrets: [appSecret],
        };
      } catch {
        return null;
      }
    },
  };
}

// Shadow-only BRAIN ingress endpoint. Meta is not pointed here. This route does
// not call WhatsApp, mutate orders, mutate conversations, or invoke the live
// customer engine.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const rawBody = Buffer.from(await req.arrayBuffer());
  const result = await handleWhatsAppBrainIngress({
    rawBody,
    signatureHeader: req.headers.get("x-hub-signature-256"),
    tenantResolver: tenantResolver(supabase),
    store: createSupabaseBrainIngressStore(supabase),
  });

  return NextResponse.json(result, { status: result.status });
}
