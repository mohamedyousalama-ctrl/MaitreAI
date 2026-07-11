"use client";

// ============================================================================
// getkivo.io landing — the hero's animated WhatsApp demo (Arabic, always). This is
// a PRODUCT ARTIFACT: a self-playing conversation with Karim showing an order, an
// honest "delivery not available" decline, and a safety hand-off on a hinted
// allergy — the pitch in one glance. Pure CSS (transforms + opacity; classNames
// resolve to the keyframes in Landing's scoped stylesheet). prefers-reduced-motion
// freezes it to a static, fully-visible frame. The conversation stays Arabic
// regardless of the page language — it depicts the real product.
// ============================================================================

import { KivoMark, KivoWordmark } from "@/components/brand/KivoLogo";

export function HeroDemo() {
  return (
    <div className="kvFloat" style={{ width: 312, maxWidth: "100%", borderRadius: 40, background: "#0b1f18", padding: 11, boxShadow: "0 50px 100px -40px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.08)" }}>
      <div style={{ borderRadius: 31, overflow: "hidden", background: "#f6faf8" }} dir="rtl">
        <div style={{ background: "#0a8a5f", padding: "13px 14px", display: "flex", alignItems: "center", gap: 11, color: "#fff" }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center", flex: "none" }}>
            <KivoMark size={20} tone="white" sheen={false} title="" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>كريم · حلواني الدار</div>
            <div style={{ fontSize: 10, opacity: 0.9, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7ef0c4" }} />متّصل</div>
          </div>
        </div>

        <div style={{ position: "relative", height: 430, overflow: "hidden", background: "linear-gradient(180deg,#f1f6f3,#e8efea)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 9%, #000 90%, transparent 100%)", maskImage: "linear-gradient(to bottom, transparent 0, #000 9%, #000 90%, transparent 100%)" }}>
          <div className="kvChat" style={{ position: "absolute", inset: 0 }}>
            <div className="kvTrack" style={{ position: "absolute", insetInlineStart: 0, insetInlineEnd: 0, top: 0, padding: "16px 13px 22px", display: "flex", flexDirection: "column", "--kv-pan": "-470px" } as React.CSSProperties}>
              <DStamp>النهارده ٨:٠٤ م</DStamp>
              <DOut>السلام عليكم</DOut>
              <DIn name>وعليكم السلام ومرحباً! 😊 معاك كريم من حلواني الدار. تحب تطلب إيه النهارده؟</DIn>
              <DOut>عايز اتنين كيكة شوكولاتة وعصير برتقان</DOut>
              <DIn>تمام! اتنين كيكة الشوكولاتة الغنية وعصير برتقان طازة 🍫🍊</DIn>
              <DRecap />
              <DIn>ده طلبك لحد دلوقتي — تحب نكمّل؟</DIn>
              <DOut>توصلوا لـ مدينة النصر؟</DOut>
              <DIn>للأسف التوصيل لسه مش متاح لمدينة النصر دلوقتي 🙏 بس تقدر تستلم من الفرع، أو نشوفلك أقرب منطقة نوصّلها.</DIn>
              <DChip>التوصيل غير متاح لمدينة النصر</DChip>
              <DOut>تمام هستلم. بس أنا بتعب لو اكلت بندق</DOut>
              <DIn>حفاظاً على سلامتك، هوصّلك بزميل من الفريق يساعدك تختار الأصناف الآمنة ليك 🙏</DIn>
              <DChip solid>بنوصّلك بزميل من الفريق</DChip>
            </div>
            <div style={{ position: "absolute", insetInlineEnd: 14, bottom: 14 }}>
              <div className="kvType" style={{ display: "flex", alignItems: "center", gap: 5, padding: "11px 14px", borderRadius: "7px 18px 18px 18px", background: "#fff", border: "1px solid #ebf2ee", boxShadow: "0 2px 7px rgba(13,42,32,.05)" }}>
                <i /><i /><i />
              </div>
            </div>
          </div>
          <div className="kvLogoFrame" style={{ position: "absolute", left: "50%", top: "50%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, pointerEvents: "none" }}>
            <KivoWordmark size={46} ink="#0e1f18" />
            <span style={{ fontFamily: "'Sora', var(--font-arabic), system-ui, sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: ".04em", color: "#0a8a5f" }}>Keep Every Order Moving</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "#fff", borderTop: "1px solid #eef3f0" }}>
          <div style={{ flex: 1, height: 36, borderRadius: 18, background: "#f1f5f3", display: "flex", alignItems: "center", padding: "0 15px" }}><span style={{ fontSize: 12.5, color: "#9bafa5" }}>اكتب رسالة…</span></div>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(150deg,#13b07a,#0a8a5f)", display: "grid", placeItems: "center", flex: "none" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 13 21 3M21 3l-6.5 18-3.5-8-8-3.5L21 3z" /></svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function DStamp({ children }: { children: React.ReactNode }) {
  return <div style={{ alignSelf: "center", fontSize: 9.5, fontWeight: 700, color: "#7a8378", background: "rgba(255,255,255,.7)", padding: "3px 10px", borderRadius: 8, marginBottom: 13 }}>{children}</div>;
}
function DOut({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 13 }}>
      <div style={{ maxWidth: "80%", padding: "9px 13px", borderRadius: "18px 7px 18px 18px", background: "#dcf1e7", color: "#0a3a29", fontSize: 13.5, lineHeight: 1.55, textAlign: "right" }}>{children}</div>
    </div>
  );
}
function DIn({ children, name }: { children: React.ReactNode; name?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginBottom: 13 }}>
      {name && <span style={{ fontSize: 10, color: "#0a8a5f", fontWeight: 700, margin: "0 6px 4px 0" }}>كريم</span>}
      <div style={{ maxWidth: "84%", padding: "9px 13px", borderRadius: "7px 18px 18px 18px", background: "#fff", color: "#10231b", fontSize: 13.5, lineHeight: 1.6, border: "1px solid #ebf2ee", boxShadow: "0 2px 7px rgba(13,42,32,.05)", textAlign: "right" }}>{children}</div>
    </div>
  );
}
function DChip({ children, solid }: { children: React.ReactNode; solid?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 13px", borderRadius: 11, background: solid ? "#e4f4ec" : "#eef4f1", border: solid ? "1px solid #cfe6d9" : "1px dashed #bcdccd" }}>
        {solid ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a8a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b8a76" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
        )}
        <span style={{ fontSize: 12, color: solid ? "#0a8a5f" : "#5b7568", fontWeight: solid ? 700 : 600 }}>{children}</span>
      </div>
    </div>
  );
}
function DRecap() {
  const row = (label: string, qty: string, price: string, top?: boolean) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: top ? "1px solid #f1f5f3" : undefined }}>
      <span style={{ fontSize: 12.5, color: "#2c4339" }}>{label} <span style={{ color: "#7c9088" }}>{qty}</span></span>
      <span style={{ fontSize: 12.5, color: "#10231b", fontWeight: 600 }}>{price}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 13 }}>
      <div style={{ width: "86%", background: "#fff", border: "1px solid #e4efe9", borderRadius: 16, boxShadow: "0 8px 22px rgba(13,42,32,.07)", overflow: "hidden" }}>
        <div style={{ padding: "11px 15px", borderBottom: "1px solid #eef3f0", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 2, background: "#0e9f6e" }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#10231b" }}>طلبك</span>
        </div>
        <div style={{ padding: "4px 15px 11px" }}>
          {row("كيكة الشوكولاتة الغنية", "×٢", "١٧٠ ج.م")}
          {row("عصير برتقان طازة", "×١", "٤٠ ج.م", true)}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 2px", borderTop: "1px solid #e4efe9", marginTop: 2 }}>
            <span style={{ fontSize: 13, color: "#0a8a5f", fontWeight: 800 }}>الإجمالي</span>
            <span style={{ fontSize: 14, color: "#0a8a5f", fontWeight: 800 }}>٢١٠ ج.م</span>
          </div>
        </div>
      </div>
    </div>
  );
}
