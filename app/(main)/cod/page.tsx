import { CodLedgerClient } from "@/components/cod/CodLedgerClient";

// COD cash ledger (operator view). Reachable at /cod; composes under the
// Deliveries surface once the delivery module (PR #6) merges.
export default function CodLedgerPage() {
  return <CodLedgerClient />;
}
