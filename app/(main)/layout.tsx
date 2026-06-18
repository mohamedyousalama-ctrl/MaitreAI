import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { PulseStrip } from "@/components/layout/PulseStrip";
import { MobileTabs } from "@/components/layout/MobileTabs";
import { DataBootstrap } from "@/components/DataBootstrap";

// App shell (Terracotta): thin 74px icon rail (lg) / bottom tabs (mobile) +
// white top bar + Pulse strip, on a warm cream #E6DDD0 canvas with radial glows
// and an inner #F6F0E7 content surface. IBM Plex Sans Arabic (UI) + IBM Plex
// Sans (latin). The checkout route lives outside this group (full-screen).
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="flex h-screen overflow-hidden text-[#2A2019]"
      style={{
        fontFamily: "'IBM Plex Sans Arabic', var(--font-arabic), sans-serif",
        background:
          "radial-gradient(1100px 640px at 88% -6%, rgba(190,82,56,.08), transparent 60%), radial-gradient(900px 560px at 6% 8%, rgba(184,137,60,.07), transparent 58%), #E6DDD0",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@500;600;700&display=swap"
        rel="stylesheet"
      />
      <DataBootstrap />
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <PulseStrip />
        <main className="flex-1 overflow-y-auto bg-[#F6F0E7] p-4 pb-20 md:p-6 lg:pb-6">{children}</main>
      </div>
      <MobileTabs />
    </div>
  );
}
