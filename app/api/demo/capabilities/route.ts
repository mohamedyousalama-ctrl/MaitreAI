// ============================================================================
// Kivo — what the PUBLIC demo can actually do right now, so the UI never claims
// a capability it does not have.
//
// WHY THIS EXISTS. The call button was a static panel that said, honestly, "the voice call
// is not enabled in the demo". Making it a real hands-free voice conversation is only
// honest while Khalid can actually speak — and whether he can is a SERVER fact
// (`demoVoiceProviderPinned()`: an explicit adapter pin, a key, and a registered voice)
// that the browser cannot see. Without this endpoint the client would have to guess, and
// the two ways to guess are both bad: assume voice works and open a call screen that
// answers with silence, or assume it does not and never open one at all.
//
// The failure mode this prevents is the one KIV-308 calls the worst outcome available:
// "shipping a convincing fake call in front of a restaurant owner". A call screen that
// listens, thinks, and then says nothing IS that fake — it looks like a dropped call
// rather than an unconfigured feature.
//
// WHAT IT DOES NOT REVEAL. One boolean: can this surface speak. Not which provider, not
// which voice, not whether a key exists, not why it is off. A visitor learns the same
// boolean by pressing the button, so it discloses nothing they could not already observe,
// and nothing that helps anyone reach the provider account.
// ============================================================================

import { NextResponse } from "next/server";
import { demoVoiceProviderPinned } from "@/lib/demo/voice-out";
import { resolveSttAdapterName } from "@/lib/ai/stt";
import { isDemoHost } from "@/lib/demo/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Same in-handler host gate as the two demo routes. A capability probe is not a reason
  // to be reachable somewhere the demo itself is not.
  if (!isDemoHost(req.headers.get("host"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // BOTH HALVES OR NEITHER. A hands-free conversation needs ears as well as a voice, and
  // /api/demo/voice refuses the mock STT adapter outright on every environment — so if STT
  // resolves to the mock, the loop cannot run at all and the call screen must not offer it.
  const voiceIn = resolveSttAdapterName() !== "mock";
  const voiceOut = demoVoiceProviderPinned();

  return NextResponse.json(
    { voiceCall: voiceIn && voiceOut },
    // Never cached: this flips with a deployment's configuration, and a CDN holding
    // `true` after the voice is switched off is exactly the silent call screen above.
    { headers: { "Cache-Control": "no-store" } }
  );
}
