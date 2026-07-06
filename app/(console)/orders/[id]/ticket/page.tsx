// ============================================================================
// Kivo — Kitchen Ticket print view (legacy /(console) route). Thin wrapper over
// the shared <KitchenTicketView>; the ticket body + gating live in
// components/print/KitchenTicketView so the console_v2 /c route renders the exact
// same surface (cutover-1). This legacy route stays for flag-off tenants until
// cutover-2 deletes the old console group.
// ============================================================================

import { KitchenTicketView } from "@/components/print/KitchenTicketView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function KitchenTicketPage({ params }: { params: { id: string } }) {
  return <KitchenTicketView id={params.id} />;
}
