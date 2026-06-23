// ============================================================================
// Kivo — Login / الدخول (SPEC 01). Centered single card on the login gradient.
//
// Font-scope (SPEC 01 §2): Login renders pre-auth, BEFORE <ConsoleLayout>
// exists, so it can't inherit the Kivo font from a layout wrapper. The shared
// root <body> font is NOT Kivo (it's shared with the storefront). Therefore the
// page root applies `.kv-console` itself → IBM Plex Sans Arabic + RTL base. The
// login background is the richer `--kv-bg-login` (overrides .kv-console's bg).
//
// NOTE (flagged for review): this replaces the previous host-aware (Wesaya vs
// MaitreAI) login branding with the single neutral Kivo identity, per the Kivo
// rebrand mockup. All interactive auth lives in the client <LoginForm/>.
// ============================================================================

import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Kivo — تسجيل الدخول",
  description: "سجّل دخولك إلى Kivo لإدارة طلبات مطعمك ووكيل واتساب «كريم».",
};

export default function LoginPage() {
  return (
    <main
      className="kv-console"
      dir="rtl"
      lang="ar"
      style={{
        minHeight: "100vh",
        padding: "40px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--kv-bg-login)",
      }}
    >
      <LoginForm />
    </main>
  );
}
