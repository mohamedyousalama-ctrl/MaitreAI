// الفريق (Team) — manager-only roster + role toggle + staff invite. The route is
// manager-gated by ConsoleLayout's RoleGuard (not in OPERATION_HREFS → operators
// are redirected); every mutation is additionally manager-gated server-side.
import { TeamClient } from "@/components/team/TeamClient";

export default function TeamPage() {
  return <TeamClient />;
}
