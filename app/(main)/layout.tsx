import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { PulseStrip } from "@/components/layout/PulseStrip";
import { MobileTabs } from "@/components/layout/MobileTabs";
import { DataBootstrap } from "@/components/DataBootstrap";

// App shell (Bright-Corporate): thin icon rail (lg) / bottom tabs (mobile) +
// white top bar + Pulse strip, on a #F1F4F9 canvas with IBM Plex Sans Arabic.
// The checkout route lives outside this group so it renders full-screen.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="flex h-screen overflow-hidden bg-[#F1F4F9] text-[#1E2530]"
      style={{ fontFamily: "'IBM Plex Sans Arabic', var(--font-arabic), sans-serif" }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <DataBootstrap />
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <PulseStrip />
        <main className="flex-1 overflow-y-auto bg-[#F1F4F9] p-4 pb-20 md:p-5 lg:pb-6">{children}</main>
      </div>
      <MobileTabs />
    </div>
  );
}
