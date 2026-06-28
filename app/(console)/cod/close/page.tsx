// تقفيل وردية — COD end-of-shift cash reconciliation + settle-all + printable
// slip. Manager-only via ConsoleLayout RoleGuard (not in OPERATION_HREFS); every
// mutation is additionally manager-gated server-side.
import { CloseShiftClient } from "@/components/cod/CloseShiftClient";

export default function CloseShiftPage() {
  return <CloseShiftClient />;
}
