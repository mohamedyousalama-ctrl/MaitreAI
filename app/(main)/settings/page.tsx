"use client";

// ============================================================================
// MaitreAI — الإعدادات (Settings) — Terracotta redesign.
// REUSES the existing DB-backed config: useRestaurantStore.profile / updateProfile
// and .aiTone / updateAiTone (persist), the real branches list, and the existing
// WhatsAppCredentialsCard + TaxSettingsCard (write-only / persisting). HONEST
// STATUS: WhatsApp «متصل/مباشر» derives ONLY from the real /api/channels/whatsapp/
// status signal; the AI-engine badge from /api/settings/ops; payment shows
// not-connected «قريبًا» (no real gateway). No secrets/tokens are shown.
// ============================================================================

import { useEffect, useState } from "react";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { WhatsAppCredentialsCard } from "@/components/settings/WhatsAppCredentialsCard";
import { TaxSettingsCard } from "@/components/settings/TaxSettingsCard";
import { PaymentConfigCard } from "@/components/settings/PaymentConfigCard";
import { SignOutButton } from "@/components/layout/SignOutButton";
import type { AiEmojiUsage, AiLanguage, AiPersonality } from "@/lib/types";
import { Store, Sparkles, Wifi, CreditCard, MapPin, MessageCircle, ChevronLeft } from "lucide-react";

type WaStatus = { configured: boolean; mode: string } | null;
type Ops = { isOpen: boolean; assistantOn: boolean } | null;

const PERSONA: { v: AiPersonality; label: string }[] = [
  { v: "friendly", label: "ودود ومرحّب" }, { v: "formal", label: "رسمي ومحترف" }, { v: "fastfood", label: "سريع ومختصر" }, { v: "premium", label: "راقٍ" }, { v: "luxury", label: "فاخر" },
];
const LANGS: { v: AiLanguage; label: string }[] = [{ v: "ar", label: "العربية" }, { v: "en", label: "الإنجليزية" }, { v: "bilingual", label: "ثنائي اللغة" }];
const EMOJI: { v: AiEmojiUsage; label: string }[] = [{ v: "none", label: "بدون" }, { v: "minimal", label: "قليل" }, { v: "normal", label: "عادي" }];

const SECTIONS = [
  { k: "profile", label: "ملف المطعم", Icon: Store },
  { k: "tone", label: "نبرة المساعد", Icon: Sparkles },
  { k: "channels", label: "القنوات والاتصال", Icon: Wifi },
  { k: "payment", label: "الدفع والفواتير", Icon: CreditCard },
  { k: "branches", label: "الفروع", Icon: MapPin },
] as const;

export default function SettingsPage() {
  const hydrated = useHasHydrated();
  const profile = useRestaurantStore((s) => s.profile);
  const updateProfile = useRestaurantStore((s) => s.updateProfile);
  const aiTone = useRestaurantStore((s) => s.aiTone);
  const updateAiTone = useRestaurantStore((s) => s.updateAiTone);
  const branches = useRestaurantStore((s) => s.branches);

  const [section, setSection] = useState<(typeof SECTIONS)[number]["k"]>("profile");
  const [wa, setWa] = useState<WaStatus>(null);
  const [ops, setOps] = useState<Ops>(null);

  useEffect(() => {
    fetch("/api/channels/whatsapp/status").then((r) => (r.ok ? r.json() : null)).then((d) => setWa(d ? { configured: !!d.configured, mode: d.mode } : null)).catch(() => setWa(null));
    fetch("/api/settings/ops").then((r) => (r.ok ? r.json() : null)).then((d) => setOps(d ? { isOpen: d.isOpen !== false, assistantOn: d.assistantOn !== false } : null)).catch(() => setOps(null));
  }, []);

  if (!hydrated) return <div className="h-[calc(100vh-8rem)] animate-pulse rounded-2xl border border-[#ECE3D5] bg-white/60" />;

  // honest connection state
  const waConnected = wa?.configured === true;
  const waBadge = wa == null ? { label: "…", bg: "#F7F2EA", fg: "#9A8E7E", dot: "#C9BFAE" }
    : waConnected ? { label: "متصل", bg: "#EAF1E9", fg: "#436B50", dot: "#5C8A6B" }
    : { label: "غير مُهيأ", bg: "#FBF1DD", fg: "#946312", dot: "#C5871F" };
  const engineBadge = ops == null ? { label: "…", bg: "#F7F2EA", fg: "#9A8E7E", dot: "#C9BFAE" }
    : !ops.assistantOn ? { label: "متوقف", bg: "#F4EEE9", fg: "#9A8E7E", dot: "#C9BFAE" }
    : waConnected ? { label: "مباشر", bg: "#EAF1E9", fg: "#436B50", dot: "#5C8A6B" }
    : { label: "وضع تجريبي", bg: "#FBF1DD", fg: "#946312", dot: "#C5871F" };

  return (
    <div dir="rtl" className="flex gap-4">
      {/* section nav */}
      <aside className="hidden w-[224px] flex-none rounded-2xl border border-[#ECE3D5] bg-white p-3.5 lg:block" style={{ alignSelf: "flex-start" }}>
        <div className="mb-3 px-1 text-[17px] font-bold text-[#2A2019]">الإعدادات</div>
        <div className="flex flex-col gap-1">
          {SECTIONS.map(({ k, label, Icon }) => (
            <button key={k} onClick={() => setSection(k)} className="flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-right transition"
              style={section === k ? { background: "#FBF1ED", color: "#BE5238" } : { color: "#6B6055" }}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} /><span className="text-[13.5px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 border-t border-[#F2EBE0] pt-3"><SignOutButton /></div>
      </aside>

      {/* mobile section chips */}
      <div className="mb-1 flex w-full gap-2 overflow-x-auto lg:hidden">
        {SECTIONS.map(({ k, label }) => (
          <button key={k} onClick={() => setSection(k)} className="whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition"
            style={section === k ? { background: "#BE5238", color: "#fff" } : { background: "#fff", border: "1px solid #EBE2D3", color: "#514538" }}>{label}</button>
        ))}
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        {/* ===== ملف المطعم ===== */}
        {section === "profile" && (
          <Card title="ملف المطعم" subtitle="البيانات الأساسية اللي يعرفها المساعد ويقدّمها للعملاء.">
            <div className="mb-4 flex items-center gap-4 border-b border-[#F2EBE0] pb-4">
              <span className="flex h-16 w-16 flex-none items-center justify-center rounded-[16px] text-[26px] font-bold text-white" style={{ background: "linear-gradient(150deg,#C25A3E,#8A3621)" }}>{profile.name.trim().charAt(0) || "م"}</span>
              <div className="text-[12px] text-[#9A8E7E]">الشعار يُدار من رابط الشعار أدناه · PNG/SVG</div>
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field label="اسم المطعم" value={profile.name} onSave={(v) => updateProfile({ name: v })} />
              <Field label="العملة" value={profile.currency} onSave={(v) => updateProfile({ currency: v })} />
              <Field label="رقم التواصل" value={profile.phone} onSave={(v) => updateProfile({ phone: v })} ltr />
              <Field label="البريد الإلكتروني" value={profile.email} onSave={(v) => updateProfile({ email: v })} ltr />
              <Field label="رابط الشعار" value={profile.logoUrl} onSave={(v) => updateProfile({ logoUrl: v })} ltr placeholder="https://…" />
              <Field label="نوع النشاط" value={profile.businessType} onSave={(v) => updateProfile({ businessType: v })} />
              <Field label="المنطقة الزمنية" value={profile.timezone} onSave={(v) => updateProfile({ timezone: v })} />
              <div className="rounded-[11px] border border-[#EBE2D3] bg-[#F7F2EA] px-3.5 py-3">
                <div className="mb-1 text-[12px] font-semibold text-[#514538]">مواعيد العمل</div>
                <div className="text-[12.5px] text-[#A99D8D]">تُدار من الفروع <span className="text-[#C5871F]">· قريبًا في هذه الصفحة</span></div>
              </div>
            </div>
          </Card>
        )}

        {/* ===== نبرة المساعد ===== */}
        {section === "tone" && (
          <Card title="نبرة المساعد" subtitle="كيف يكلّم المساعد عملاءك على واتساب." icon={<Sparkles className="h-4 w-4 text-white" />} iconGrad>
            <div className="flex flex-col gap-5">
              <div>
                <Label>الشخصية</Label>
                <div className="flex flex-wrap gap-2">{PERSONA.map((p) => <Chip key={p.v} active={aiTone.personality === p.v} onClick={() => updateAiTone({ personality: p.v })}>{p.label}</Chip>)}</div>
              </div>
              <div>
                <Label>اللغة</Label>
                <div className="flex flex-wrap gap-2">{LANGS.map((l) => <Chip key={l.v} active={aiTone.language === l.v} onClick={() => updateAiTone({ language: l.v })}>{l.label}</Chip>)}</div>
                <p className="mt-2 text-[11px] text-[#A99D8D]">اللهجة (مصري/سعودي) تُضبط مع إعداد المساعد <span className="text-[#C5871F]">· قريبًا هنا</span>.</p>
              </div>
              <div>
                <Label>استخدام الإيموجي</Label>
                <div className="flex flex-wrap gap-2">{EMOJI.map((e) => <Chip key={e.v} active={aiTone.emojiUsage === e.v} onClick={() => updateAiTone({ emojiUsage: e.v })}>{e.label}</Chip>)}</div>
              </div>
              <div>
                <Label>رسالة الترحيب</Label>
                <textarea defaultValue={aiTone.greeting} onBlur={(e) => updateAiTone({ greeting: e.target.value })} rows={2}
                  className="w-full rounded-[11px] border border-[#EBE2D3] bg-[#F7F2EA] px-3.5 py-3 text-[13px] text-[#2A2019] outline-none focus:border-[#BE5238]" placeholder="أهلاً بيك 🌟 تحب تطلب إيه النهارده؟" />
              </div>
            </div>
          </Card>
        )}

        {/* ===== القنوات والاتصال (HONEST status) ===== */}
        {section === "channels" && (
          <>
            <Card title="القنوات والاتصال" subtitle="الحالة بتظهر بصدق — بتتأكد من الاتصال الفعلي.">
              <div className="flex flex-col gap-2.5">
                <StatusRow iconBg="#25D366" icon={<MessageCircle className="h-5 w-5 text-white" />} title="واتساب للأعمال" sub={waConnected ? "متصل عبر WhatsApp Cloud API" : "لم تُضبط بيانات الاعتماد بعد"} badge={waBadge} />
                <StatusRow iconBg="#FBF1ED" icon={<Sparkles className="h-5 w-5 text-[#C5871F]" />} title="محرك المساعد الذكي" sub="يرد ويرشّح خطوات تلقائياً" badge={engineBadge} />
              </div>
            </Card>
            {/* real bring-your-own-number config (write-only, no secrets shown) */}
            <WhatsAppCredentialsCard />
          </>
        )}

        {/* ===== الدفع والفواتير ===== */}
        {section === "payment" && (
          <>
            <Card title="الدفع والفواتير" subtitle="بوابة الدفع والضريبة. الحالة تعكس الاتصال الفعلي.">
              <StatusRow iconBg="#E7EAF2" icon={<CreditCard className="h-5 w-5 text-[#5E6FA0]" />} title="بوابة الدفع" sub="روابط دفع · مدى · آبل باي · بطاقة"
                badge={{ label: "غير متصلة · قريبًا", bg: "#F4EEE9", fg: "#9A8E7E", dot: "#C9BFAE" }} />
              <p className="mt-3 text-[11.5px] text-[#A99D8D]">لا توجد بوابة دفع مُفعّلة بعد — يظهر هنا الاتصال الحقيقي عند ربطها.</p>
            </Card>
            {/* real manual-wallet payment config (persists) */}
            <PaymentConfigCard />
            {/* real tax config (persists) */}
            <TaxSettingsCard />
          </>
        )}

        {/* ===== الفروع ===== */}
        {section === "branches" && (
          <Card title="الفروع" subtitle="فروع مطعمك ومناطق توصيلها.">
            {branches.length === 0 ? (
              <div className="rounded-[11px] border border-[#EFE7DA] bg-[#F7F2EA] p-4 text-center text-[12.5px] text-[#A99D8D]">لا فروع بعد.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {branches.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-[12px] border border-[#EBE2D3] bg-[#F7F2EA] p-3">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[#E7EAF2] text-[#5E6FA0]"><MapPin className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-bold text-[#2A2019]">{b.name}</div><div className="truncate text-[11.5px] text-[#9A8E7E]" dir="ltr">{b.phone || "—"}</div></div>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={b.open ? { background: "#EAF1E9", color: "#436B50" } : { background: "#F4EEE9", color: "#9A8E7E" }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: b.open ? "#5C8A6B" : "#C9BFAE" }} />{b.open ? "مفتوح" : "مغلق"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <a href="/branches" className="mt-3 flex items-center justify-center gap-1.5 rounded-[11px] border border-[#EBE2D3] bg-white py-2.5 text-[12.5px] font-semibold text-[#BE5238] hover:border-[#E0C4B6]">
              إدارة الفروع ومناطق التوصيل <ChevronLeft className="h-4 w-4" />
            </a>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---- pieces ----------------------------------------------------------------
function Card({ title, subtitle, icon, iconGrad, children }: { title: string; subtitle?: string; icon?: React.ReactNode; iconGrad?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[#ECE3D5] bg-white p-5">
      <div className="mb-1 flex items-center gap-2.5">
        {icon && <span className="flex h-7 w-7 items-center justify-center rounded-[8px]" style={iconGrad ? { background: "linear-gradient(150deg,#C25A3E,#8A3621)" } : {}}>{icon}</span>}
        <span className="text-[16px] font-bold text-[#2A2019]">{title}</span>
      </div>
      {subtitle && <p className="mb-4 text-[12.5px] text-[#9A8E7E]">{subtitle}</p>}
      {children}
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-[12px] font-semibold text-[#514538]">{children}</label>;
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="rounded-[10px] px-4 py-2 text-[12.5px] font-semibold transition" style={active ? { background: "#BE5238", color: "#fff" } : { background: "#fff", border: "1px solid #EBE2D3", color: "#514538" }}>{children}</button>;
}
function Field({ label, value, onSave, ltr, placeholder }: { label: string; value: string; onSave: (v: string) => void; ltr?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-semibold text-[#514538]">{label}</span>
      <input defaultValue={value} placeholder={placeholder} dir={ltr ? "ltr" : undefined} onBlur={(e) => { if (e.target.value !== value) onSave(e.target.value); }}
        className="w-full rounded-[11px] border border-[#EBE2D3] bg-[#F7F2EA] px-3.5 py-3 text-[13.5px] text-[#2A2019] outline-none focus:border-[#BE5238]" />
    </label>
  );
}
function StatusRow({ iconBg, icon, title, sub, badge }: { iconBg: string; icon: React.ReactNode; title: string; sub: string; badge: { label: string; bg: string; fg: string; dot: string } }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[13px] border border-[#EBE2D3] bg-[#F7F2EA] p-3.5">
      <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px]" style={{ background: iconBg }}>{icon}</span>
      <div className="min-w-0 flex-1"><div className="text-[13.5px] font-bold text-[#2A2019]">{title}</div><div className="truncate text-[11.5px] text-[#9A8E7E]">{sub}</div></div>
      <span className="inline-flex flex-none items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold" style={{ background: badge.bg, color: badge.fg }}>
        <span className="h-[7px] w-[7px] rounded-full" style={{ background: badge.dot }} />{badge.label}
      </span>
    </div>
  );
}
