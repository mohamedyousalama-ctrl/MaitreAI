// ============================================================================
// MaitreAI — Login page (server component, host-aware branding).
// Reads the request host (next/headers) and resolves it with the SAME
// lib/domains.ts hostMapping() helper used by middleware:
//   - operator hosts (e.g. app.wesayachicken.com) → Wesaya branding (the «و»
//     gradient tile + «وصاية» wordmark reused from the storefront) and NO City
//     Baker SiteFooter — so a client's own domain never shows MaitreAI/City
//     Baker company branding.
//   - maitre.chat / previews / localhost → MaitreAI logo + wordmark + SiteFooter,
//     UNCHANGED.
// The auth form itself lives in the client <LoginForm/> — logic untouched.
// Reading headers() makes this route per-request dynamic (correct: the brand is
// host-dependent and must never be statically cached across hosts).
// ============================================================================

import type { Metadata } from "next";
import { headers } from "next/headers";
import { hostMapping } from "@/lib/domains";
import { SiteFooter } from "@/components/SiteFooter";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

function isOperatorHost(): boolean {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return hostMapping(host)?.kind === "operator";
}

// Operator hosts get a Wesaya title/description (no "MaitreAI" in the tab title
// either); every other host inherits the root layout's MaitreAI metadata.
export function generateMetadata(): Metadata {
  if (isOperatorHost()) {
    return {
      title: "وصاية — تسجيل الدخول",
      description: "تسجيل دخول فريق العمل لإدارة الطلبات والمطبخ والمحادثات.",
    };
  }
  return {};
}

export default function LoginPage() {
  const isOperator = isOperatorHost();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Wesaya wordmark/letter uses Baloo Bhaijaan 2 — load it only on operator
          hosts so the maitre.chat login is byte-for-byte unchanged. */}
      {isOperator && (
        <link
          href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      )}

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Brand — host-aware. Operator hosts get the Wesaya treatment; every
              other host keeps the MaitreAI logo + wordmark. */}
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            {isOperator ? (
              <>
                <span className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-gradient-to-br from-wesaya-red to-wesaya-red-dark shadow-[0_6px_16px_rgba(214,35,0,0.3)]">
                  <span className="font-baloo text-[26px] font-extrabold leading-none text-white">و</span>
                </span>
                <h1 className="font-baloo text-xl font-extrabold text-wesaya-ink">وصاية</h1>
                <p className="text-sm text-slate-500">
                  تسجيل دخول فريق العمل — إدارة الطلبات، المطبخ، والمحادثات من مكان واحد.
                </p>
              </>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-mark.svg" alt="MaitreAI" width={56} height={56} className="h-14 w-14" />
                <h1 className="text-xl font-bold text-slate-900">MaitreAI</h1>
                <p className="text-sm text-slate-500">
                  مساعد تشغيل ومبيعات للمطاعم — يدير الطلبات، المحادثات، الدفع، والعروض من مكان واحد.
                </p>
              </>
            )}
          </div>

          <LoginForm />

          <p className="mt-4 text-center text-xs text-slate-400">
            بالدخول أنت توافق على الشروط وسياسة الخصوصية
          </p>
        </div>
      </div>

      {/* City Baker legal footer is MaitreAI's company entity — never on a
          client's operator domain. */}
      {!isOperator && <SiteFooter />}
    </div>
  );
}
