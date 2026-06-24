import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Readex_Pro } from "next/font/google";
import "./globals.css";

// Readex Pro is the Amendment 04 (§M1) brand type; IBM Plex Arabic is the
// secondary/fallback face.
const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-readex",
  display: "swap",
});

// IBM Plex Sans Arabic is the single Kivo console family (SPEC 00 §1). NOTE:
// this family's heaviest Google-Fonts weight is 700 — there is no Arabic 800,
// so `font-weight:800` in the tokens resolves to 700 (as the mockups already
// rendered). Weight 300 is retained for pre-Kivo pages that use it.
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-arabic",
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
