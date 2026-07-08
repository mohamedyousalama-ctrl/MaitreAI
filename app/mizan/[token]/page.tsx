// ============================================================================
// MaitreAI — MIZAN hosted reviewer page (/mizan/<token>). Token-scoped, public,
// no login — the token IS the auth. Mirrors /t/ and /d/: inert (404) when the flag
// is off, 404 on an unknown token, otherwise hands the reviewer-safe packet to the
// client island. WO-KHALID-STEP5B.
// ============================================================================

import { notFound } from "next/navigation";
import { ENABLE_MIZAN_PANEL } from "@/lib/feature-flags";
import { reviewerPacket, validateReviewerToken } from "@/lib/mizan/active-packet";
import { MizanReviewClient } from "./MizanReviewClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function MizanReviewPage({ params }: { params: { token: string } }) {
  if (!ENABLE_MIZAN_PANEL) notFound();
  if (!validateReviewerToken(params.token)) notFound();

  const packet = reviewerPacket();
  return <MizanReviewClient token={params.token} packet={packet} />;
}
