// Kivo console route group. Every page here renders inside <ConsoleLayout> so it
// gets the Kivo shell (sidebar + topbar), the `.kv-console` font/RTL base, and
// the per-tenant DataBootstrap. Pre-Kivo pages stay in the (main) group with the
// older shell until they migrate.

import { ConsoleLayout } from "@/components/console/ConsoleLayout";

export default function ConsoleGroupLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleLayout>{children}</ConsoleLayout>;
}
