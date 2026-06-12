// ============================================================================
// MaitreAI — public landing page (root)
// Publicly reachable (no login wall) so visitors and platform reviewers see a
// real page with the legal entity. The CTA goes to /dashboard, which is the
// app today and becomes the auth gate once Sprint 7 ships.
// ============================================================================

import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-bold text-white shadow-lg shadow-emerald-600/20">
          M
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900">MaitreAI</h1>
        <p className="mt-3 max-w-md text-lg text-slate-600">موظف واتساب الذكي للمطاعم</p>
        <p className="mt-2 max-w-lg text-sm text-slate-500">
          استقبل الطلبات، أجب على العملاء، وأدِر مطعمك تلقائيًا عبر واتساب على مدار الساعة.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          تسجيل الدخول
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
