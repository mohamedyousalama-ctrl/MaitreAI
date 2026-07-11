// ============================================================================
// Kivo — public landing page (root `/`, public: no login wall). Redesigned to the
// approved A.6 landing brief (docs/product/LANDING_BRIEF.md) in the shipped Kivo
// EMERALD identity: the wedge-first hero, an honest problem strip, how-it-works,
// the "beyond the chatbot" brain, a safety & trust block, honest proof (no fake
// metrics), and a legal footer. Arabic default + English toggle + Egypt/KSA facts
// toggle. This server wrapper keeps `metadata`; the interactive page (toggles) is
// the client <Landing/> island.
// ============================================================================

import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Kivo — خلّي طلباتك ماشية",
  description:
    "كريم بياخد طلباتك على واتساب، يخدم عملاءك، ويوريك ليه العملاء بيشتروا أو مبيشتروش — وبعدين يساعدك تحسّن المبيعات والمنيو والعروض. من غير عمولة وسطاء.",
};

export default function Home() {
  return <Landing />;
}
