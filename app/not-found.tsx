// ============================================================================
// Kivo — branded 404. Replaces Next.js's default English "page not found" with
// a small Kivo-styled RTL page: the wordmark, a friendly Arabic message, and
// links back to the public home and the console. Server component (no data).
// ============================================================================

import Link from "next/link";
import { KivoWordmark } from "@/components/brand/KivoLogo";

export default function NotFound() {
  return (
    <div
      dir="rtl"
      lang="ar"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "32px",
        textAlign: "center",
        fontFamily: "var(--font-arabic), system-ui, sans-serif",
        background: "radial-gradient(120% 90% at 50% 12%,#f5fbf8 0%,#e9f4ee 55%,#ddeee6 100%)",
        color: "#0f2a20",
      }}
    >
      <KivoWordmark size={40} ink="#0e1f18" />

      <div style={{ fontSize: 64, fontWeight: 800, color: "#0a8a5f", marginTop: 22, lineHeight: 1 }}>٤٠٤</div>

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "14px 0 0" }}>الصفحة دي مش موجودة</h1>
      <p style={{ fontSize: 13.5, fontWeight: 600, color: "#5b6b64", margin: "8px 0 0", maxWidth: 420, lineHeight: 1.7 }}>
        يمكن الرابط اتغيّر أو الصفحة اتنقلت. ارجع وكمّل شغلك مع كريم.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 26, flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href="/dashboard"
          style={{
            height: 46,
            padding: "0 22px",
            borderRadius: 13,
            background: "linear-gradient(150deg,#13b07a,#0a6e4c)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            textDecoration: "none",
            boxShadow: "0 16px 30px -16px rgba(10,138,95,.7)",
          }}
        >
          لوحة التحكّم
        </Link>
        <Link
          href="/"
          style={{
            height: 46,
            padding: "0 22px",
            borderRadius: 13,
            background: "#fff",
            border: "1px solid #cfe6d9",
            color: "#0a8a5f",
            fontSize: 14,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            textDecoration: "none",
          }}
        >
          الصفحة الرئيسية
        </Link>
      </div>
    </div>
  );
}
