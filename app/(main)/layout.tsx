import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { PulseStrip } from "@/components/layout/PulseStrip";
import { DataBootstrap } from "@/components/DataBootstrap";

// App shell (sidebar + topbar + Pulse strip). The checkout route lives outside
// this group so the mock payment page renders full-screen without the chrome.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <DataBootstrap />
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <PulseStrip />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
