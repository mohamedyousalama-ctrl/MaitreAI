"use client";

// ============================================================================
// console_v2 item 9 — Knowledge. "What Karim knows — and is allowed to say."
// Four rooms, governed by the THREE-TIER EDITING LAW:
//
//  • INSTANT — writes immediately via an audited route. The 86/availability toggle
//    (POST /api/menu/availability, logged) and tonight-notes (POST
//    /api/settings/tonight-notes, manager-only, auto-expire at close). Wired real.
//  • GATED — a price/description/zone/policy/standing-rule edit is a PROPOSAL for the
//    signing folder, NEVER a direct write ("a wrong price in Karim's mouth is a live
//    incident"). The signing-folder backend is the Approvals page (item 10), not built
//    yet — so every GATED control is rendered as a labelled SOON that NAMES the flow it
//    becomes («يُرسل إلى مجلد التوقيع — قريبًا»), never a dead button and never a
//    fabricated/direct write.
//  • LOCKED — the safety (allergen) vocabulary renders view-only with NO edit path at
//    all: the console is simply not a surface that can change what the deterministic
//    gate reads. request-change + the 211-case test log have no backend → SOON.
//
// Every read is real (menu items, zones, hours, standing-instructions). Standing rules
// are flag-gated OFF for most tenants → honest GATHERING, never invented. RED is used
// ONLY on the Safety room (it is the one safety surface); all other room accents are
// identity hues. XSS: dictionary/text nodes + <Bdi> only.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Truck, Moon, ShieldAlert, Lock, Search, Pencil, Clock } from "lucide-react";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { TruthChip } from "@/components/console-v2";
import { useT } from "@/lib/i18n/lang";
import { Bdi, Num } from "@/components/kivo";
import type { DictKey } from "@/lib/i18n/dictionary";
import type { MenuItem, DeliveryArea } from "@/lib/types";
import { ALLERGENS, mapAllergenValue, canonicalToArLabel } from "@/lib/ai/allergen-vocab";

// Identity accents — red is reserved for Safety (the one safety surface).
const ACCENT = { menu: "#c58b1f", zones: "#3f7fe0", staff: "#6b7688", safety: "#ff6b5e" } as const;

interface TonightNote { id: string; body: string; expires_at: string }
interface StandingRow { id: string; version: number; body: string; active: boolean; approved_by: string | null; retired_at: string | null }
interface ProposeTarget { title: string; rows: { label: string; value: React.ReactNode }[] }

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { credentials: "include" }); return r.ok ? ((await r.json()) as T) : null; }
  catch { return null; }
}

// An item/zone allergen value → its Arabic label from the LOCKED 9-vocabulary.
function allergenLabel(raw: string): string {
  const key = mapAllergenValue(raw);
  return (key && canonicalToArLabel(key)) || raw;
}

export default function KnowledgePage() {
  const t = useT();
  const hydrated = useHasHydrated();
  const menuItems = useRestaurantStore((s) => s.menuItems);
  const zones = useRestaurantStore((s) => s.deliveryAreas);
  const currency = useRestaurantStore((s) => s.profile.currency);

  const [hours, setHours] = useState<Record<string, { open?: string; close?: string; closed?: boolean }> | null>(null);
  const [standing, setStanding] = useState<StandingRow[] | null>(null);
  const [propose, setPropose] = useState<ProposeTarget | null>(null);

  useEffect(() => {
    void getJson<{ hours?: Record<string, { open?: string; close?: string; closed?: boolean }> }>("/api/settings/hours").then((d) => setHours(d?.hours ?? {}));
    void getJson<{ instructions?: StandingRow[] }>("/api/settings/standing-instructions").then((d) => setStanding(d?.instructions ?? []));
  }, []);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header — honest freshness: real counts + the true "gate locked" fact. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: "0 0 6px" }}>{t("kn.title")}</h1>
          <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: 0, lineHeight: 1.7 }}>{t("kn.sub")}</p>
        </div>
        {hydrated && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 700, color: "var(--kv-muted)", background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-pill)", padding: "6px 12px", whiteSpace: "nowrap" }}>
            <Num>{menuItems.length}</Num> {t("kn.items")} · <Num>{zones.length}</Num> {t("kn.zonesUnit")} · <span style={{ color: "#0A8A5F" }}>{t("kn.gateLocked")}</span>
          </span>
        )}
      </div>

      {/* Editing-law doctrine (copy, not data). */}
      <div style={{ border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)", background: "var(--kv-card-soft)", padding: "12px 16px", fontSize: 12.5, color: "var(--kv-muted)", lineHeight: 1.8 }}>
        {t("kn.law")}
      </div>

      <MenuRoom items={menuItems} hydrated={hydrated} currency={currency} onPropose={setPropose} />
      <DeliveryRoom zones={zones} hydrated={hydrated} currency={currency} hours={hours} onPropose={setPropose} />
      <StaffRoom standing={standing} onPropose={setPropose} />
      <SafetyRoom />

      {propose && <ProposeSoonModal target={propose} onClose={() => setPropose(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Room shell
// ---------------------------------------------------------------------------
function Room({ icon, accent, title, sub, right, children }: { icon: React.ReactNode; accent: string; title: string; sub: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderTop: `3px solid ${accent}`, borderRadius: "var(--kv-r-lg)", boxShadow: "var(--kv-shadow-card)", padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
        <span style={{ color: accent, display: "inline-flex", marginTop: 1 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--kv-text)", margin: 0 }}>{title}</h2>
          <p style={{ fontSize: 11.5, color: "var(--kv-faint)", margin: "3px 0 0", lineHeight: 1.6 }}>{sub}</p>
        </div>
        {right && <div style={{ flex: "0 0 auto" }}>{right}</div>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Menu Truth — INSTANT 86 toggle (real) + GATED propose (SOON).
// ---------------------------------------------------------------------------
function MenuRoom({ items, hydrated, currency, onPropose }: { items: MenuItem[]; hydrated: boolean; currency: string; onPropose: (t: ProposeTarget) => void }) {
  const t = useT();
  const setItemAvailability = useRestaurantStore((s) => s.setItemAvailability);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const cats = useMemo(() => {
    const seen: string[] = [];
    for (const m of items) if (m.category && !seen.includes(m.category)) seen.push(m.category);
    return seen;
  }, [items]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((m) => (cat === "all" || m.category === cat) && (!needle || m.name.toLowerCase().includes(needle)));
  }, [items, q, cat]);

  async function flip(m: MenuItem) {
    if (busy.has(m.id)) return;
    setBusy((s) => new Set(s).add(m.id)); setErr(null);
    const ok = await setItemAvailability(m.id, !m.available); // optimistic + audited POST + reconcile
    if (!ok) setErr(t("kn.menu.86error"));
    setBusy((s) => { const n = new Set(s); n.delete(m.id); return n; });
  }

  function proposeEdit(m: MenuItem) {
    onPropose({
      title: m.name,
      rows: [
        { label: t("kn.edit.price"), value: <span><Num>{m.price.toLocaleString("en-US")}</Num> {currency}</span> },
        { label: t("kn.edit.desc"), value: m.description?.trim() ? <Bdi>{m.description}</Bdi> : <span style={{ color: "var(--kv-faint)" }}>{t("kn.edit.descNone")}</span> },
        { label: t("kn.edit.allergens"), value: m.allergens?.length ? <span>{m.allergens.map(allergenLabel).join(" · ")}</span> : <span style={{ color: "var(--kv-faint)" }}>—</span> },
      ],
    });
  }

  return (
    <Room icon={<BookOpen size={17} />} accent={ACCENT.menu} title={t("kn.menu.title")} sub={t("kn.menu.sub")}
      right={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-sm)", padding: "6px 10px", width: 190, maxWidth: "40vw" }}>
          <Search size={13} color="var(--kv-faint)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("kn.menu.search")} style={{ border: 0, background: "transparent", outline: "none", color: "var(--kv-text)", fontFamily: "var(--kv-font)", fontSize: 12, width: "100%" }} />
        </span>
      }
    >
      {/* category chips */}
      {cats.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <CatChip active={cat === "all"} onClick={() => setCat("all")}>{t("kn.menu.all")}</CatChip>
          {cats.map((c) => <CatChip key={c} active={cat === c} onClick={() => setCat(c)}><Bdi>{c}</Bdi></CatChip>)}
        </div>
      )}
      {err && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-amber)", marginBottom: 10 }}>{err}</div>}

      {!hydrated ? null : shown.length === 0 ? (
        <EmptyLine>{t("kn.menu.empty")}</EmptyLine>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {shown.map((m) => (
            <div key={m.id} style={rowStyle}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--kv-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Bdi>{m.name}</Bdi></div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  {m.allergens?.slice(0, 4).map((a) => (
                    <span key={a} style={{ fontSize: 9.5, fontWeight: 800, color: "#c0392b", background: "rgba(255,107,94,.12)", borderRadius: 6, padding: "2px 7px" }}>⚠ {allergenLabel(a)}</span>
                  ))}
                  {!m.available && <span style={{ fontSize: 10, fontWeight: 800, color: "#b9822a" }}>{t("kn.menu.off")}</span>}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--kv-text)", whiteSpace: "nowrap" }}><Num>{m.price.toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--kv-muted)" }}>{currency}</span></span>
              {/* INSTANT — 86 toggle (audited). */}
              <button type="button" role="switch" aria-checked={m.available} aria-label={t("kn.menu.toggleAria")} disabled={busy.has(m.id)} onClick={() => flip(m)} title={t("kn.instant")}
                style={{ width: 38, height: 22, borderRadius: 99, border: 0, cursor: busy.has(m.id) ? "default" : "pointer", opacity: busy.has(m.id) ? 0.5 : 1, padding: 0, position: "relative", background: m.available ? "var(--kv-primary)" : "#cdd9d2", flex: "0 0 auto" }}>
                <span style={{ position: "absolute", top: 3, insetInlineStart: m.available ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "inset-inline-start .15s" }} />
              </button>
              {/* GATED — propose (SOON, names the flow). */}
              <button onClick={() => proposeEdit(m)} style={ghostBtn}><Pencil size={12} /> {t("kn.menu.propose")}</button>
            </div>
          ))}
        </div>
      )}
    </Room>
  );
}

// ---------------------------------------------------------------------------
// Delivery & House Rules — zones (real read) + hours (real) + GATED propose.
// ---------------------------------------------------------------------------
const DAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY_LABEL: Record<string, DictKey> = {
  sunday: "set.day.sunday", monday: "set.day.monday", tuesday: "set.day.tuesday",
  wednesday: "set.day.wednesday", thursday: "set.day.thursday", friday: "set.day.friday", saturday: "set.day.saturday",
};

function DeliveryRoom({ zones, hydrated, currency, hours, onPropose }: { zones: DeliveryArea[]; hydrated: boolean; currency: string; hours: Record<string, { open?: string; close?: string; closed?: boolean }> | null; onPropose: (t: ProposeTarget) => void }) {
  const t = useT();
  const days = hours ? DAY_ORDER.filter((d) => hours[d]) : [];

  function proposeZone(z: DeliveryArea) {
    onPropose({
      title: z.name,
      rows: [
        { label: t("kn.pol.title"), value: <span><Num>{z.deliveryFee.toLocaleString("en-US")}</Num> {currency}</span> },
        { label: t("kn.zones.eta"), value: <Bdi>{z.estimatedTime}</Bdi> },
      ],
    });
  }

  return (
    <Room icon={<Truck size={17} />} accent={ACCENT.zones} title={t("kn.zones.title")} sub={t("kn.zones.sub")}>
      {!hydrated ? null : zones.length === 0 ? (
        <EmptyLine>{t("kn.zones.empty")}</EmptyLine>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {zones.map((z) => (
            <button key={z.id} onClick={() => proposeZone(z)} title={t("kn.gatedSoon")}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md)", padding: "8px 12px", cursor: "pointer", fontFamily: "var(--kv-font)" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-text)" }}><Bdi>{z.name}</Bdi></span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0A8A5F" }}><Num>{z.deliveryFee.toLocaleString("en-US")}</Num> {currency}</span>
              {!z.active && <span style={{ fontSize: 10, fontWeight: 800, color: "var(--kv-faint)" }}>({t("kn.pol.closed")})</span>}
            </button>
          ))}
        </div>
      )}

      {/* Policies — Hours is real; the rest are GATED (SOON). */}
      <div style={{ marginTop: 16, borderTop: "1px solid var(--kv-border)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--kv-muted)" }}>{t("kn.pol.title")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Clock size={14} color="var(--kv-muted)" />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-text)", flex: 1 }}>{t("kn.pol.hours")}</span>
          {hours === null ? <TruthChip state="gathering" /> : days.length === 0 ? <span style={{ fontSize: 12, color: "var(--kv-faint)" }}>{t("kn.pol.unset")}</span> : (
            <span style={{ fontSize: 12, color: "var(--kv-muted)", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }} dir="ltr">
              {days.map((d) => {
                const h = hours[d];
                return <span key={d}>{t(DAY_LABEL[d])} {h.closed || !h.open || !h.close ? t("kn.pol.closed") : `${h.open}–${h.close}`}</span>;
              })}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-muted)", flex: 1 }}>{t("kn.pol.tone")} · {t("kn.pol.dialect")}</span>
          <SoonPropose t={t} onClick={() => onPropose({ title: t("kn.pol.title"), rows: [] })} />
        </div>
      </div>
    </Room>
  );
}

// ---------------------------------------------------------------------------
// Staff Instructions — standing (real/GATHERING) + tonight-notes (INSTANT, real).
// ---------------------------------------------------------------------------
function StaffRoom({ standing, onPropose }: { standing: StandingRow[] | null; onPropose: (t: ProposeTarget) => void }) {
  const t = useT();
  const [notes, setNotes] = useState<TonightNote[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const active = (standing ?? []).filter((r) => r.active && r.approved_by && !r.retired_at);

  async function loadNotes() {
    const d = await getJson<{ notes?: TonightNote[] }>("/api/settings/tonight-notes");
    setNotes(d?.notes ?? []);
  }
  useEffect(() => { void loadNotes(); }, []);

  async function addNote() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/settings/tonight-notes", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
      if (r.ok) { setDraft(""); setMsg({ text: t("kn.staff.tonightSaved"), ok: true }); await loadNotes(); }
      else setMsg({ text: t("kn.staff.tonightError"), ok: false });
    } catch { setMsg({ text: t("kn.staff.tonightError"), ok: false }); }
    finally { setBusy(false); }
  }

  return (
    <Room icon={<Moon size={17} />} accent={ACCENT.staff} title={t("kn.staff.title")} sub={t("kn.staff.sub")}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18 }}>
        {/* STANDING — real read (GATED edits) */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--kv-muted)", flex: 1 }}>📌 {t("kn.staff.standing")}</span>
            <SoonPropose t={t} onClick={() => onPropose({ title: t("kn.staff.standing"), rows: [] })} />
          </div>
          {standing === null ? <TruthChip state="gathering" /> : active.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TruthChip state="gathering" />
              <span style={{ fontSize: 12, color: "var(--kv-faint)", lineHeight: 1.6 }}>{t("kn.staff.standingGathering")}</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {active.map((r) => (
                <div key={r.id} style={{ ...rowStyle, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--kv-text)", lineHeight: 1.6 }}><Bdi>{r.body}</Bdi></div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--kv-faint)", marginTop: 3 }}>{t("kn.staff.version")} <Num>{r.version}</Num></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TONIGHT — INSTANT (real, manager-only, auto-expire) */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--kv-muted)", flex: 1 }}>🌙 {t("kn.staff.tonight")}</span>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0A8A5F" }}>{t("kn.instant")}</span>
          </div>
          <p style={{ fontSize: 10.5, color: "var(--kv-faint)", margin: "0 0 10px", lineHeight: 1.6 }}>{t("kn.staff.tonightSub")}</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addNote(); } }} placeholder={t("kn.staff.tonightAdd")} dir="rtl"
              style={{ flex: 1, height: 36, borderRadius: "var(--kv-r-md-sm)", border: "1.5px solid var(--kv-border)", background: "var(--kv-card-soft)", padding: "0 11px", fontSize: 12.5, fontFamily: "var(--kv-font)", color: "var(--kv-text)" }} />
            <button onClick={addNote} disabled={busy || !draft.trim()} style={{ ...primaryBtn, opacity: busy || !draft.trim() ? 0.5 : 1 }}>{t("kn.staff.tonightBtn")}</button>
          </div>
          {msg && <div style={{ fontSize: 11.5, fontWeight: 700, color: msg.ok ? "var(--kv-deep)" : "var(--kv-amber)", marginBottom: 8 }}>{msg.text}</div>}
          {notes === null ? null : notes.length === 0 ? (
            <EmptyLine>{t("kn.staff.tonightEmpty")}</EmptyLine>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {notes.map((n) => (
                <div key={n.id} style={{ ...rowStyle, background: "rgba(232,180,90,.08)", borderColor: "rgba(232,180,90,.3)" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--kv-text)", flex: 1, lineHeight: 1.6 }}><Bdi>{n.body}</Bdi></span>
                  <span style={{ fontSize: 10, color: "var(--kv-faint)", whiteSpace: "nowrap" }}>{t("kn.staff.expires")} <Bdi>{new Date(n.expires_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Bdi></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Room>
  );
}

// ---------------------------------------------------------------------------
// Safety Vocabulary — LOCKED, view-only, NO edit path. The one red room.
// ---------------------------------------------------------------------------
function SafetyRoom() {
  const t = useT();
  return (
    <Room icon={<ShieldAlert size={17} />} accent={ACCENT.safety} title={t("kn.safe.title")} sub={t("kn.safe.sub")}
      right={<span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: "#c0392b", background: "rgba(255,107,94,.12)", borderRadius: "var(--kv-r-pill)", padding: "4px 10px" }}><Lock size={12} /> {t("kn.safe.title")}</span>}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ALLERGENS.map((a) => (
          <span key={a.key} style={{ fontSize: 12, fontWeight: 800, color: "#c0392b", background: "rgba(255,107,94,.10)", border: "1px solid rgba(255,107,94,.28)", borderRadius: "var(--kv-r-md-sm)", padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Lock size={11} strokeWidth={2.6} /> <Bdi>{a.arLabel}</Bdi>
          </span>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--kv-muted)", lineHeight: 1.85, margin: "14px 0 0" }}>{t("kn.safe.locknote")}</p>
      {/* No edit path: request-change + 211-log have no backend → honest SOON, never a write. */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <span style={soonStatic}><TruthChip state="soon" /> {t("kn.safe.requestChange")}</span>
        <span style={soonStatic}><TruthChip state="soon" /> {t("kn.safe.testLog")}</span>
      </div>
    </Room>
  );
}

// ---------------------------------------------------------------------------
// GATED — the propose modal. Shows the REAL current values (read-only) and NAMES the
// flow it becomes; the propose button is disabled with a SOON chip (never a write).
// ---------------------------------------------------------------------------
function ProposeSoonModal({ target, onClose }: { target: ProposeTarget; onClose: () => void }) {
  const t = useT();
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(10,14,20,.55)", display: "grid", placeItems: "center", zIndex: 90, padding: 20 }}>
      <div style={{ width: "min(460px,94vw)", background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-lg)", boxShadow: "0 30px 90px rgba(0,0,0,.4)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--kv-border)" }}>
          <Pencil size={15} color="var(--kv-muted)" />
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--kv-text)", flex: 1 }}>{t("kn.edit.title")} · <Bdi>{target.title}</Bdi></span>
          <button onClick={onClose} aria-label={t("kn.close")} style={{ ...ghostBtn, width: 30, padding: 0, justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "16px 18px" }}>
          {target.rows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < target.rows.length - 1 ? "1px solid var(--kv-border)" : "none" }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--kv-faint)", minWidth: 110 }}>{r.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--kv-text)", flex: 1, textAlign: "start" }}>{r.value}</span>
            </div>
          ))}
          {/* Rider 1 — the SOON control NAMES the flow it becomes; never a dead button, never a write. */}
          <div style={{ marginTop: 14, display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(232,180,90,.10)", border: "1px solid rgba(232,180,90,.35)", borderRadius: "var(--kv-r-md)", padding: "12px 14px" }}>
            <TruthChip state="soon" />
            <span style={{ fontSize: 12, color: "var(--kv-muted)", lineHeight: 1.7 }}>{t("kn.edit.soonBanner")}</span>
          </div>
          <button disabled style={{ ...primaryBtn, width: "100%", marginTop: 12, opacity: 0.5, cursor: "not-allowed", height: 40 }}>
            {t("kn.edit.proposeDisabled")} · <span style={{ fontWeight: 700 }}>{t("kn.gatedSoon")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// bits
// ---------------------------------------------------------------------------
function SoonPropose({ t, onClick }: { t: (k: DictKey) => string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={t("kn.gatedSoon")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: 0, cursor: "pointer", fontFamily: "var(--kv-font)", padding: 0 }}>
      <TruthChip state="soon" /> <span style={{ fontSize: 11, fontWeight: 700, color: "var(--kv-faint)" }}>{t("kn.menu.propose")}</span>
    </button>
  );
}
function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} style={{ height: 30, padding: "0 12px", borderRadius: "var(--kv-r-pill)", border: active ? 0 : "1px solid var(--kv-border)", background: active ? "var(--kv-grad-brand)" : "var(--kv-card)", color: active ? "#fff" : "var(--kv-muted)", fontFamily: "var(--kv-font)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
      {children}
    </button>
  );
}
function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: "var(--kv-faint)", padding: "12px 4px", lineHeight: 1.6 }}>{children}</div>;
}

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, background: "var(--kv-card-soft)",
  border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md)", padding: "10px 13px",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px", borderRadius: "var(--kv-r-md-sm)",
  border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontFamily: "var(--kv-font)",
  fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flex: "0 0 auto",
};
const primaryBtn: React.CSSProperties = {
  height: 36, padding: "0 14px", borderRadius: "var(--kv-r-md-sm)", border: 0,
  background: "var(--kv-grad-brand)", color: "#fff", fontFamily: "var(--kv-font)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const soonStatic: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: "var(--kv-faint)",
  background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-sm)", padding: "7px 12px",
};
