"use client";

// ============================================================================
// console_v2 item 10 — Approvals. The SIGNING FOLDER for knowledge change-requests.
// "Kivo proposes → you approve → it's applied via an audited path. Nothing auto-applies."
//
// This is the consumer of Knowledge's GATED tier: every price/description/zone edit
// filed there lands here as a `proposed` request. A manager approves or rejects; on
// APPLY the server writes the truth ONLY through the existing audited helpers and
// re-reads to confirm (see /api/knowledge/change-requests/[id]). The page shows the
// exact diff (current → proposed), the requester, and the honest state at every step —
// including a failed apply (stays approved, shows the error, retryable).
//
// Colour law: BRASS/AMBER for the signing folder (waiting/approved accents); red stays
// safety-only (nothing here is red). The Decision-Layer modules the mock shows
// (growth/pricing/campaign proposers) have no backend → rendered SOON, never faked.
// XSS: dictionary text nodes + <Bdi>/<Num> only.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Send, Sparkles } from "lucide-react";
import { TruthChip } from "@/components/console-v2";
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

export default function ApprovalsPage() {
  const t = useT();
  const currency = useRestaurantStore((s) => s.profile.currency);
  const [reqs, setReqs] = useState<ChangeRequest[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"pending" | "history">("pending");

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

  const list = useMemo(() => {
    const all = reqs ?? [];
    return tab === "pending"
      ? all.filter((r) => r.status === "proposed" || r.status === "approved")
      : all.filter((r) => r.status === "applied" || r.status === "rejected");
  }, [reqs, tab]);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: "0 0 6px" }}>{t("ap.title")}</h1>
          <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: 0, lineHeight: 1.7 }}>{t("ap.sub")}</p>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800, color: "#0A8A5F", background: "rgba(14,159,110,.12)", borderRadius: "var(--kv-r-pill)", padding: "6px 12px" }}>{t("ap.approvalFirst")}</span>
      </div>

      {/* Pipeline counts — real, from the list. Amber=waiting, blue=approved, emerald=applied, slate=rejected. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <CountTile label={t("ap.count.waiting")} n={counts.proposed} fg="#b9822a" bg="rgba(232,180,90,.14)" />
        <CountTile label={t("ap.count.approved")} n={counts.approved} fg="#3f7fe0" bg="rgba(75,139,255,.12)" />
        <CountTile label={t("ap.count.applied")} n={counts.applied} fg="#0A8A5F" bg="rgba(14,159,110,.12)" />
        <CountTile label={t("ap.count.rejected")} n={counts.rejected} fg="#6b7688" bg="rgba(154,167,184,.14)" />
      </div>

      {/* Doctrine */}
      <div style={{ border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)", background: "var(--kv-card-soft)", padding: "12px 16px", fontSize: 12.5, color: "var(--kv-muted)", lineHeight: 1.8 }}>{t("ap.how")}</div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 7 }}>
        <TabBtn active={tab === "pending"} onClick={() => setTab("pending")}>{t("ap.tab.pending")} · <Num>{counts.proposed + counts.approved}</Num></TabBtn>
        <TabBtn active={tab === "history"} onClick={() => setTab("history")}>{t("ap.tab.history")} · <Num>{counts.applied + counts.rejected}</Num></TabBtn>
      </div>

      {/* List */}
      {error ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><TruthChip state="gathering" /><span style={{ fontSize: 12.5, color: "var(--kv-faint)" }}>{t("ap.loadError")}</span></div>
      ) : reqs === null ? null : list.length === 0 ? (
        <EmptyLine>{tab === "pending" ? t("ap.emptyPending") : t("ap.emptyHistory")}</EmptyLine>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((r) => <RequestCard key={r.id} req={r} currency={currency} onChanged={load} />)}
        </div>
      )}

      {/* Decision Layer — the module proposers have no backend yet → honest SOON. */}
      <div style={{ border: "1px dashed rgba(100,116,139,.3)", borderRadius: "var(--kv-r-md-lg)", background: "var(--kv-card-soft)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "#a878f0", display: "inline-flex" }}><Sparkles size={16} /></span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--kv-muted)", flex: 1 }}>{t("ap.decisionLayer")}</span>
        <TruthChip state="soon" />
        <span style={{ fontSize: 11.5, color: "var(--kv-faint)" }}>{t("ap.decisionSoon")}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function RequestCard({ req, currency, onChanged }: { req: ChangeRequest; currency: string; onChanged: () => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function act(action: "approve" | "reject" | "apply") {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/knowledge/change-requests/${req.id}`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "reject" ? { action, reason } : { action }),
      });
      if (!r.ok) { setErr(action === "apply" ? t("ap.applyError") : t("ap.reviewError")); return; }
      setRejecting(false); setReason("");
      await onChanged();
    } catch { setErr(action === "apply" ? t("ap.applyError") : t("ap.reviewError")); }
    finally { setBusy(false); }
  }

  const fieldLabel = FIELD_LABEL[req.field] ? t(FIELD_LABEL[req.field]) : req.field;

  return (
    <div style={{ border: "1px solid var(--kv-border)", borderInlineStart: `3px solid ${STATUS_ACCENT[req.status]}`, borderRadius: "var(--kv-r-md-lg)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-card)", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--kv-muted)", background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: 6, padding: "3px 8px" }}>{t(TYPE_LABEL[req.target_type])}</span>
        {req.target_label && <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--kv-text)" }}><Bdi>{req.target_label}</Bdi></span>}
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-faint)" }}>· {fieldLabel}</span>
        <div style={{ flex: 1 }} />
        <StatusChip status={req.status} label={t(STATUS_LABEL[req.status])} />
      </div>

      {/* The diff — current → proposed. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md)", padding: "10px 13px" }}>
        <ValueBlock label={t("ap.from")} value={req.old_value} field={req.field} currency={currency} muted />
        <span style={{ color: "var(--kv-faint)", fontWeight: 800 }}>→</span>
        <ValueBlock label={t("ap.to")} value={req.new_value} field={req.field} currency={currency} />
      </div>

      {req.status === "approved" && !req.apply_error && (
        <div style={{ fontSize: 11.5, color: "#b9822a", fontWeight: 700, marginTop: 8 }}>{t("ap.awaitingApply")}</div>
      )}
      {req.apply_error && <div style={{ fontSize: 11.5, color: "var(--kv-amber)", fontWeight: 700, marginTop: 8 }}>{t("ap.applyError")}</div>}
      {req.status === "rejected" && req.reason && <div style={{ fontSize: 11.5, color: "var(--kv-faint)", marginTop: 8 }}><Bdi>{req.reason}</Bdi></div>}
      {err && <div style={{ fontSize: 11.5, color: "var(--kv-red)", fontWeight: 700, marginTop: 8 }}>{err}</div>}

      {/* Actions */}
      {req.status === "proposed" && !rejecting && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => act("approve")} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}><CheckCircle2 size={14} /> {t("ap.approve")}</button>
          <button onClick={() => setRejecting(true)} disabled={busy} style={ghostBtn}><XCircle size={14} /> {t("ap.reject")}</button>
        </div>
      )}
      {req.status === "proposed" && rejecting && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("ap.rejectReason")} dir="rtl"
            style={{ flex: 1, minWidth: 160, height: 34, borderRadius: "var(--kv-r-md-sm)", border: "1.5px solid var(--kv-border)", background: "var(--kv-card-soft)", padding: "0 11px", fontSize: 12.5, fontFamily: "var(--kv-font)", color: "var(--kv-text)" }} />
          <button onClick={() => act("reject")} disabled={busy} style={{ ...ghostBtn, color: "var(--kv-red)" }}>{t("ap.confirmReject")}</button>
          <button onClick={() => { setRejecting(false); setReason(""); }} disabled={busy} style={ghostBtn}>{t("ap.cancel")}</button>
        </div>
      )}
      {req.status === "approved" && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => act("apply")} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}><Send size={14} /> {busy ? t("ap.busy") : t("ap.apply")}</button>
        </div>
      )}
      {req.status === "applied" && <div style={{ fontSize: 11.5, color: "#0A8A5F", fontWeight: 700, marginTop: 8 }}>{t("ap.appliedMsg")}</div>}
    </div>
  );
}

function ValueBlock({ label, value, field, currency, muted }: { label: string; value: unknown; field: string; currency: string; muted?: boolean }) {
  const t = useT();
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--kv-faint)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: muted ? "var(--kv-muted)" : "var(--kv-text)" }}>
        {value == null || value === "" ? <span style={{ color: "var(--kv-faint)" }}>—</span>
          : typeof value === "boolean" ? (value ? t("ap.on") : t("ap.off"))
          : NUMERIC_FIELDS.has(field) && typeof value === "number" ? <span><Num>{value.toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--kv-muted)" }}>{currency}</span></span>
          : <Bdi>{String(value)}</Bdi>}
      </div>
    </div>
  );
}

const STATUS_ACCENT: Record<Status, string> = { proposed: "#e8b45a", approved: "#4b8bff", applied: "#0E9F6E", rejected: "#9aa7b8" };
const STATUS_LABEL: Record<Status, DictKey> = { proposed: "ap.status.proposed", approved: "ap.status.approved", applied: "ap.status.applied", rejected: "ap.status.rejected" };
function StatusChip({ status, label }: { status: Status; label: string }) {
  const c = STATUS_ACCENT[status];
  return <span style={{ fontSize: 10.5, fontWeight: 800, color: c, background: `${c}22`, borderRadius: "var(--kv-r-pill)", padding: "4px 10px" }}>{label}</span>;
}
function CountTile({ label, n, fg, bg }: { label: string; n: number; fg: string; bg: string }) {
  return (
    <div style={{ background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)", padding: "12px 14px" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: fg }}><Num>{n}</Num></div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--kv-muted)", marginTop: 2 }}>{label}</div>
      <div style={{ height: 3, borderRadius: 3, background: bg, marginTop: 8 }} />
    </div>
  );
}
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ height: 34, padding: "0 15px", borderRadius: "var(--kv-r-pill)", border: active ? 0 : "1px solid var(--kv-border)", background: active ? "var(--kv-grad-brand)" : "var(--kv-card)", color: active ? "#fff" : "var(--kv-muted)", fontFamily: "var(--kv-font)", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
      {children}
    </button>
  );
}
function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--kv-faint)", padding: "18px 6px", lineHeight: 1.7 }}>{children}</div>;
}
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 15px", borderRadius: "var(--kv-r-md-sm)", border: 0,
  background: "var(--kv-grad-brand)", color: "#fff", fontFamily: "var(--kv-font)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px", borderRadius: "var(--kv-r-md-sm)",
  border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontFamily: "var(--kv-font)",
  fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};
