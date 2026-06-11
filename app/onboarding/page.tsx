// ============================================================================
// MaitreAI — Onboarding (Sprint 7 STUB)
// New signups with no restaurant land here. The full self-serve wizard (menu
// ingestion, branches, zones, persona, WhatsApp connect) is Sprint 10. For now
// this is a placeholder so auth routing has a destination.
// ============================================================================

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-promotions to-orders text-white shadow-card">
          <Sparkles className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-bold text-slate-900">أهلاً بك في MaitreAI 👋</h1>
        <p className="mt-2 text-sm text-slate-500">
          لم يتم ربط حسابك بأي مطعم بعد. معالج الإعداد الذاتي الكامل (رفع المنيو، الفروع،
          مناطق التوصيل، شخصية الموظف، وربط واتساب) سيصل في مرحلة لاحقة.
        </p>
        <p className="mt-3 text-xs text-slate-400">
          في هذه المرحلة، يمكن لمشروع Supabase تشغيل دالة <code>seed_demo_restaurant</code>
          لإنشاء مطعم تجريبي مربوط بحسابك.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-conversations px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          المتابعة <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
