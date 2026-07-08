"use client";

// ============================================================================
// console_v2 item 9 — Knowledge (v35 dark-glass rebuild). "What Karim knows —
// and is allowed to say." Composed entirely from @/components/console-v2/kit;
// the design's four "rooms" render as glass Panels with tier-accented section
// headers (Chromatic Truth: the tier lives in the header badge + summary tiles,
// never a fabricated trend color). Every functional wire from the shipped page
// survives the reskin — the rebuild is VISUAL:
//
//  • INSTANT — the 86/availability toggle (POST /api/menu/availability, logged)
//    and tonight-notes (POST /api/settings/tonight-notes, manager-only, auto-
//    expire at close) write immediately via audited routes. Real.
//  • GATED  — a price/description/zone edit is a PROPOSAL: propose files a
//    knowledge_change_request (POST /api/knowledge/change-requests) that a
//    manager approves + applies in Approvals. Nothing writes a truth table here.
//    (Policy tone/dialect + the rich item-editor sections — photo, modifier
//    groups, pairings, performance — have no backend yet → rendered SOON.)
//  • LOCKED — the safety (allergen) vocabulary renders view-only with NO edit
//    path: red is used ONLY here (safety is the one sanctioned red). request-
//    change + the 211-case test log have no backend → SOON.
//
// Standing rules are flag-gated OFF for most tenants → honest GATHERING. Hours
// GATHERING until loaded. XSS: dictionary text nodes + <Bdi>/<Num> only.
//
// WO-KNOWLEDGE-DENSITY (verify pass) — confirmed, no visual/functional change
// needed: summary tiles are kit StatTiles (tier accent, not fabricated data);
// menu-row propose = ghost button, always-visible (touch-safe + design canon);
// menu rows comfortably spaced (not cramped); allergen safety is the ONE
// sanctioned red surface — Safety room LOCKED view-only, no edit path added;
// GATED propose (change-request) intact; honest SOON on the unbuilt editors
// (photo/modifiers/pairings/performance) + test-log + vocab-change.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Truck, Moon, ShieldAlert, Lock, Search, Pencil, Clock, X } from "lucide-react";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import {
  HeaderRow, PageGrid, Panel, SectionHeader, StatTile, TruthChip, LockedSwitch,
  AuroraDrawer, MiniModal, Toasts, pushToast, type Tier,
} from "@/components/console-v2/kit";
import { useT } from "@/lib/i18n/lang";
import { Bdi, Num } from "@/components/kivo";
import type { DictKey } from "@/lib/i18n/dictionary";
import type { MenuItem, DeliveryArea } from "@/lib/types";
import { ALLERGENS, mapAllergenValue, canonicalToArLabel } from "@/lib/ai/allergen-vocab";

interface TonightNote { id: string; body: string; expires_at: string }
interface StandingRow { id: string; version: number; body: string; active: boolean; approved_by: string | null; retired_at: string | null }

// A GATED edit that files a real change-request to the signing folder.
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

// ---------------------------------------------------------------------------
export default function KnowledgePage() {
  const t = useT();
  const hydrated = useHasHydrated();
  const menuItems = useRestaurantStore((s) => s.menuItems);
  const zones = useRestaurantStore((s) => s.deliveryAreas);
  const currency = useRestaurantStore((s) => s.profile.currency);

  const [hours, setHours] = useState<Record<string, { open?: string; close?: string; closed?: boolean }> | null>(null);
  const [standing, setStanding] = useState<StandingRow[] | null>(null);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [modal, setModal] = useState<null | "changelog" | "testlog" | "vocab" | "zones" | "policy">(null);

  const roomRefs = {
    menu: useRef<HTMLDivElement>(null),
    zones: useRef<HTMLDivElement>(null),
    staff: useRef<HTMLDivElement>(null),
    safety: useRef<HTMLDivElement>(null),
  };
  const scrollTo = (k: keyof typeof roomRefs) => roomRefs[k].current?.scrollIntoView({ behavior: "smooth", block: "start" });

  useEffect(() => {
    void getJson<{ hours?: Record<string, { open?: string; close?: string; closed?: boolean }> }>("/api/settings/hours").then((d) => setHours(d?.hours ?? {}));
    void getJson<{ instructions?: StandingRow[] }>("/api/settings/standing-instructions").then((d) => setStanding(d?.instructions ?? []));
  }, []);

  const offTonight = menuItems.filter((m) => !m.available).length;

  return (
    <>
      <HeaderRow
        title={t("kn.title")}
        jobLine={t("kn.sub")}
        right={
          <button onClick={() => setModal("changelog")} title={t("kn.changelog.title")} style={freshPill}>
            <span style={{ color: "var(--dim)" }}>{t("kn.fresh.priced")} <Num>{menuItems.length}</Num>/<Num>{menuItems.length}</Num></span>
            <span style={{ color: "#5fe0b0", fontWeight: 800 }}>· {t("kn.gateLocked")}</span>
          </button>
        }
      />

      <PageGrid
        context={
          <>
            {/* LEFT — "The brain": four summary tiles + editing-law doctrine. */}
            <Panel>
              <SectionHeader icon={<BookOpen size={15} />} tier="gold" title={t("kn.brain")} sub={t("kn.editing.law")} />
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <button onClick={() => scrollTo("menu")} style={tileBtn}>
                  <StatTile tier="gold" label={`📖 ${t("kn.menu.lbl")}`} value={<span><Num>{menuItems.length}</Num> <small style={{ fontSize: 11, fontWeight: 800 }}>{t("kn.items")}</small></span>} fact={t("kn.menu.r3")} />
                </button>
                <button onClick={() => scrollTo("zones")} style={tileBtn}>
                  <StatTile tier="blue" label={`🛵 ${t("kn.zones.lbl")}`} value={<span><Num>{zones.length}</Num> <small style={{ fontSize: 11, fontWeight: 800 }}>{t("kn.zonesUnit")}</small></span>} fact={t("kn.zones.r3")} />
                </button>
                <button onClick={() => scrollTo("staff")} style={tileBtn}>
                  <StatTile tier="coral" label={`🌙 ${t("kn.staff.lbl")}`} value={<TruthChip state="gather" />} fact={t("kn.staff.r3")} />
                </button>
                {/* Safety summary — the ONE sanctioned red surface (red = safety only). */}
                <button onClick={() => scrollTo("safety")} style={{ ...tileBtn }}>
                  <div style={safetyTile}>
                    <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase", color: "rgba(255,255,255,.85)" }}>🛡️ {t("kn.safe.lbl")}</div>
                    <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.05, marginTop: 3, color: "#fff", fontFamily: "var(--kvx-font-ui)" }}><Num>{ALLERGENS.length}</Num> <small style={{ fontSize: 11 }}>{t("kn.safe.locked")}</small></div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,.85)", marginTop: 4, borderTop: "1px solid rgba(255,255,255,.22)", paddingTop: 5 }}>{t("kn.safe.r3")}</div>
                  </div>
                </button>
              </div>
              <p style={doctrine}>{t("kn.law")}</p>
            </Panel>
          </>
        }
        hero={
          <Panel style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <SectionHeader
              icon={<BookOpen size={15} />}
              tier="gold"
              title={t("kn.library")}
              sub={t("kn.librarySub")}
              right={<MenuSearchLink />}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div ref={roomRefs.menu}><MenuRoom items={menuItems} hydrated={hydrated} currency={currency} offTonight={offTonight} onEdit={setEdit} /></div>
              <div ref={roomRefs.zones}><DeliveryRoom zones={zones} hydrated={hydrated} currency={currency} hours={hours} onEdit={setEdit} onAllZones={() => setModal("zones")} onPolicy={() => setModal("policy")} /></div>
              <div ref={roomRefs.staff}><StaffRoom standing={standing} /></div>
              <div ref={roomRefs.safety}><SafetyRoom onTestLog={() => setModal("testlog")} onRequest={() => setModal("vocab")} /></div>
            </div>
          </Panel>
        }
      />

      {edit && <ItemEditorDrawer target={edit} onClose={() => setEdit(null)} />}

      {/* Changelog — GATHERING (version-history engine not shipped). */}
      <MiniModal open={modal === "changelog"} onClose={() => setModal(null)}>
        <ModalHead icon="🧾" title={t("kn.changelog.title")} onClose={() => setModal(null)} />
        <GatheringBody body={t("kn.changelog.gathering")} />
      </MiniModal>
      {/* Test log — SOON (211-case harness has no console surface). */}
      <MiniModal open={modal === "testlog"} onClose={() => setModal(null)}>
        <ModalHead icon="📋" title={t("kn.safe.testLog")} onClose={() => setModal(null)} />
        <SoonBody body={t("kn.safe.locknote")} />
      </MiniModal>
      {/* Vocabulary change request — SOON (safety edits are a production event, no console path). */}
      <MiniModal open={modal === "vocab"} onClose={() => setModal(null)}>
        <ModalHead icon="🔒" title={t("kn.safe.requestChange")} onClose={() => setModal(null)} />
        <SoonBody body={t("kn.safe.locknote")} />
      </MiniModal>
      {/* All zones — REAL (deliveryAreas store). */}
      <MiniModal open={modal === "zones"} onClose={() => setModal(null)}>
        <ModalHead icon="📍" title={t("kn.zones.title")} onClose={() => setModal(null)} />
        <div style={{ padding: "4px 2px", display: "flex", flexDirection: "column", gap: 7 }}>
          {zones.map((z) => (
            <div key={z.id} style={zoneRow}>
              <span style={{ fontFamily: "var(--kvx-font-ar)", fontWeight: 700, color: "var(--txt)" }}><Bdi>{z.name}</Bdi></span>
              <span style={{ marginInlineStart: "auto", fontWeight: 800, color: "var(--gold)" }}><Num>{z.deliveryFee.toLocaleString("en-US")}</Num> {currency}</span>
              {!z.active && <span style={{ fontSize: 10, color: "var(--faint)" }}>({t("kn.pol.closed")})</span>}
            </div>
          ))}
        </div>
      </MiniModal>
      {/* Policy (tone / dialect / modes / payment) — tone & dialect have no field-apply path → SOON. */}
      <MiniModal open={modal === "policy"} onClose={() => setModal(null)}>
        <ModalHead icon="🗣️" title={t("kn.pol.title")} onClose={() => setModal(null)} />
        <div style={{ padding: "4px 2px", display: "flex", flexDirection: "column", gap: 8 }}>
          <PolicyRow label={t("kn.pol.pay")} state="live" />
          <PolicyRow label={t("kn.pol.modes")} state="live" />
          <PolicyRow label={`${t("kn.pol.tone")} · ${t("kn.pol.dialect")}`} state="soon" />
        </div>
      </MiniModal>

      <Toasts />
    </>
  );
}

// ---------------------------------------------------------------------------
// A room = a glass Panel-inside-Panel: tier section header + body.
// ---------------------------------------------------------------------------
function Room({ icon, tier, title, sub, right, children }: { icon: React.ReactNode; tier: Tier; title: string; sub: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={roomBox}>
      <SectionHeader icon={icon} tier={tier} title={title} sub={sub} right={right} />
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Menu Truth — INSTANT 86 toggle (real) + GATED propose (files a change-request).
// ---------------------------------------------------------------------------
function MenuRoom({ items, hydrated, currency, offTonight, onEdit }: { items: MenuItem[]; hydrated: boolean; currency: string; offTonight: number; onEdit: (t: EditTarget) => void }) {
  const t = useT();
  const setItemAvailability = useRestaurantStore((s) => s.setItemAvailability);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [busy, setBusy] = useState<Set<string>>(new Set());

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
    setBusy((s) => new Set(s).add(m.id));
    const ok = await setItemAvailability(m.id, !m.available);
    pushToast(ok ? t(m.available ? "kn.menu.86done.off" : "kn.menu.86done.on") : t("kn.menu.86error"), ok ? "ok" : "amber");
    setBusy((s) => { const n = new Set(s); n.delete(m.id); return n; });
  }

  const editTargetFor = (m: MenuItem): EditTarget => ({
    targetType: "menu_item", targetId: m.id, targetLabel: m.name, currency, fields: [
      { field: "price", labelKey: "kn.edit.newPrice", kind: "number", current: m.price },
      { field: "description", labelKey: "kn.edit.newDesc", kind: "text", current: m.description ?? "" },
    ],
  });

  return (
    <Room icon={<BookOpen size={15} />} tier="gold" title={t("kn.menu.title")} sub={t("kn.menu.roomJob")}
      right={<span style={{ fontSize: 10, fontWeight: 800, color: "var(--dim)" }}><Num>{items.length}</Num> {t("kn.items")}{offTonight > 0 && <> · <Num>{offTonight}</Num> {t("kn.menu.off")}</>}</span>}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
        <span style={searchBox}>
          <Search size={13} color="var(--faint)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("kn.menu.search")} style={searchInput} />
        </span>
      </div>
      {cats.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <CatChip active={cat === "all"} onClick={() => setCat("all")}>{t("kn.menu.all")}</CatChip>
          {cats.map((c) => <CatChip key={c} active={cat === c} onClick={() => setCat(c)}><Bdi>{c}</Bdi></CatChip>)}
        </div>
      )}

      {!hydrated ? null : shown.length === 0 ? (
        <EmptyLine>{t("kn.menu.empty")}</EmptyLine>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {shown.map((m) => (
            <div key={m.id} style={itemRow} onClick={() => onEdit(editTargetFor(m))} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") onEdit(editTargetFor(m)); }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--txt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Bdi>{m.name}</Bdi></div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  {m.allergens?.slice(0, 4).map((a) => (
                    <span key={a} style={allergenChip}>⚠ {allergenLabel(a)}</span>
                  ))}
                  {!m.available && <span style={{ fontSize: 10, fontWeight: 800, color: "var(--coral)" }}>{t("kn.menu.off")}</span>}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--gold)", whiteSpace: "nowrap" }}><Num>{m.price.toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--dim)" }}>{currency}</span></span>
              <span onClick={(e) => e.stopPropagation()} title={t("kn.instant")} style={{ display: "inline-flex" }}>
                <LockedSwitch on={m.available} onToggle={() => flip(m)} />
              </span>
              <button onClick={(e) => { e.stopPropagation(); onEdit(editTargetFor(m)); }} style={ghostBtn}><Pencil size={12} /> {t("kn.menu.propose")}</button>
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

function DeliveryRoom({ zones, hydrated, currency, hours, onEdit, onAllZones, onPolicy }: { zones: DeliveryArea[]; hydrated: boolean; currency: string; hours: Record<string, { open?: string; close?: string; closed?: boolean }> | null; onEdit: (t: EditTarget) => void; onAllZones: () => void; onPolicy: () => void }) {
  const t = useT();
  const days = hours ? DAY_ORDER.filter((d) => hours[d]) : [];
  const feeEdit = (z: DeliveryArea): EditTarget => ({ targetType: "delivery_zone", targetId: z.id, targetLabel: z.name, currency, fields: [{ field: "deliveryFee", labelKey: "kn.edit.newFee", kind: "number", current: z.deliveryFee }] });

  return (
    <Room icon={<Truck size={15} />} tier="blue" title={t("kn.zones.title")} sub={t("kn.zones.roomJob")}
      right={<span style={{ fontSize: 10, fontWeight: 800, color: "var(--dim)" }}><Num>{zones.length}</Num> {t("kn.zonesUnit")}</span>}
    >
      {!hydrated ? null : zones.length === 0 ? (
        <EmptyLine>{t("kn.zones.empty")}</EmptyLine>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {zones.slice(0, 5).map((z) => (
            <button key={z.id} onClick={() => onEdit(feeEdit(z))} title={t("kn.gatedSoon")} style={zoneChip}>
              <span style={{ fontFamily: "var(--kvx-font-ar)", fontWeight: 700, color: "var(--txt)" }}><Bdi>{z.name}</Bdi></span>
              <span style={{ fontWeight: 800, color: "var(--gold)" }}><Num>{z.deliveryFee.toLocaleString("en-US")}</Num> {currency}</span>
            </button>
          ))}
          {zones.length > 5 && <button onClick={onAllZones} style={{ ...zoneChip, color: "var(--blue2)" }}>📍 {t("kn.zones.all")}</button>}
        </div>
      )}

      <div style={{ marginTop: 14, borderTop: "1px solid var(--stroke)", paddingTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={policyPill}>
          <Clock size={12} />
          {hours === null ? <TruthChip state="gather" /> : days.length === 0 ? <span style={{ color: "var(--faint)" }}>{t("kn.pol.unset")}</span> : (
            <span dir="ltr" style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
              {days.slice(0, 2).map((d) => { const h = hours[d]; return <span key={d}>{t(DAY_LABEL[d])} {h.closed || !h.open || !h.close ? t("kn.pol.closed") : `${h.open}–${h.close}`}</span>; })}
            </span>
          )}
        </span>
        <button style={policyPill} onClick={onPolicy}>💵 {t("kn.pol.pay")}</button>
        <button style={policyPill} onClick={onPolicy}>🛍️ {t("kn.pol.modes")}</button>
        <button style={policyPill} onClick={onPolicy}>🗣️ {t("kn.pol.tone")} <TruthChip state="soon" /></button>
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

  const active = (standing ?? []).filter((r) => r.active && r.approved_by && !r.retired_at);

  async function loadNotes() {
    const d = await getJson<{ notes?: TonightNote[] }>("/api/settings/tonight-notes");
    setNotes(d?.notes ?? []);
  }
  useEffect(() => { void loadNotes(); }, []);

  async function addNote() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/settings/tonight-notes", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
      if (r.ok) { setDraft(""); pushToast(t("kn.staff.tonightSaved"), "ok"); await loadNotes(); }
      else pushToast(t("kn.staff.tonightError"), "amber");
    } catch { pushToast(t("kn.staff.tonightError"), "amber"); }
    finally { setBusy(false); }
  }

  return (
    <Room icon={<Moon size={15} />} tier="coral" title={t("kn.staff.title")} sub={t("kn.staff.roomJob")}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
        {/* STANDING — real read; field-level edit has no apply path yet → SOON. */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--dim)", flex: 1 }}>📌 {t("kn.staff.standingHead")}</span>
            <TruthChip state="soon" />
          </div>
          {standing === null ? <TruthChip state="gather" /> : active.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TruthChip state="gather" />
              <span style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>{t("kn.staff.standingGathering")}</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {active.map((r) => (
                <div key={r.id} style={{ ...noteBox }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--txt)", lineHeight: 1.6, fontFamily: "var(--kvx-font-ar)" }}><Bdi>{r.body}</Bdi></div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--faint)", marginTop: 4 }}>{t("kn.staff.version")} <Num>{r.version}</Num> · {t("kn.staff.ownerOk")}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TONIGHT — INSTANT (real, manager-only, auto-expire) */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--dim)", flex: 1 }}>🌙 {t("kn.staff.tonightHead")}</span>
            <TruthChip state="live" label={t("kn.instant")} />
          </div>
          <p style={{ fontSize: 10, color: "var(--faint)", margin: "0 0 10px", lineHeight: 1.6 }}>{t("kn.staff.tonightSub")}</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addNote(); } }} placeholder={t("kn.staff.tonightAdd")} dir="rtl" style={noteInput} />
            <button onClick={addNote} disabled={busy || !draft.trim()} style={{ ...primaryBtn, opacity: busy || !draft.trim() ? 0.5 : 1 }}>{t("kn.staff.tonightBtn")}</button>
          </div>
          {notes === null ? null : notes.length === 0 ? (
            <EmptyLine>{t("kn.staff.tonightEmpty")}</EmptyLine>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {notes.map((n) => (
                <div key={n.id} style={{ ...noteBox, background: "rgba(232,180,90,.08)", borderColor: "rgba(232,180,90,.3)" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--txt)", lineHeight: 1.6, fontFamily: "var(--kvx-font-ar)" }}><Bdi>{n.body}</Bdi></span>
                  <div style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 4 }}>{t("kn.staff.expires")} <Bdi>{new Date(n.expires_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Bdi></div>
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
// Safety — the ONE red room. View-only vocabulary; no edit path exists here.
// ---------------------------------------------------------------------------
function SafetyRoom({ onTestLog, onRequest }: { onTestLog: () => void; onRequest: () => void }) {
  const t = useT();
  return (
    <section style={{ ...roomBox, border: "1px solid rgba(255,107,94,.4)", background: "rgba(255,107,94,.05)" }}>
      <SectionHeader icon={<ShieldAlert size={15} />} tier="coral" title={t("kn.safe.title")} sub={t("kn.safe.roomJob")}
        right={<span style={safetyLockChip}><Lock size={12} /> {t("kn.safe.locked")}</span>} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ALLERGENS.map((a) => (
          <span key={a.key} style={vocabChip}>
            <Lock size={11} strokeWidth={2.6} /> <Bdi>{a.arLabel}</Bdi>
          </span>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.85, margin: "14px 0 0" }}>{t("kn.safe.locknote")}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={onTestLog} style={soonStatic}><TruthChip state="soon" /> {t("kn.safe.testLog")}</button>
        <button onClick={onRequest} style={soonStatic}><TruthChip state="soon" /> {t("kn.safe.requestChange")}</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GATED — the item editor drawer. Price + description are REAL (file a
// knowledge_change_request → Approvals). The market-standard sections the design
// shows (photo, modifier groups, pairings, performance, WA preview) have no
// backend → rendered SOON, full chrome, never faked.
// ---------------------------------------------------------------------------
function ItemEditorDrawer({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const t = useT();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(target.fields.map((f) => [f.field, String(f.current)])));
  const [busy, setBusy] = useState(false);

  async function propose() {
    if (busy) return;
    setBusy(true);
    const changed = target.fields.filter((f) => {
      const raw = vals[f.field] ?? "";
      if (f.kind === "number") return Number(raw) !== Number(f.current);
      return raw !== String(f.current);
    });
    if (changed.length === 0) { pushToast(t("kn.edit.noChange"), "amber"); setBusy(false); return; }
    try {
      for (const f of changed) {
        const newValue = f.kind === "number" ? Number(vals[f.field]) : vals[f.field];
        const r = await fetch("/api/knowledge/change-requests", {
          method: "POST", credentials: "include", headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetType: target.targetType, targetId: target.targetId, targetLabel: target.targetLabel, field: f.field, oldValue: f.current, newValue }),
        });
        if (!r.ok) { pushToast(t("kn.edit.proposeError"), "amber"); setBusy(false); return; }
      }
      pushToast(t("kn.edit.proposed"), "ok");
      setTimeout(onClose, 700);
    } catch { pushToast(t("kn.edit.proposeError"), "amber"); setBusy(false); }
  }

  const isMenu = target.targetType === "menu_item";

  return (
    <AuroraDrawer open onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--txt)" }}><Pencil size={14} style={{ verticalAlign: "-2px" }} /> {t("kn.edit.title")} · <Bdi>{target.targetLabel}</Bdi></div>
          <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 3 }}>{t("kn.edit.roomJob")}</div>
        </div>
        <button onClick={onClose} aria-label={t("kn.close")} style={drawerX}><X size={15} /></button>
      </div>

      {/* REAL editable fields — file a change-request. */}
      {target.fields.map((f) => (
        <label key={f.field} style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 12 }}>
          <span style={fieldLabel}>{t(f.labelKey)}{f.kind === "number" && target.currency ? ` (${target.currency})` : ""}</span>
          <input value={vals[f.field] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.field]: e.target.value }))}
            inputMode={f.kind === "number" ? "decimal" : undefined} dir={f.kind === "number" ? "ltr" : "rtl"} style={fieldInput} />
        </label>
      ))}

      {/* SOON sections — full designed chrome, no backend yet. */}
      {isMenu && (
        <>
          <SoonSection label={t("kn.edit.photo")} />
          <SoonSection label={t("kn.edit.modifiers")} />
          <SoonSection label={t("kn.edit.pairing")} />
          <SoonSection label={t("kn.edit.perf")} />
        </>
      )}

      <div style={{ marginTop: 14, display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(232,180,90,.10)", border: "1px solid rgba(232,180,90,.35)", borderRadius: 12, padding: "12px 14px" }}>
        <span style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.7 }}>{t("kn.edit.soonBanner")}</span>
      </div>
      <button onClick={propose} disabled={busy} style={{ ...primaryBtn, width: "100%", marginTop: 12, height: 40, opacity: busy ? 0.6 : 1 }}>
        {t("kn.edit.proposeDisabled")} → {t("nav.approvals")}
      </button>
    </AuroraDrawer>
  );
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------
function MenuSearchLink() {
  return <TruthChip state="live" />;
}
function ModalHead({ icon, title, onClose }: { icon: string; title: string; onClose: () => void }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 17 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--txt)", flex: 1 }}>{title}</span>
      <button onClick={onClose} aria-label={t("a11y.close")} style={drawerX}><X size={15} /></button>
    </div>
  );
}
function GatheringBody({ body }: { body: string }) {
  const t = useT();
  return (
    <div style={{ textAlign: "center", padding: "18px 8px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><TruthChip state="gather" /></div>
      <p style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.8, maxWidth: 420, margin: "0 auto" }}>{body}</p>
      <p style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 10 }}>{t("kn.soon.hint")}</p>
    </div>
  );
}
function SoonBody({ body }: { body: string }) {
  const t = useT();
  return (
    <div style={{ padding: "6px 4px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><TruthChip state="soon" /></div>
      <p style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.85 }}>{body}</p>
      <p style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 10, textAlign: "center" }}>{t("kn.soon.hint")}</p>
    </div>
  );
}
function SoonSection({ label }: { label: string }) {
  return (
    <div style={{ marginTop: 12, border: "1px dashed var(--stroke2)", borderRadius: 12, padding: "12px 13px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--dim)", flex: 1 }}>{label}</span>
      <TruthChip state="soon" />
    </div>
  );
}
function PolicyRow({ label, state }: { label: string; state: "live" | "soon" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "10px 13px" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--txt)", flex: 1 }}>{label}</span>
      <TruthChip state={state} />
    </div>
  );
}
function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} style={{
      height: 30, padding: "0 12px", borderRadius: 99, cursor: "pointer", fontFamily: "var(--kvx-font-ar)", fontSize: 11.5, fontWeight: 800,
      border: active ? 0 : "1px solid var(--stroke)", background: active ? "var(--g-gold)" : "transparent", color: active ? "var(--ink)" : "var(--dim)",
    }}>{children}</button>
  );
}
function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--faint)", padding: "12px 4px", lineHeight: 1.6 }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Inline styles (all tokens from the .kvx scope).
// ---------------------------------------------------------------------------
const freshPill: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, background: "var(--panel)", border: "1px solid var(--stroke)", borderRadius: 99, padding: "6px 12px", cursor: "pointer", fontFamily: "var(--kvx-font-ui)" };
const tileBtn: React.CSSProperties = { border: 0, background: "none", padding: 0, cursor: "pointer", textAlign: "start", width: "100%", fontFamily: "inherit" };
const safetyTile: React.CSSProperties = { position: "relative", borderRadius: 15, padding: "13px 14px 12px 16px", overflow: "hidden", background: "linear-gradient(135deg,#ff8d7e,#f75b52)", boxShadow: "0 10px 26px rgba(0,0,0,.28)" };
const doctrine: React.CSSProperties = { marginTop: 12, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 14, padding: "11px 13px", fontSize: 11, color: "var(--dim)", lineHeight: 1.7 };
const roomBox: React.CSSProperties = { background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 18, padding: "15px 16px" };
const searchBox: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "8px 12px", width: 220, maxWidth: "50vw" };
const searchInput: React.CSSProperties = { border: 0, background: "transparent", outline: "none", color: "var(--txt)", fontFamily: "var(--kvx-font-ar)", fontSize: 12, width: "100%" };
const itemRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 11, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 13, padding: "10px 13px", cursor: "pointer" };
const allergenChip: React.CSSProperties = { fontSize: 9.5, fontWeight: 800, color: "#ffb3a8", background: "rgba(255,107,94,.12)", border: "1px solid rgba(255,107,94,.3)", borderRadius: 6, padding: "2px 7px" };
const zoneChip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "8px 12px", cursor: "pointer", fontFamily: "var(--kvx-font-ar)", fontSize: 11.5 };
const policyPill: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 11, padding: "7px 12px", cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: "var(--txt)", fontFamily: "var(--kvx-font-ar)" };
const noteBox: React.CSSProperties = { background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "10px 13px" };
const noteInput: React.CSSProperties = { flex: 1, height: 36, borderRadius: 11, border: "1px solid var(--stroke)", background: "var(--inset2)", padding: "0 11px", fontSize: 12, fontFamily: "var(--kvx-font-ar)", color: "var(--txt)", outline: "none" };
const vocabChip: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#ffc9c9", background: "rgba(255,107,94,.10)", border: "1px solid rgba(255,107,94,.32)", borderRadius: 10, padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--kvx-font-ar)" };
const safetyLockChip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, color: "#ffc9c9", background: "rgba(255,107,94,.14)", border: "1px solid rgba(255,107,94,.4)", borderRadius: 99, padding: "4px 10px" };
const soonStatic: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, color: "var(--dim)", background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 11, padding: "7px 12px", cursor: "pointer", fontFamily: "var(--kvx-font-ar)" };
const zoneRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 11, padding: "9px 12px", fontSize: 11.5 };
const drawerX: React.CSSProperties = { width: 30, height: 30, borderRadius: 10, background: "var(--inset)", border: "1px solid var(--stroke)", color: "var(--dim)", cursor: "pointer", display: "grid", placeItems: "center", flex: "none" };
const fieldLabel: React.CSSProperties = { fontSize: 8.5, fontWeight: 800, letterSpacing: ".08em", color: "var(--faint)", textTransform: "uppercase" };
const fieldInput: React.CSSProperties = { height: 38, borderRadius: 11, border: "1px solid var(--stroke)", background: "var(--inset2)", padding: "0 12px", fontSize: 12.5, fontFamily: "var(--kvx-font-ar)", color: "var(--txt)", outline: "none" };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px", borderRadius: 10, border: "1px solid var(--stroke)", background: "var(--inset)", color: "var(--dim)", fontFamily: "var(--kvx-font-ar)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flex: "none" };
const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 11, border: 0, background: "var(--g-green)", color: "var(--ink)", fontFamily: "var(--kvx-font-ui)", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
