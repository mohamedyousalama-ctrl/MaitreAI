// ============================================================================
// فيصل / Faysal — the demo surface for Al Wattan Medical Group.
//
// NOINDEX, ALWAYS. This page wears a real clinic group's registered trade name,
// real branch addresses and real published phone numbers, with invented doctors,
// invented clinic timetables and invented prices. A search engine that indexed it
// would put a fabricated tariff under the client's own brand, which is the exact
// harm Rule DEMO-1 exists to prevent — so the robots directive is not a nicety
// and it is not conditional on an environment variable.
//
// NO HOST GATE, deliberately, and this is a difference from the Kivo demo. That
// one is pinned to a marketing hostname because it is a lead magnet; this one has
// to open on whatever URL the founder puts in front of a client, including a
// preview deployment, so the controls are the ones that actually bound harm:
// `noindex`, the persistent Rule DEMO-1(a) chrome, Rule DEMO-1(b) as the first
// message carrying the REAL booking numbers, Rule DEMO-1(c) on every confirmation,
// the per-IP rate limit and the durable daily spend ceiling. A hostname check
// would have added nothing to any of those.
//
// Server component. The conversation, the frozen strings and every fact live on
// the server; the client renders what it is given and composes nothing.
// ============================================================================

import type { Metadata } from "next";
import FaysalChat from "./FaysalChat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "فيصل — مجموعة الوطن الطبية (عرض تجريبي)",
  description: "عرض تجريبي لوكيل حجز المواعيد. المواعيد والأسعار المعروضة افتراضية وغير معتمدة.",
  robots: { index: false, follow: false, nocache: true },
};

export default function FaysalPage() {
  return <FaysalChat />;
}
