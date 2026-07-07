// ============================================================================
// console_v2 — Kitchen Ticket print view at /c/orders/[id]/ticket (cutover-1).
// The console_v2 home for the kitchen ticket: the Live Shift order cards link
// here. Chromeless by placement — this route sits OUTSIDE /c/(app), so it gets no
// AppFrame rail (a print page must be bare), only the group's LangShell + the
// Layer-1 CONSOLE_V2 env gate. The page's OWN gating (tenant + kitchen_ticket flag
// + order ownership) lives in <KitchenTicketView> and protects the data. One
// source of truth shared with the legacy route until cutover-2 removes the latter.
// ============================================================================

import { KitchenTicketView } from "@/components/print/KitchenTicketView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ConsoleV2KitchenTicketPage({ params }: { params: { id: string } }) {
  // console_v2 renders the shared ticket on the dark misty-slate chrome (the white
  // paper is unchanged — a kitchen ticket prints black-on-white). `dark` is opt-in;
  // the legacy route passes no prop and keeps its warm cream ground untouched.
  return <KitchenTicketView id={params.id} dark />;
}
