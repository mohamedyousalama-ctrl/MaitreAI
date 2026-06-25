import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Readex Pro — Kivo primary brand typeface (variable font, loaded from repo).
// Using next/font/local avoids a network dependency on fonts.googleapis.com
// that breaks offline/CI builds. The TTF is committed at public/fonts/.
const readex = localFont({
  src: "../public/fonts/ReadexPro.ttf",
  variable: "--font-readex",
  display: "swap",
});

// Noto Sans Arabic — secondary/fallback Arabic face (loaded from repo).
const arabic = localFont({
  src: "../public/fonts/NotoSansArabic-Regular.ttf",
  variable: "--font-arabic",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kivo — مساعد تشغيل ومبيعات للمطاعم",
  description:
    "Kivo — مساعد تشغيل ومبيعات للمطاعم. يبدأ من واتساب، ويُدير تجربة الطلب كاملة: من المحادثة إلى المطبخ، الدفع، التتبّع، والعروض.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/logo-mark.svg" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${readex.variable} ${arabic.variable}`}>
      <body
        className="font-sans"
        style={{ fontFamily: "var(--font-readex), var(--font-arabic), system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
