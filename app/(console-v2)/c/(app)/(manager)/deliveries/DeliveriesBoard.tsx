"use client";

// ============================================================================
// console_v2 — WO-DELIVERY-D3: التوصيل runs board (client). Dark-glass, RTL,
// Arabic-first. Three sections, gated INDEPENDENTLY by the props the server page
// resolved from the tenant flags: Active Runs + Unassigned Queue → delivery_runs;
// Zone Misses → delivery_geo_routing. Facts-plain. COLOR LAW: red is safety-only —
// the oldest-queue flag and a pending-COD chip are AMBER (operational caution),
// never red. Reads the D2 board endpoint; no business logic here.
// ============================================================================

import { useEffect, useState } from "react";
import { Truck, Package, MapPinOff, Clock, Banknote } from "lucide-react";
import { HeaderRow, Panel, SectionHeader } from "@/components/console-v2/kit";
import { useT } from "@/lib/i18n/lang";
import { Num } from "@/components/kivo";

interface BoardRunStop { status: string; stopOrder: number | null; area: string | null; codAmount: number; codCollected: boolean }
interface BoardRun { runId: string; driverName: string | null; status: string; createdAt: string; stopCount: number; stops: BoardRunStop[] }
interface BoardUnassigned { deliveryId: string; orderNumber: string | null; area: string | null; total: number | null; currency: string | null; createdAt: string }
interface BoardMisses { total: number; byArea: { area: string; count: number }[] }
interface BoardData { runsEnabled: boolean; geoEnabled: boolean; runs: BoardRun[] | null; unassigned: BoardUnassigned[] | null; misses: BoardMisses | null }

// Operational status tones. amber = alarm/late (failed), NEVER red (red = safety only).
const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  assigned: { label: "معيّن", bg: "rgba(255,255,255,.06)", fg: "var(--dim)" },
  picked_up: { label: "استلم", bg: "rgba(46,140,232,.14)", fg: "#8cc6f0" },
  on_the_way: { label: "في الطريق", bg: "rgba(46,140,232,.16)", fg: "#8cc6f0" },
  delivered: { label: "تم", bg: "rgba(46,204,154,.14)", fg: "#8ce8cc" },
  failed: { label: "مشكلة", bg: "rgba(232,180,90,.16)", fg: "#ffcf8d" },
  cancelled: { label: "ملغي", bg: "rgba(255,255,255,.05)", fg: "var(--faint)" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, bg: "rgba(255,255,255,.06)", fg: "var(--dim)" };
  return <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: s.bg, color: s.fg }}>{s.label}</span>;
}

export function DeliveriesBoard({ runsEnabled, geoEnabled }: { runsEnabled: boolean; geoEnabled: boolean }) {
  const t = useT();
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/deliveries/runs-board", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const runs = data?.runs ?? [];
  const queue = data?.unassigned ?? [];
  const misses = data?.misses ?? null;

  return (
    <>
      <HeaderRow title={<><Truck size={16} style={{ marginInlineEnd: 6 }} />{t("dlv.title")}</>} jobLine={t("dlv.sub")} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* ACTIVE RUNS — delivery_runs */}
        {runsEnabled && (
          <Panel>
            <SectionHeader icon={<Truck size={15} />} title={t("dlv.runs.title")} tier="blue" />
            {loading ? (
              <p style={{ fontSize: 12.5, color: "var(--dim)", margin: "10px 0 0" }}>…</p>
            ) : runs.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--dim)", margin: "10px 0 0" }}>{t("dlv.runs.empty")}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {runs.map((run) => (
                  <div key={run.runId} style={{ padding: 12, borderRadius: 12, background: "var(--inset2)", border: "1px solid var(--stroke)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--txt)" }}>{run.driverName || "—"}</span>
                      <span style={{ fontSize: 11, color: "var(--faint)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Package size={12} /> <Num>{run.stopCount}</Num> {t("dlv.runs.stops")}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {run.stops.map((s, i) => (
                        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 8, background: "rgba(255,255,255,.03)", border: "1px solid var(--stroke)" }}>
                          {s.area && <span style={{ fontSize: 10.5, color: "var(--dim)" }}>{s.area}</span>}
                          <StatusPill status={s.status} />
                          {s.codAmount > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 3, color: s.codCollected ? "#8ce8cc" : "#ffcf8d" }}>
                              <Banknote size={11} /> {s.codCollected ? t("dlv.cod.collected") : t("dlv.cod.pending")}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {/* UNASSIGNED QUEUE — delivery_runs. Oldest flagged AMBER (never red). */}
        {runsEnabled && (
          <Panel>
            <SectionHeader icon={<Clock size={15} />} title={t("dlv.queue.title")} tier="gold" />
            {loading ? (
              <p style={{ fontSize: 12.5, color: "var(--dim)", margin: "10px 0 0" }}>…</p>
            ) : queue.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--dim)", margin: "10px 0 0" }}>{t("dlv.queue.empty")}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {queue.map((d, i) => (
                  <div key={d.deliveryId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", borderRadius: 10, background: "var(--inset2)", border: "1px solid var(--stroke)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {i === 0 && (
                        <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 7px", borderRadius: 99, background: "rgba(232,180,90,.16)", color: "#ffcf8d" }}>{t("dlv.queue.oldest")}</span>
                      )}
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--txt)" }}>#{d.orderNumber ?? "—"}</span>
                      {d.area && <span style={{ fontSize: 11, color: "var(--dim)" }}>{d.area}</span>}
                    </div>
                    {d.total != null && (
                      <span style={{ fontSize: 11.5, color: "var(--faint)" }}><Num>{d.total}</Num> {d.currency ?? ""}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {/* ZONE MISSES — delivery_geo_routing. Plain facts (count + areas). */}
        {geoEnabled && (
          <Panel>
            <SectionHeader icon={<MapPinOff size={15} />} title={t("dlv.misses.title")} tier="coral" />
            {loading ? (
              <p style={{ fontSize: 12.5, color: "var(--dim)", margin: "10px 0 0" }}>…</p>
            ) : !misses || misses.total === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--dim)", margin: "10px 0 0" }}>{t("dlv.misses.empty")}</p>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--txt)" }}>
                  <Num>{misses.total}</Num> <span style={{ fontSize: 12, fontWeight: 600, color: "var(--faint)" }}>{t("dlv.misses.attempts")}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {misses.byArea.map((a, i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 8, background: "var(--inset2)", border: "1px solid var(--stroke)", fontSize: 11.5, color: "var(--dim)" }}>
                      {a.area} <b style={{ color: "var(--txt)" }}><Num>{a.count}</Num></b>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
