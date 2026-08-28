// ============================================================================
// Kivo — the public Khalid demo. A WhatsApp-style phone, so a restaurant owner
// recognises it instantly and has nothing to learn.
//
// WHY IT LOOKS LIKE WHATSAPP: the product genuinely runs on WhatsApp. Showing the
// experience in any other shell would misrepresent it and force the viewer to
// translate. Every WhatsApp Business vendor demos this way.
//
// WHERE THE LINE IS: this is WhatsApp-STYLE, not a counterfeit. No Meta logo, no
// wordmark, no claim to be WhatsApp, and a persistent "تجربة" marker in the header.
// The layout, the bubbles, the hold-to-record voice note and the call button are
// copied because they are the interaction language the audience already speaks —
// the branding is not.
//
// Server component: host-gated and noindex. The conversation lives in the client.
// ============================================================================

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isDemoHost } from "@/lib/demo/config";
import DemoPhone from "./DemoPhone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "خالد — تجربة",
  // A demo tenant with synthetic prices must never be indexed as a real menu.
  robots: { index: false, follow: false, nocache: true },
};

export default async function DemoPage() {
  // Defence in depth. The API enforces this itself (middleware is bypassable by
  // file-extension suffix), but the page should not render off-host either.
  const host = (await headers()).get("host");
  if (!isDemoHost(host)) notFound();
  return <DemoPhone />;
}
