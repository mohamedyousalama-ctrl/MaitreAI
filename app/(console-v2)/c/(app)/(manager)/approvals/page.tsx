"use client";

// ============================================================================
// console_v2 item 10 — Approvals (v35 dark-glass rebuild). The SIGNING FOLDER /
// decision room: "Kivo proposes → you approve → it's applied via an audited path.
// Nothing auto-applies." Composed from the kit (shell #362), laid out as the
// design's 3-column pipeline (WAITING FOR YOU → IN MOTION → MEASURED).
//
// ONE lane is wired today: the Menu lane = Knowledge's GATED tier. Every
// price/description/zone edit filed there lands here as a `proposed` request; a
// manager approves/rejects; on APPLY the server writes the truth ONLY through the
// audited helpers and re-reads to confirm (/api/knowledge/change-requests/[id]).
// The exact diff (current → proposed), the requester, and the honest state at
// every step — including a failed apply (stays approved, shows the error,
// retryable) — all survive the reskin.
//
// Colour law (ratified §6): proposed=BLUE · approved=EMERALD · executed=SLATE ·
// measured=GOLD. Conflict would be amber. RED stays safety-only → NOTHING here is
// red. The Decision-Layer module proposers (Growth/CX/Ops) + the IN-MOTION
// execution + MEASURED delta engines don't exist yet → rendered SOON, full
// pipeline chrome, never faked. XSS: dictionary text nodes + <Bdi>/<Num> only.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Send, Sparkles, ShieldCheck, Rocket, Trophy, X, Settings, SlidersHorizontal, Coins } from "lucide-react";
import {
  HeaderRow, PageGrid, Panel, SectionHeader, StatTile, TruthChip, AuroraDrawer, MiniModal, Toasts, pushToast,
} from "@/components/console-v2/kit";
import { useRestaurantStore } from "@/lib/store";
import { useT } from "@/lib/i18n/lang";
import { Bdi, Num } from "@/components/kivo";
import type { DictKey } from "@/lib/i18n/dictionary";

type Status = "proposed" | "approved" | "rejected" | "applied";
type TargetType = "menu_item" | "delivery_zone" | "policy";
interface ChangeRequest {
  id: string; status: Status; target_type: TargetType; target_id: string | null; target_label: string | null;
  field: string; old_value: unknown; new_value: unknown; requested_by: string | null; created_at: string;
  reviewed_at: string | null; applied_at: string | null; reason: string | null; apply_error: string | null;
}

const FIELD_LABEL: Record<string, DictKey> = {
  price: "ap.field.price", description: "ap.field.description", deliveryFee: "ap.field.deliveryFee",
  name: "ap.field.name", active: "ap.field.active",
};
const TYPE_LABEL: Record<TargetType, DictKey> = {
  menu_item: "ap.type.menu_item", delivery_zone: "ap.type.delivery_zone", policy: "ap.type.policy",
};
const NUMERIC_FIELDS = new Set(["price", "deliveryFee"]);

// §6 identity colours — proposed=blue, approved=emerald, executed(applied)=slate, rejected=slate.
const STATUS_ACCENT: Record<Status, string> = { proposed: "#4b8bff", approved: "#2ecc9a", applied: "#9aa7b8", rejected: "#66748a" };
const STATUS_LABEL: Record<Status, DictKey> = { proposed: "ap.status.proposed", approved: "ap.status.approved", applied: "ap.status.applied", rejected: "ap.status.rejected" };

const MODULES: { key: string; labelKey: DictKey }[] = [
  { key: "all", labelKey: "ap.mod.all" }, { key: "growth", labelKey: "ap.mod.growth" },
  { key: "menu", labelKey: "ap.mod.menu" }, { key: "cx", labelKey: "ap.mod.cx" }, { key: "ops", labelKey: "ap.mod.ops" },
];

export default function ApprovalsPage() {
  const t = useT();
  const currency = useRestaurantStore((s) => s.profile.currency);
  const [reqs, setReqs] = useState<ChangeRequest[] | null>(null);
  const [error, setError] = useState(false);
  const [mod, setMod] = useState("all");
  const [evidence, setEvidence] = useState<ChangeRequest | null>(null);
  const [modal, setModal] = useState<null | "kill" | "mc" | "rules" | "cost">(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/knowledge/change-requests", { credentials: "include" });
      if (!r.ok) { setError(true); return; }
      const d = (await r.json()) as { requests?: ChangeRequest[] };
      setReqs(d.requests ?? []); setError(false);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c = { proposed: 0, approved: 0, applied: 0, rejected: 0 };
    for (const r of reqs ?? []) c[r.status]++;
    return c;
  }, [reqs]);

  // The real change-requests are ALL Menu-lane (Knowledge GATED tier). A non-Menu
  // module has no proposer engine yet → the lane renders SOON.
  const menuVisible = mod === "all" || mod === "menu";
  const all = reqs ?? [];
  const waiting = menuVisible ? all.filter((r) => r.status === "proposed") : [];
  const motion = menuVisible ? all.filter((r) => r.status === "approved") : [];
  const measured = menuVisible ? all.filter((r) => r.status === "applied" || r.status === "rejected") : [];

  return (
    <>
      <HeaderRow
        title={t("ap.title")}
        jobLine={t("ap.sub")}
        right={
          <>
            <div style={pillGroup}>
              {MODULES.map((m) => (
                <button key={m.key} onClick={() => setMod(m.key)} style={mod === m.key ? pillOn : pillOff}>{t(m.labelKey)}</button>
              ))}
            </div>
            <button onClick={() => setModal("kill")} style={{ ...killChip, cursor: "pointer" }} title={t("ap.kill.title")}><ShieldCheck size={12} /> {t("ap.autorun")}</button>
          </>
        }
      />

      <PageGrid
        context={
          <>
            <Panel>
              <SectionHeader icon={<ShieldCheck size={15} />} tier="blue" title={t("ap.pipeline")} sub={t("ap.approvalFirst")} />
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {/* WAITING = real proposed count (blue). IN MOTION = approved (emerald).
                    MEASURED = applied, but the measurement engine is SOON → gather. */}
                <StatTile tier="blue" label={t("ap.col.waiting")} value={<Num>{counts.proposed}</Num>} fact={t("ap.col.waitingSub")} />
                <StatTile tier="green" label={t("ap.col.motion")} value={<Num>{counts.approved}</Num>} fact={t("ap.status.approved")} />
                {/* FR-008 — rejected count (was computed but never shown). Slate/muted
                    per §6 (rejected=slate), not a vivid alarm tile. */}
                <div style={gatherTileBox}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <XCircle size={13} color="var(--faint)" />
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--txt)", flex: 1 }}>{t("ap.status.rejected")}</span>
                    <span style={{ fontSize: 17, fontWeight: 900, color: "var(--dim)", fontFamily: "var(--kvx-font-ui)" }}><Num>{counts.rejected}</Num></span>
                  </div>
                </div>
                <div style={gatherTileBox}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Trophy size={14} color="var(--gold)" />
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--txt)", flex: 1 }}>{t("ap.col.measured")}</span>
                    <TruthChip state="gather" />
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.6 }}>{t("ap.measuredSoon")}</div>
                </div>
              </div>
              <p style={doctrineCard}>{t("ap.how")}</p>
              <div style={{ marginTop: 10, fontSize: 10.5, color: "var(--faint)", lineHeight: 1.6 }}>{t("ap.streakSoon")}</div>
            </Panel>

            {/* Decision Layer — module proposers with no backend → honest SOON.
                The config surfaces (ovMC/ovRules/ovCost) render their designed
                modal chrome in SOON, opened from these controls. */}
            <Panel>
              <SectionHeader icon={<Sparkles size={15} />} tier="violet" title={t("ap.decisionLayer")} sub={t("ap.menuLaneNote")} right={<TruthChip state="soon" />} />
              <div style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.7, marginBottom: 10 }}>{t("ap.decisionSoon")}</div>
              <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".1em", color: "var(--faint)", textTransform: "uppercase", marginBottom: 7 }}>{t("ap.decisionCtrls")}</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <button onClick={() => setModal("mc")} style={ctrlBtn}><Settings size={12} /> {t("ap.configure")}</button>
                <button onClick={() => setModal("rules")} style={ctrlBtn}><SlidersHorizontal size={12} /> {t("ap.rulesBtn")}</button>
                <button onClick={() => setModal("cost")} style={ctrlBtn}><Coins size={12} /> {t("ap.costPolicy")}</button>
              </div>
            </Panel>
          </>
        }
        hero={
          <Panel style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <SectionHeader icon={<ShieldCheck size={15} />} tier="blue" title={t("ap.title")} sub={t("ap.how")} right={reqs === null ? <TruthChip state="gather" /> : <TruthChip state="live" />} />

            {error ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><TruthChip state="gather" /><span style={{ fontSize: 12, color: "var(--faint)" }}>{t("ap.loadError")}</span></div>
            ) : (
              <div style={boardGrid}>
                {/* Column 1 — WAITING FOR YOU (proposed, real). */}
                <PipeCol icon={<ShieldCheck size={14} />} title={t("ap.col.waiting")} accent="#4b8bff" n={waiting.length}>
                  {reqs === null ? null : waiting.length === 0 ? <ApprovalAnatomy /> : waiting.map((r) => (
                    <RequestCard key={r.id} req={r} currency={currency} onChanged={load} onEvidence={() => setEvidence(r)} />
                  ))}
                </PipeCol>

                {/* Column 2 — IN MOTION (approved = signed, awaiting audited apply). */}
                <PipeCol icon={<Rocket size={14} />} title={t("ap.col.motion")} accent="#2ecc9a" n={motion.length}>
                  {reqs === null ? null : motion.length === 0 ? <ColSoon body={t("ap.motionSoon")} /> : motion.map((r) => (
                    <RequestCard key={r.id} req={r} currency={currency} onChanged={load} onEvidence={() => setEvidence(r)} />
                  ))}
                </PipeCol>

                {/* Column 3 — MEASURED (executed history; the delta engine is SOON). */}
                <PipeCol icon={<Trophy size={14} />} title={t("ap.col.measured")} accent="#ffd47e" n={measured.length}>
                  {reqs === null ? null : (
                    <>
                      {measured.map((r) => (
                        <RequestCard key={r.id} req={r} currency={currency} onChanged={load} onEvidence={() => setEvidence(r)} />
                      ))}
                      <ColSoon body={t("ap.measuredSoon")} />
                    </>
                  )}
                </PipeCol>
              </div>
            )}
          </Panel>
        }
      />

      {/* Evidence drawer — the diff + audit trail for one request. */}
      <AuroraDrawer open={!!evidence} onClose={() => setEvidence(null)}>
        {evidence && <EvidenceBody req={evidence} currency={currency} onClose={() => setEvidence(null)} />}
      </AuroraDrawer>

      {/* ovKill — global kill switch (owner-only). Auto-run is already OFF (law);
          the global Karim kill wires with the execution engine → SOON. */}
      <SoonModal open={modal === "kill"} onClose={() => setModal(null)} icon={<ShieldCheck size={16} />} title={t("ap.kill.title")} body={t("ap.kill.body")} />
      {/* ovMC — module configuration → SOON. */}
      <SoonModal open={modal === "mc"} onClose={() => setModal(null)} icon={<Settings size={16} />} title={t("ap.mc.title")} body={t("ap.mc.body")} />
      {/* ovRules — module rules editor → SOON. */}
      <SoonModal open={modal === "rules"} onClose={() => setModal(null)} icon={<SlidersHorizontal size={16} />} title={t("ap.rules.title")} body={t("ap.rules.body")} />
      {/* ovCost — cost-input policy for budgeted proposals → SOON. */}
      <MiniModal open={modal === "cost"} onClose={() => setModal(null)}>
        <ModalHead icon={<Coins size={16} />} title={t("ap.cost.title")} state="soon" onClose={() => setModal(null)} />
        <p style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.85 }}>{t("ap.cost.body")}</p>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 12, opacity: 0.6 }}>
          <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".08em", color: "var(--faint)", textTransform: "uppercase" }}>{t("ap.cost.input")} ({currency})</span>
          <input disabled inputMode="decimal" placeholder="—" style={{ height: 38, borderRadius: 11, border: "1px solid var(--stroke)", background: "var(--inset2)", padding: "0 12px", fontSize: 13, color: "var(--txt)", outline: "none" }} />
        </label>
        <p style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 12, textAlign: "center" }}>{t("ap.soonHint")}</p>
      </MiniModal>

      <Toasts />
    </>
  );
}

// ---------------------------------------------------------------------------
function PipeCol({ icon, title, accent, n, children }: { icon: React.ReactNode; title: string; accent: string; n: number; children: React.ReactNode }) {
  return (
    <div style={colBox}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: accent, display: "inline-flex" }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", color: accent, flex: 1 }}>{title}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--faint)" }}><Num>{n}</Num></span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", minHeight: 0 }}>{children}</div>
    </div>
  );
}
// Empty WAITING column — TEACH THE WORKFLOW. A label-only blueprint of what an
// approval is (proposed → evidence → impact → decision), so the operator learns
// the shape before the first request arrives. Strictly the four labeled slots +
// an empty "—" marker — NO fabricated example (no fake item / price / requester).
// Blue template accent = the proposed lane's §6 identity; nothing red.
const ANATOMY: readonly DictKey[] = ["ap.anat.proposed", "ap.anat.evidence", "ap.anat.impact", "ap.anat.decision"];
function ApprovalAnatomy() {
  const t = useT();
  return (
    <div style={anatCard}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 11 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--txt)" }}>{t("ap.anat.title")}</span>
        <span style={{ fontSize: 9.5, color: "var(--faint)", lineHeight: 1.5 }}>{t("ap.anat.sub")}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ANATOMY.map((k, i) => (
          <div key={k} style={anatSlot}>
            <span style={anatStep}><Num>{i + 1}</Num></span>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--dim)", flex: 1 }}>{t(k)}</span>
            <span aria-hidden style={{ fontSize: 13, fontWeight: 900, color: "var(--faint)", lineHeight: 1 }}>—</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 11, textAlign: "center" }}>{t("ap.emptyPending")}</div>
    </div>
  );
}
function ColSoon({ body }: { body: string }) {
  return (
    <div style={{ border: "1px dashed var(--stroke2)", borderRadius: 12, background: "var(--inset)", padding: "12px 13px", display: "flex", flexDirection: "column", gap: 7 }}>
      <TruthChip state="soon" />
      <span style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.6 }}>{body}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
function RequestCard({ req, currency, onChanged, onEvidence }: { req: ChangeRequest; currency: string; onChanged: () => Promise<void>; onEvidence: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function act(action: "approve" | "reject" | "apply") {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/knowledge/change-requests/${req.id}`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "reject" ? { action, reason } : { action }),
      });
      if (!r.ok) { pushToast(action === "apply" ? t("ap.applyError") : t("ap.reviewError"), "amber"); return; }
      setRejecting(false); setReason("");
      if (action === "apply") pushToast(t("ap.appliedMsg"), "ok");
      await onChanged();
    } catch { pushToast(action === "apply" ? t("ap.applyError") : t("ap.reviewError"), "amber"); }
    finally { setBusy(false); }
  }

  const fieldLabel = FIELD_LABEL[req.field] ? t(FIELD_LABEL[req.field]) : req.field;
  const accent = STATUS_ACCENT[req.status];

  return (
    <div style={{ ...cardBox, borderInlineStart: `3px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={typeChip}>{t(TYPE_LABEL[req.target_type])}</span>
        {req.target_label && <span onClick={onEvidence} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onEvidence(); }} style={{ fontSize: 12.5, fontWeight: 800, color: "var(--txt)", cursor: "pointer" }}><Bdi>{req.target_label}</Bdi></span>}
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)" }}>· {fieldLabel}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, fontWeight: 800, color: accent, background: `${accent}22`, borderRadius: 99, padding: "4px 10px" }}>{t(STATUS_LABEL[req.status])}</span>
      </div>

      {/* The diff — current → proposed. */}
      <div style={diffBox}>
        <ValueBlock label={t("ap.from")} value={req.old_value} field={req.field} currency={currency} muted />
        <span style={{ color: "var(--faint)", fontWeight: 800 }}>→</span>
        <ValueBlock label={t("ap.to")} value={req.new_value} field={req.field} currency={currency} />
      </div>

      {req.status === "approved" && !req.apply_error && <div style={{ fontSize: 11, color: "#5fe0b0", fontWeight: 700, marginTop: 8 }}>{t("ap.awaitingApply")}</div>}
      {req.apply_error && <div style={{ fontSize: 11, color: "var(--coral)", fontWeight: 700, marginTop: 8 }}>{t("ap.applyError")}</div>}
      {req.status === "rejected" && req.reason && <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}><Bdi>{req.reason}</Bdi></div>}

      {/* Actions */}
      {req.status === "proposed" && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => act("approve")} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}><CheckCircle2 size={14} /> {t("ap.approve")}</button>
          <button onClick={() => setRejecting(true)} disabled={busy} style={ghostBtn}><XCircle size={14} /> {t("ap.reject")}</button>
        </div>
      )}
      {/* ovVeto — reject-with-reason modal (real). */}
      <MiniModal open={rejecting} onClose={() => { setRejecting(false); setReason(""); }}>
        <ModalHead icon={<XCircle size={16} />} title={t("ap.veto.title")} onClose={() => { setRejecting(false); setReason(""); }} />
        <div style={{ ...diffBox, marginBottom: 12 }}>
          {req.target_label && <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--txt)" }}><Bdi>{req.target_label}</Bdi></span>}
          <span style={{ fontSize: 11, color: "var(--faint)" }}>· {fieldLabel}</span>
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("ap.rejectReason")} dir="rtl" style={{ ...reasonInput, width: "100%", marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => act("reject")} disabled={busy} style={{ ...primaryBtn, background: "var(--inset)", color: "#ffb3a8", border: "1px solid rgba(255,107,94,.4)", opacity: busy ? 0.5 : 1 }}>{t("ap.confirmReject")}</button>
          <button onClick={() => { setRejecting(false); setReason(""); }} disabled={busy} style={ghostBtn}>{t("ap.cancel")}</button>
        </div>
      </MiniModal>
      {req.status === "approved" && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => act("apply")} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}><Send size={14} /> {busy ? t("ap.busy") : t("ap.apply")}</button>
        </div>
      )}
      {req.status === "applied" && <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 700, marginTop: 8 }}>{t("ap.appliedMsg")}</div>}
    </div>
  );
}

function ValueBlock({ label, value, field, currency, muted }: { label: string; value: unknown; field: string; currency: string; muted?: boolean }) {
  const t = useT();
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: "var(--faint)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: muted ? "var(--dim)" : "var(--txt)" }}>
        {value == null || value === "" ? <span style={{ color: "var(--faint)" }}>—</span>
          : typeof value === "boolean" ? (value ? t("ap.on") : t("ap.off"))
          : NUMERIC_FIELDS.has(field) && typeof value === "number" ? <span><Num>{value.toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--dim)" }}>{currency}</span></span>
          : <Bdi>{String(value)}</Bdi>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function EvidenceBody({ req, currency, onClose }: { req: ChangeRequest; currency: string; onClose: () => void }) {
  const t = useT();
  const fieldLabel = FIELD_LABEL[req.field] ? t(FIELD_LABEL[req.field]) : req.field;
  const accent = STATUS_ACCENT[req.status];
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--txt)" }}>{t("ap.evidence")} · {req.target_label ? <Bdi>{req.target_label}</Bdi> : t(TYPE_LABEL[req.target_type])}</div>
          <div style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 3 }}>{t(TYPE_LABEL[req.target_type])} · {fieldLabel}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: accent, background: `${accent}22`, borderRadius: 99, padding: "4px 10px" }}>{t(STATUS_LABEL[req.status])}</span>
        <button onClick={onClose} aria-label={t("a11y.close")} style={drawerX}><X size={15} /></button>
      </div>
      <div style={{ ...diffBox, marginBottom: 14 }}>
        <ValueBlock label={t("ap.from")} value={req.old_value} field={req.field} currency={currency} muted />
        <span style={{ color: "var(--faint)", fontWeight: 800 }}>→</span>
        <ValueBlock label={t("ap.to")} value={req.new_value} field={req.field} currency={currency} />
      </div>
      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".1em", color: "var(--faint)", textTransform: "uppercase", marginBottom: 8 }}>{t("ap.evidence")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {req.requested_by && <AuditRow label={t("ap.requestedBy")} value={<Bdi>{req.requested_by}</Bdi>} />}
        <AuditRow label={t("ap.status.proposed")} value={<Bdi>{fmt(req.created_at)}</Bdi>} />
        {req.reviewed_at && <AuditRow label={t("ap.status.approved")} value={<Bdi>{fmt(req.reviewed_at)}</Bdi>} />}
        {req.applied_at && <AuditRow label={t("ap.status.applied")} value={<Bdi>{fmt(req.applied_at)}</Bdi>} />}
        {req.apply_error && <div style={{ fontSize: 11, color: "var(--coral)", fontWeight: 700 }}>{t("ap.applyError")}</div>}
      </div>
    </>
  );
}
function AuditRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 10, padding: "8px 12px" }}>
      <span style={{ fontSize: 11, color: "var(--faint)", flex: 1 }}>{label}</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--txt)" }}>{value}</span>
    </div>
  );
}
function fmt(iso: string): string {
  try { return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

// ---------------------------------------------------------------------------
function ModalHead({ icon, title, state, onClose }: { icon: React.ReactNode; title: string; state?: "soon"; onClose: () => void }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <span style={{ color: "var(--dim)", display: "inline-flex" }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--txt)", flex: 1 }}>{title}</span>
      {state === "soon" && <TruthChip state="soon" />}
      <button onClick={onClose} aria-label={t("a11y.close")} style={drawerX}><X size={15} /></button>
    </div>
  );
}
function SoonModal({ open, onClose, icon, title, body }: { open: boolean; onClose: () => void; icon: React.ReactNode; title: string; body: string }) {
  const t = useT();
  return (
    <MiniModal open={open} onClose={onClose}>
      <ModalHead icon={icon} title={title} state="soon" onClose={onClose} />
      <p style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.85 }}>{body}</p>
      <p style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 12, textAlign: "center" }}>{t("ap.soonHint")}</p>
    </MiniModal>
  );
}

// ---------------------------------------------------------------------------
const pillGroup: React.CSSProperties = { display: "flex", gap: 4, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: 3 };
const ctrlBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px", borderRadius: 10, border: "1px solid var(--stroke)", background: "var(--inset)", color: "var(--dim)", fontFamily: "var(--kvx-font-ar)", fontSize: 11, fontWeight: 700, cursor: "pointer" };
const pillOn: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: "var(--ink)", background: "var(--g-blue)", border: 0, borderRadius: 9, padding: "6px 11px", cursor: "pointer", fontFamily: "var(--kvx-font-ar)" };
const pillOff: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "var(--dim)", background: "transparent", border: 0, borderRadius: 9, padding: "6px 11px", cursor: "pointer", fontFamily: "var(--kvx-font-ar)" };
const killChip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 800, color: "#5fe0b0", background: "rgba(46,204,154,.1)", border: "1px solid rgba(46,204,154,.4)", borderRadius: 99, padding: "5px 11px", fontFamily: "var(--kvx-font-ar)" };
const gatherTileBox: React.CSSProperties = { background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 15, padding: 14 };
const doctrineCard: React.CSSProperties = { marginTop: 12, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "11px 13px", fontSize: 11, color: "var(--dim)", lineHeight: 1.8 };
const boardGrid: React.CSSProperties = { flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, minHeight: 0 };
const colBox: React.CSSProperties = { display: "flex", flexDirection: "column", minHeight: 0, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 12 };
const cardBox: React.CSSProperties = { border: "1px solid var(--stroke)", borderRadius: 13, background: "var(--panel)", padding: "13px 14px" };
const anatCard: React.CSSProperties = { border: "1px dashed rgba(75,139,255,.35)", borderInlineStart: "3px solid rgba(75,139,255,.5)", borderRadius: 13, background: "rgba(75,139,255,.04)", padding: "13px 14px" };
const anatSlot: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 10, padding: "9px 12px" };
const anatStep: React.CSSProperties = { width: 18, height: 18, borderRadius: 6, background: "rgba(75,139,255,.14)", border: "1px solid rgba(75,139,255,.3)", color: "#93d2ff", fontSize: 9.5, fontWeight: 900, display: "grid", placeItems: "center", flex: "none", fontFamily: "var(--kvx-font-ui)" };
const typeChip: React.CSSProperties = { fontSize: 9.5, fontWeight: 800, color: "var(--dim)", background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 6, padding: "3px 8px" };
const diffBox: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "10px 13px" };
const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 11, border: 0, background: "var(--g-green)", color: "var(--ink)", fontFamily: "var(--kvx-font-ar)", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 11, border: "1px solid var(--stroke)", background: "var(--inset)", color: "var(--dim)", fontFamily: "var(--kvx-font-ar)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
const reasonInput: React.CSSProperties = { flex: 1, minWidth: 140, height: 34, borderRadius: 10, border: "1px solid var(--stroke)", background: "var(--inset2)", padding: "0 11px", fontSize: 12, fontFamily: "var(--kvx-font-ar)", color: "var(--txt)", outline: "none" };
const drawerX: React.CSSProperties = { width: 30, height: 30, borderRadius: 10, background: "var(--inset)", border: "1px solid var(--stroke)", color: "var(--dim)", cursor: "pointer", display: "grid", placeItems: "center", flex: "none" };
