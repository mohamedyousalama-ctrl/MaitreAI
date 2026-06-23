"use client";

/**
 * /styleguide — DEV-ONLY token eyeball-check (SPEC 00 §10.5). Not linked in nav.
 * Renders every Kivo token + the 3-state truth pills so the locked emerald
 * system can be matched against "Kivo - Brand & Tokens.dc.html". No backend,
 * no real data — every number here is illustrative of the primitives only.
 */

import {
  CountUp,
  KvComingPanel,
  KvSkeletonBlock,
  StatePill,
  useRiseIn,
} from "@/components/kivo";

const COLORS: { name: string; varName: string; value: string }[] = [
  { name: "primary", varName: "--kv-primary", value: "#0E9F6E" },
  { name: "deep", varName: "--kv-deep", value: "#0A8A5F" },
  { name: "ink", varName: "--kv-ink", value: "#0a3a2a" },
  { name: "mint", varName: "--kv-mint", value: "#34C79C" },
  { name: "primary-tint", varName: "--kv-primary-tint", value: "rgba(14,159,110,.12)" },
  { name: "canvas", varName: "--kv-canvas", value: "#EEF4F1" },
  { name: "canvas-2", varName: "--kv-canvas-2", value: "#E3EDE8" },
  { name: "card", varName: "--kv-card", value: "#FFFFFF" },
  { name: "card-soft", varName: "--kv-card-soft", value: "#F6FAF8" },
  { name: "text", varName: "--kv-text", value: "#0F2A20" },
  { name: "muted", varName: "--kv-muted", value: "#5B6B64" },
  { name: "faint", varName: "--kv-faint", value: "#8A988F" },
  { name: "slate", varName: "--kv-slate", value: "#64748B" },
  { name: "border", varName: "--kv-border", value: "#E7EFEB" },
  { name: "amber", varName: "--kv-amber", value: "#D8972B" },
  { name: "red", varName: "--kv-red", value: "#C0492F" },
  { name: "delivery", varName: "--kv-delivery", value: "#7C5CD0" },
  { name: "ready", varName: "--kv-ready", value: "#2B8FB5" },
];

const GRADIENTS: { name: string; varName: string }[] = [
  { name: "grad-brand", varName: "--kv-grad-brand" },
  { name: "grad-brand-deep", varName: "--kv-grad-brand-deep" },
  { name: "bg-console", varName: "--kv-bg-console" },
  { name: "bg-login", varName: "--kv-bg-login" },
];

const RADII: { name: string; varName: string; px: number }[] = [
  { name: "r-lg", varName: "--kv-r-lg", px: 20 },
  { name: "r-lg-xl", varName: "--kv-r-lg-xl", px: 24 },
  { name: "r-md", varName: "--kv-r-md", px: 14 },
  { name: "r-md-sm", varName: "--kv-r-md-sm", px: 13 },
  { name: "r-md-lg", varName: "--kv-r-md-lg", px: 16 },
  { name: "r-pill", varName: "--kv-r-pill", px: 99 },
];

const SHADOWS: { name: string; varName: string }[] = [
  { name: "shadow-card", varName: "--kv-shadow-card" },
  { name: "shadow-panel", varName: "--kv-shadow-panel" },
  { name: "shadow-login", varName: "--kv-shadow-login" },
  { name: "shadow-btn", varName: "--kv-shadow-btn" },
  { name: "shadow-frame", varName: "--kv-shadow-frame" },
];

const TYPE_SCALE: { role: string; size: number; weight: number }[] = [
  { role: "Hero number", size: 56, weight: 800 },
  { role: "Page title (الطلبات)", size: 24, weight: 800 },
  { role: "Section / card head", size: 16, weight: 800 },
  { role: "Body", size: 14, weight: 600 },
  { role: "Label / caption", size: 11, weight: 800 },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: "var(--kv-text)",
          margin: "0 0 14px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--kv-card)",
        border: "1px solid var(--kv-border)",
        borderRadius: "var(--kv-r-md-lg)",
        boxShadow: "var(--kv-shadow-card)",
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

export default function StyleguidePage() {
  const rise0 = useRiseIn(0);
  const rise1 = useRiseIn(1);
  const rise2 = useRiseIn(2);

  return (
    <main
      className="kv-console kv-scroll"
      dir="rtl"
      lang="ar"
      style={{ minHeight: "100vh", padding: "34px 24px 60px" }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--kv-text)" }}>
            Kivo — Styleguide (dev)
          </h1>
          <p style={{ color: "var(--kv-muted)", fontSize: 14, marginTop: 6 }}>
            SPEC 00 token check. طابِق ده مع «Kivo - Brand &amp; Tokens». لا lime في أي مكان.
          </p>
        </header>

        <Section title="§2 — Colors">
          <Card>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))",
                gap: 14,
              }}
            >
              {COLORS.map((c) => (
                <div key={c.name}>
                  <div
                    style={{
                      height: 56,
                      borderRadius: "var(--kv-r-md-sm)",
                      background: `var(${c.varName})`,
                      border: "1px solid var(--kv-border)",
                    }}
                  />
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8, color: "var(--kv-text)" }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--kv-faint)", fontFamily: "var(--kv-font-mono)" }}>
                    {c.value}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <Section title="§3 — Gradients">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
            {GRADIENTS.map((g) => (
              <div key={g.name}>
                <div
                  style={{
                    height: 96,
                    borderRadius: "var(--kv-r-md-lg)",
                    background: `var(${g.varName})`,
                    border: "1px solid var(--kv-border)",
                  }}
                />
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>{g.name}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="§4 — Radius">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            {RADII.map((r) => (
              <div key={r.name} style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 84,
                    height: 84,
                    background: "var(--kv-primary-tint)",
                    border: "1px solid var(--kv-border)",
                    borderRadius: `var(${r.varName})`,
                  }}
                />
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "var(--kv-faint)" }}>{r.px}px</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="§5 — Shadow">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 28, background: "var(--kv-canvas)", padding: 28, borderRadius: 16 }}>
            {SHADOWS.map((s) => (
              <div key={s.name} style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 120,
                    height: 80,
                    background: "var(--kv-card)",
                    borderRadius: "var(--kv-r-md-lg)",
                    boxShadow: `var(${s.varName})`,
                  }}
                />
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 12 }}>{s.name}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="§6 — Type scale">
          <Card>
            {TYPE_SCALE.map((t) => (
              <div
                key={t.role}
                style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "8px 0", borderBottom: "1px solid var(--kv-border)" }}
              >
                <span style={{ width: 180, fontSize: 12, color: "var(--kv-faint)", fontWeight: 700 }}>
                  {t.role} · {t.size}/{t.weight}
                </span>
                <span style={{ fontSize: t.size, fontWeight: t.weight, color: "var(--kv-text)" }}>
                  الطلبات ١٢٣
                </span>
              </div>
            ))}
          </Card>
        </Section>

        <Section title="§7 — Motion (count-up · rise-in · pulse)">
          <Card>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 700, marginBottom: 4 }}>
                  CountUp
                </div>
                <div style={{ fontSize: 56, fontWeight: 800, color: "var(--kv-primary)", letterSpacing: "-.5px" }}>
                  <CountUp value={1284} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                {[rise0, rise1, rise2].map((r, i) => (
                  <div
                    key={i}
                    style={{
                      ...r.style,
                      width: 64,
                      height: 64,
                      borderRadius: "var(--kv-r-md)",
                      background: "var(--kv-card-soft)",
                      border: "1px solid var(--kv-border)",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 800,
                      color: "var(--kv-deep)",
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 24 }}>
                <div style={{ textAlign: "center" }}>
                  <span
                    className="kv-pulse"
                    style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: "var(--kv-primary)" }}
                  />
                  <div style={{ fontSize: 11, color: "var(--kv-faint)", marginTop: 8 }}>kv-pulse</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span
                    className="kv-urgent"
                    style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: "var(--kv-red)" }}
                  />
                  <div style={{ fontSize: 11, color: "var(--kv-faint)", marginTop: 8 }}>kv-urgent</div>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        <Section title="§8 — The 3-state truth primitive">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
            <Card>
              <StatePill state="live" />
              <p style={{ fontSize: 13, color: "var(--kv-muted)", marginTop: 14 }}>
                بيانات حقيقية شغّالة. الرقم بيتحرك:
              </p>
              <div style={{ fontSize: 30, fontWeight: 800, color: "var(--kv-primary)" }}>
                <CountUp value={342} />
              </div>
            </Card>

            <Card>
              <StatePill state="gathering" />
              <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: "14px 0 10px" }}>
                الباك جاهز بس لسه مفيش داتا — skeleton، من غير أرقام:
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                <KvSkeletonBlock style={{ width: "80%" }} />
                <KvSkeletonBlock style={{ width: "55%" }} />
              </div>
            </Card>

            <Card>
              <StatePill state="coming" />
              <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: "14px 0 10px" }}>
                الميزة لسه مش متبنية:
              </p>
              <KvComingPanel>
                <div style={{ textAlign: "center", color: "#6b7a88", fontWeight: 700, fontSize: 13 }}>
                  قريباً
                </div>
              </KvComingPanel>
            </Card>
          </div>
        </Section>
      </div>
    </main>
  );
}
