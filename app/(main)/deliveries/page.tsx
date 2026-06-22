// ============================================================================
// MaitreAI — Operator deliveries view (behind ENABLE_DELIVERY_TRACKING).
// Server guard → 404 when the flag is off, so the route is inert. The live
// list + map + assignment + driver roster live in the client island.
// ============================================================================

import { notFound } from "next/navigation";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { DeliveriesClient } from "./DeliveriesClient";

export default function DeliveriesPage() {
  if (!ENABLE_DELIVERY_TRACKING) notFound();
  return <DeliveriesClient />;
}
