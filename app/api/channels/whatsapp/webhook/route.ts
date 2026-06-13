// ============================================================================
// MaitreAI — Legacy WhatsApp webhook path (kept for back-compat).
// The canonical handler now lives at /api/whatsapp/webhook (the URL configured
// in Meta). This thin re-export keeps the old path working too. Runtime/dynamic
// must be literal exports here (Next can't forward them from another module).
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { GET, POST } from "@/app/api/whatsapp/webhook/route";
