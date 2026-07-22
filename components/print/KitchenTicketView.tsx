// ============================================================================
// Kivo — Kitchen Ticket view (SERVER) — the shared, chromeless printable prep
// ticket. Rendered by BOTH the legacy /(console)/orders/[id]/ticket route and the
// console_v2 /c/orders/[id]/ticket route so there is ONE source of truth for the
// ticket (cutover-1 relocation: the surface moves under /c without duplicating a
// line, and the old route keeps working for flag-off tenants until cutover-2).
//
// Money-STRIPPED by design: NO prices/subtotal/total/collect-cash — the kitchen
// prepares food; cash figures belong on the receipt, not here.
//
// GATING (fail-closed, in order):
//  1. No resolved tenant        → 404 (notFound).
//  2. `kitchen_ticket` flag OFF  → 404 — the surface does not exist unless a tenant
//     explicitly opts in (default-OFF for everyone).
//  3. Order not in THIS tenant   → 404 (tenant isolation).
//
// The print itself is audited to `order_events` (type='ticket_printed') by the
// client PrintTicketButton via POST /api/orders/[id]/ticket-print.
// ============================================================================

import { notFound } from "next/navigation";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { loadReceiptData } from "@/lib/render/load";
import { PrintTicketButton } from "@/components/print/PrintTicketButton";

const { parseAllergyNote, buildAllergyNote } =
  require("../../lib/ai/allergen-companion.ts") as typeof import("../../lib/ai/allergen-companion");
const { canonicalizeAllergens } =
  require("../../lib/ai/allergen-canonical.ts") as typeof import("../../lib/ai/allergen-canonical");

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (s: string | number) => String(s).replace(/[0-9]/g, (d) => AR[+d]);

function fmt(dt?: string | number | null): string {
  if (dt == null) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

const SOURCE_AR: Record<string, string> = { whatsapp: "واتساب", web: "الموقع" };

export async function KitchenTicketView({ id, dark = false }: { id: string; dark?: boolean }) {
  const tenant = await getServerTenant();
  if (!tenant) notFound();

  const admin = createAdminClient();
  if (!admin) notFound();

  // Flag FIRST — default-OFF; off ⇒ the route does not exist for this tenant.
  const { data: rest } = await admin
    .from("restaurants")
    .select("feature_flags")
    .eq("id", tenant.restaurantId)
    .maybeSingle();
  const flags = (rest?.feature_flags as Record<string, unknown> | null) ?? null;
  if (!isFeatureExplicitlyEnabled("kitchen_ticket", flags)) notFound();

  // Tenant-scoped existence — a cross-tenant order id is a 404, not a leak.
  const { data: owned } = await admin
    .from("orders")
    .select("id")
    .eq("id", id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (!owned) notFound();

  const d = await loadReceiptData(admin, id);
  if (!d) notFound();

  const fulfillmentAr = d.fulfillment === "delivery" ? "توصيل" : "استلام من الفرع";
  const hasAllergyNote = !!(d.allergyNote && d.allergyNote.trim());
  const canonicalAllergyNote = buildAllergyNote(canonicalizeAllergens(parseAllergyNote(d.allergyNote)));

  return (
    <div
      dir="rtl"
      lang="ar"
      style={{
        minHeight: "100vh",
        overflowY: "auto",
        // Legacy route keeps the warm cream ground; the console_v2 route opts into
        // the dark misty-slate ground (same as the shell) so the white paper reads
        // as an intentional print PREVIEW, never a broken theme. The paper ticket
        // itself is untouched either way — a kitchen ticket prints black-on-white.
        ...(dark
          ? {
              color: "#f2f5f9",
              fontFamily: "var(--font-readex), system-ui, sans-serif",
              background: "#3a4149",
              backgroundImage:
                "radial-gradient(1200px 800px at 75% 10%,rgba(120,140,165,.5),transparent 60%)," +
                "radial-gradient(1000px 700px at 10% 90%,rgba(70,80,95,.55),transparent 55%)," +
                "linear-gradient(160deg,#4a525d 0%,#2e343d 55%,#232830 100%)",
            }
          : { background: "#efe9e2" }),
        padding: 24,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* console_v2 dark chrome only: a caption that frames the white paper as a
          print preview. Hidden in print (.kt-no-print). Legacy renders nothing. */}
      {dark ? (
        <div className="kt-no-print" style={{ width: "var(--kt-width, 80mm)", maxWidth: "100%", marginBottom: 12, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#f2f5f9" }}>تذكرة المطبخ</div>
          <div style={{ fontSize: 11, color: "#9aa7b8", marginTop: 3, lineHeight: 1.6 }}>معاينة — تُطبع بالأبيض والأسود على رول حراري ٥٨ / ٨٠ مم</div>
        </div>
      ) : null}
      {/* Print isolation + paper sizing. #kitchen-ticket is the ONLY visible node
          in print; the console shell + control bar are hidden. The printed width
          is governed by the element's own width (--kt-width, border-box) — NOT by
          `@page size`: there is no spec-valid token for fixed-width + auto-feed
          height, and pinning an explicit page height would eject blank thermal
          roll. So @page carries margins only; the roll width is the element's. */}
      <style>{`
        @page { margin: 3mm; }
        @media print {
          .kt-no-print { display: none !important; }
          body * { visibility: hidden !important; }
          #kitchen-ticket, #kitchen-ticket * { visibility: visible !important; }
          #kitchen-ticket {
            position: absolute; top: 0; right: 0; left: 0; margin: 0 auto;
            box-shadow: none !important; border-radius: 0 !important;
          }
        }
        #kitchen-ticket { --kt-width: 80mm; }
      `}</style>

      <div style={{ width: "var(--kt-width, 80mm)", maxWidth: "100%" }} className="kt-no-print">
        <PrintTicketButton orderId={id} dark={dark} />
      </div>

      <div
        id="kitchen-ticket"
        style={{
          width: "var(--kt-width, 80mm)",
          maxWidth: "100%",
          // border-box so the horizontal padding sits INSIDE the selected roll
          // width (58/80mm) instead of adding to it (which would overflow the roll).
          boxSizing: "border-box",
          background: "#fff",
          color: "#000",
          padding: "14px 16px",
          borderRadius: 10,
          boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
          fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif",
          lineHeight: 1.5,
        }}
      >
        {/* Header: restaurant + branch + printed / order time. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontSize: 17, fontWeight: 800 }}>{d.restaurantName || ""}</strong>
          {d.branchName ? <span style={{ fontSize: 13, color: "#444" }}>{d.branchName}</span> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#666", marginTop: 2 }}>
          <span>طُبع: {fmt(Date.now())}</span>
          {d.createdAt ? <span>الطلب: {fmt(d.createdAt)}</span> : null}
        </div>

        <hr style={{ border: 0, borderTop: "1.5px solid #000", margin: "10px 0" }} />

        {/* Order # (large) + fulfillment + source. NO money. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontSize: 26, fontWeight: 900 }}>طلب {toAr(d.orderNumber)}</strong>
          <strong style={{ fontSize: 17, fontWeight: 900 }}>{fulfillmentAr}</strong>
        </div>
        {d.source ? (
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>المصدر: {SOURCE_AR[d.source] ?? d.source}</div>
        ) : null}

        {/* Safety/allergy banner — prominent at the top when the linked
            conversation is held for review; else an explicit "no report" line so
            a blank is never misread as "safe". */}
        {d.safetyHold || hasAllergyNote ? (
          <div
            style={{
              margin: "10px 0",
              padding: "8px 10px",
              borderRadius: 8,
              background: "#fdecec",
              border: "2px solid #c0392b",
              color: "#a01b0b",
              fontWeight: 800,
              fontSize: 13.5,
              textAlign: "center",
            }}
          >
            ⚠️ حساسية — لا يتم التحضير قبل مراجعة المطعم
            {canonicalAllergyNote ? (
              <div style={{ marginTop: 4, fontSize: 15, fontWeight: 900 }}>{canonicalAllergyNote}</div>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "#0a7a33", fontWeight: 700, marginTop: 6 }}>لا يوجد بلاغ حساسية</div>
        )}

        <hr style={{ border: 0, borderTop: "1.5px solid #000", margin: "10px 0" }} />

        {/* Items — qty × name + options + per-item notes. No prices. */}
        <div>
          {d.items.length === 0 ? (
            <div style={{ fontSize: 13, color: "#a01b0b", fontWeight: 700 }}>⚠️ لا توجد أصناف على هذا الطلب</div>
          ) : (
            d.items.map((it, i) => {
              const opts = [it.variant, ...(it.choices ?? []), ...(it.modifiers ?? [])].filter(Boolean) as string[];
              return (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {toAr(it.quantity)}×&nbsp;&nbsp;{it.name}
                  </div>
                  {opts.length ? <div style={{ fontSize: 13, color: "#333" }}>+ {opts.join("، ")}</div> : null}
                  {it.notes ? <div style={{ fontSize: 13, fontWeight: 800 }}>ملاحظة: {it.notes}</div> : null}
                </div>
              );
            })
          )}
        </div>

        <hr style={{ border: 0, borderTop: "1.5px solid #000", margin: "10px 0" }} />

        {/* Delivery / customer context (routing + handoff only — never money). */}
        {d.fulfillment === "delivery" ? (
          d.address && d.address.trim() ? (
            <div style={{ fontSize: 14 }}>
              <strong style={{ fontWeight: 800 }}>العنوان:</strong> {d.address}
              {d.zoneName ? <div style={{ marginTop: 2 }}>المنطقة: {d.zoneName}</div> : null}
            </div>
          ) : (
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                background: "#fdecec",
                border: "2px solid #c0392b",
                color: "#a01b0b",
                fontWeight: 800,
                fontSize: 13,
                textAlign: "center",
              }}
            >
              ⚠️ العنوان ناقص — تواصل مع العميل
            </div>
          )
        ) : null}
        {d.customerName ? <div style={{ fontSize: 13, marginTop: 4 }}>العميل: {d.customerName}</div> : null}
        {d.customerPhone ? (
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
            الهاتف: <bdi dir="ltr">{toAr(d.customerPhone)}</bdi>
          </div>
        ) : d.fulfillment === "delivery" ? (
          <div style={{ fontSize: 13, color: "#a01b0b", fontWeight: 700, marginTop: 2 }}>⚠️ رقم الهاتف ناقص</div>
        ) : null}
        {d.driverName ? <div style={{ fontSize: 13, marginTop: 2 }}>المندوب: {d.driverName}</div> : null}
      </div>
    </div>
  );
}
