"use client";

// ============================================================================
// console_v2 item 9 — Knowledge. "What Karim knows — and is allowed to say."
// Four rooms, governed by the THREE-TIER EDITING LAW:
//
//  • INSTANT — writes immediately via an audited route. The 86/availability toggle
//    (POST /api/menu/availability, logged) and tonight-notes (POST
//    /api/settings/tonight-notes, manager-only, auto-expire at close). Wired real.
//  • GATED — a price/description/zone edit is a PROPOSAL for the signing folder,
//    NEVER a direct write ("a wrong price in Karim's mouth is a live incident"). As of
//    item 10 the signing folder EXISTS: propose files a knowledge_change_request
//    (POST /api/knowledge/change-requests) that a manager approves + applies in
//    Approvals — nothing writes a truth table from here. (Policy/tone/standing edits
//    have no field-level apply path yet → still rendered SOON, honestly.)
//  • LOCKED — the safety (allergen) vocabulary renders view-only with NO edit path at
//    all: the console is simply not a surface that can change what the deterministic
//    gate reads. request-change + the 211-case test log have no backend → SOON.
//
// Every read is real. Standing rules are flag-gated OFF for most tenants → honest
// GATHERING. RED is used ONLY on the Safety room. XSS: text nodes + <Bdi>/<Num> only.
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

const ACCENT = { menu: "#c58b1f", zones: "#3f7fe0", staff: "#6b7688", safety: "#ff6b5e" } as const;

interface TonightNote { id: string; body: string; expires_at: string }
interface StandingRow { id: string; version: number; body: string; active: boolean; approved_by: string | null; retired_at: string | null }

// A GATED edit that files a real change-request to the signing folder (item 10).
type EditKind = "number" | "text";
interface EditField { field: string; labelKey: DictKey; kind: EditKind; current: number | string }
interface EditTarget { targetType: "menu_item" | "delivery_zone"; targetId: string; targetLabel: string; currency: string; fields: EditField[] }

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { credentials: "include" }); return r.ok ? ((await r.json()) as T) : null; }
  catch { return null; }
}
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
  const [edit, setEdit] = useState<EditTarget | null>(null);

  useEffect(() => {
    void getJson<{ hours?: Record<string, { open?: string; close?: string; closed?: boolean }> }>("/api/settings/hours").then((d) => setHours(d?.hours ?? {}));
    void getJson<{ instructions?: StandingRow[] }>("/api/settings/standing-instructions").then((d) => setStanding(d?.instructions ?? []));
  }, []);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
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

      <div style={{ border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)", background: "var(--kv-card-soft)", padding: "12px 16px", fontSize: 12.5, color: "var(--kv-muted)", lineHeight: 1.8 }}>
        {t("kn.law")}
      </div>

      <MenuRoom items={menuItems} hydrated={hydrated} currency={currency} onEdit={setEdit} />
      <DeliveryRoom zones={zones} hydrated={hydrated} currency={currency} hours={hours} onEdit={setEdit} />
      <StaffRoom standing={standing} />
      <SafetyRoom />

      {edit && <ProposeModal target={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

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
// Menu Truth — INSTANT 86 toggle (real) + GATED propose (files a change-request).
// ---------------------------------------------------------------------------
function MenuRoom({ items, hydrated, currency, onEdit }: { items: MenuItem[]; hydrated: boolean; currency: string; onEdit: (t: EditTarget) => void }) {
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
    const ok = await setItemAvailability(m.id, !m.available);
    if (!ok) setErr(t("kn.menu.86error"));
    setBusy((s) => { const n = new Set(s); n.delete(m.id); return n; });
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
              <button type="button" role="switch" aria-checked={m.available} aria-label={t("kn.menu.toggleAria")} disabled={busy.has(m.id)} onClick={() => flip(m)} title={t("kn.instant")}
                style={{ width: 38, height: 22, borderRadius: 99, border: 0, cursor: busy.has(m.id) ? "default" : "pointer", opacity: busy.has(m.id) ? 0.5 : 1, padding: 0, position: "relative", background: m.available ? "var(--kv-primary)" : "#cdd9d2", flex: "0 0 auto" }}>
                <span style={{ position: "absolute", top: 3, insetInlineStart: m.available ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "inset-inline-start .15s" }} />
              </button>
              <button onClick={() => onEdit({ targetType: "menu_item", targetId: m.id, targetLabel: m.name, currency, fields: [
                { field: "price", labelKey: "kn.edit.newPrice", kind: "number", current: m.price },
                { field: "description", labelKey: "kn.edit.newDesc", kind: "text", current: m.description ?? "" },
              ] })} style={ghostBtn}><Pencil size={12} /> {t("kn.menu.propose")}</button>
            </div>
          ))}
        </div>
      )}
    </Room>
  );
}

// ---------------------------------------------------------------------------
const DAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY_LABEL: Record<string, DictKey> = {
  sunday: "set.day.sunday", monday: "set.day.monday", tuesday: "set.day.tuesday",
  wednesday: "set.day.wednesday", thursday: "set.day.thursday", friday: "set.day.friday", saturday: "set.day.saturday",
};

function DeliveryRoom({ zones, hydrated, currency, hours, onEdit }: { zones: DeliveryArea[]; hydrated: boolean; currency: string; hours: Record<string, { open?: string; close?: string; closed?: boolean }> | null; onEdit: (t: EditTarget) => void }) {
  const t = useT();
  const days = hours ? DAY_ORDER.filter((d) => hours[d]) : [];

  return (
    <Room icon={<Truck size={17} />} accent={ACCENT.zones} title={t("kn.zones.title")} sub={t("kn.zones.sub")}>
      {!hydrated ? null : zones.length === 0 ? (
        <EmptyLine>{t("kn.zones.empty")}</EmptyLine>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {zones.map((z) => (
            <button key={z.id} onClick={() => onEdit({ targetType: "delivery_zone", targetId: z.id, targetLabel: z.name, currency, fields: [
              { field: "deliveryFee", labelKey: "kn.edit.newFee", kind: "number", current: z.deliveryFee },
            ] })} title={t("kn.gatedSoon")}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md)", padding: "8px 12px", cursor: "pointer", fontFamily: "var(--kv-font)" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-text)" }}><Bdi>{z.name}</Bdi></span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0A8A5F" }}><Num>{z.deliveryFee.toLocaleString("en-US")}</Num> {currency}</span>
              {!z.active && <span style={{ fontSize: 10, fontWeight: 800, color: "var(--kv-faint)" }}>({t("kn.pol.closed")})</span>}
            </button>
          ))}
        </div>
      )}

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
        {/* Tone/dialect have no field-level apply path yet → honest SOON. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-muted)", flex: 1 }}>{t("kn.pol.tone")} · {t("kn.pol.dialect")}</span>
          <TruthChip state="soon" />
        </div>
      </div>
    </Room>
  );
}

// ---------------------------------------------------------------------------
function StaffRoom({ standing }: { standing: StandingRow[] | null }) {
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
        {/* STANDING — real read; edits have no field-level apply path yet → SOON. */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--kv-muted)", flex: 1 }}>📌 {t("kn.staff.standing")}</span>
            <TruthChip state="soon" />
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
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <span style={soonStatic}><TruthChip state="soon" /> {t("kn.safe.requestChange")}</span>
        <span style={soonStatic}><TruthChip state="soon" /> {t("kn.safe.testLog")}</span>
      </div>
    </Room>
  );
}

// ---------------------------------------------------------------------------
// GATED — the propose modal. Edits are REAL: on "Propose" each changed field files a
// knowledge_change_request to the signing folder (Approvals). Nothing writes a truth
// table here — the banner says exactly that.
// ---------------------------------------------------------------------------
function ProposeModal({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const t = useT();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(target.fields.map((f) => [f.field, String(f.current)])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function propose() {
    if (busy) return;
    setBusy(true); setMsg(null);
    // File one change-request per CHANGED field.
    const changed = target.fields.filter((f) => {
      const raw = vals[f.field] ?? "";
      if (f.kind === "number") return Number(raw) !== Number(f.current);
      return raw !== String(f.current);
    });
    if (changed.length === 0) { setMsg({ text: t("kn.edit.noChange"), ok: false }); setBusy(false); return; }
    try {
      for (const f of changed) {
        const newValue = f.kind === "number" ? Number(vals[f.field]) : vals[f.field];
        const r = await fetch("/api/knowledge/change-requests", {
          method: "POST", credentials: "include", headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetType: target.targetType, targetId: target.targetId, targetLabel: target.targetLabel, field: f.field, oldValue: f.current, newValue }),
        });
        if (!r.ok) { setMsg({ text: t("kn.edit.proposeError"), ok: false }); setBusy(false); return; }
      }
      setMsg({ text: t("kn.edit.proposed"), ok: true });
      setTimeout(onClose, 900);
    } catch { setMsg({ text: t("kn.edit.proposeError"), ok: false }); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(10,14,20,.55)", display: "grid", placeItems: "center", zIndex: 90, padding: 20 }}>
      <div style={{ width: "min(460px,94vw)", background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-lg)", boxShadow: "0 30px 90px rgba(0,0,0,.4)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--kv-border)" }}>
          <Pencil size={15} color="var(--kv-muted)" />
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--kv-text)", flex: 1 }}>{t("kn.edit.title")} · <Bdi>{target.targetLabel}</Bdi></span>
          <button onClick={onClose} aria-label={t("kn.close")} style={{ ...ghostBtn, width: 30, padding: 0, justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "16px 18px" }}>
          {target.fields.map((f) => (
            <label key={f.field} style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-muted)" }}>{t(f.labelKey)}{f.kind === "number" && target.currency ? ` (${target.currency})` : ""}</span>
              <input value={vals[f.field] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.field]: e.target.value }))}
                inputMode={f.kind === "number" ? "decimal" : undefined} dir={f.kind === "number" ? "ltr" : "rtl"}
                style={{ height: 38, borderRadius: "var(--kv-r-md-sm)", border: "1.5px solid var(--kv-border)", background: "var(--kv-card-soft)", padding: "0 11px", fontSize: 13, fontFamily: "var(--kv-font)", color: "var(--kv-text)" }} />
            </label>
          ))}
          <div style={{ marginTop: 4, display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(232,180,90,.10)", border: "1px solid rgba(232,180,90,.35)", borderRadius: "var(--kv-r-md)", padding: "12px 14px" }}>
            <span style={{ fontSize: 12, color: "var(--kv-muted)", lineHeight: 1.7 }}>{t("kn.edit.soonBanner")}</span>
          </div>
          {msg && <div style={{ fontSize: 12, fontWeight: 700, color: msg.ok ? "var(--kv-deep)" : "var(--kv-amber)", marginTop: 10 }}>{msg.text}</div>}
          <button onClick={propose} disabled={busy} style={{ ...primaryBtn, width: "100%", marginTop: 12, height: 40, opacity: busy ? 0.6 : 1 }}>
            {t("kn.edit.proposeDisabled")} · <span style={{ fontWeight: 700 }}>{t("kn.gatedSoon")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
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
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: "var(--kv-r-md-sm)", border: 0,
  background: "var(--kv-grad-brand)", color: "#fff", fontFamily: "var(--kv-font)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const soonStatic: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: "var(--kv-faint)",
  background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-sm)", padding: "7px 12px",
};
