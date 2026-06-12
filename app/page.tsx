// ============================================================================
// MaitreAI — public landing page (root)
// Publicly reachable (no login wall) so visitors and platform reviewers see a
// real page with the legal entity. CTAs route to /login (email OTP). Copy +
// brand per PRD Amendment 04 (§M1 design language). The legal footer
// (SiteFooter) is unchanged — Meta verification depends on it.
// ============================================================================

import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#faf6ef", color: "#2a211b" }}>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="MaitreAi" width={232} height={56} className="h-14 w-auto" />

        <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: "#2a211b" }}>
          شغّل طلبات مطعمك بذكاء
        </h1>

        <p className="mt-5 max-w-2xl text-lg leading-relaxed" style={{ color: "#4a3f36" }}>
          MaitreAI — مساعد تشغيل ومبيعات للمطاعم. يبدأ من واتساب، ويُدير تجربة الطلب كاملة: من
          المحادثة إلى المطبخ، الدفع، التتبّع، والعروض.
        </p>

        <p className="mt-4 max-w-xl text-base font-semibold" style={{ color: "#b5502e" }}>
          مطعمك يحتاج أكثر من بوت. يحتاج مساعد تشغيل.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl px-8 py-3 text-base font-semibold text-white shadow-sm transition hover:opacity-95"
            style={{ backgroundColor: "#b5502e" }}
          >
            ابدأ التجربة
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl border px-8 py-3 text-base font-semibold transition hover:bg-black/5"
            style={{ borderColor: "#ddc9b6", color: "#2a211b" }}
          >
            شاهد كيف يعمل
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
