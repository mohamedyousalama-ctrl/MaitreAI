import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { PulseStrip } from "@/components/layout/PulseStrip";
import { MobileTabs } from "@/components/layout/MobileTabs";
import { DataBootstrap } from "@/components/DataBootstrap";

// App shell: sidebar (lg) / bottom tabs (mobile) + topbar + Pulse strip. The
// checkout route lives outside this group so it renders full-screen.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <DataBootstrap />
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <PulseStrip />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 lg:pb-6">{children}</main>
      </div>
      <MobileTabs />
    </div>
  );
}
