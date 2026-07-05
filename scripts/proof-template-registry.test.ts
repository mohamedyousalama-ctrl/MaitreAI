// ============================================================================
// WO-5 proof — template registry CATEGORY-TRUTH LAW + Meta mappers + upsert.
// Content decides category: a promotional body can NEVER be stored utility/auth.
//
// Run: node --conditions=react-server --import <tsx>/dist/loader.mjs \
//        scripts/proof-template-registry.test.ts
// ============================================================================

import {
  classifyPromotional,
  assertCategoryTruth,
  mapMetaCategory,
  mapMetaStatus,
  mapQualityRating,
  upsertTemplate,
} from "../lib/messaging/template-registry.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } }

// In-memory admin stub: records upserts so we can assert what was (not) written.
function makeAdmin(sink: Record<string, unknown>[]) {
  return {
    from(_t: string) {
      return {
        upsert: async (row: Record<string, unknown>) => { sink.push(row); return { error: null }; },
      };
    },
  } as never;
}

async function run() {
  // ---- classifyPromotional --------------------------------------------------
  check("promo AR: خصم detected", classifyPromotional("خصم 20% على طلبك").promotional);
  check("promo AR: عرض detected", classifyPromotional("عرض خاص اليوم").promotional);
  check("promo AR: اطلب الآن (nudge)", classifyPromotional("اطلب الآن قبل نفاد الكمية").promotional);
  check("promo EN: discount", classifyPromotional("Get 30% discount now").promotional);
  check("promo: bare percent ٥٠٪", classifyPromotional("وفّر ٥٠٪").promotional);
  check("utility AR: status update NOT promotional",
    !classifyPromotional("تحديث طلبك #123: الحالة الآن «قيد التحضير».").promotional);
  check("utility EN: OTP NOT promotional", !classifyPromotional("Your verification code is 4821").promotional);

  // ---- assertCategoryTruth (the LAW) ----------------------------------------
  {
    const r = assertCategoryTruth("utility", "عرض خصم 25% لفترة محدودة");
    check("LAW: promo as utility → refused", !r.ok && r.requiredCategory === "marketing" && (r.markers?.length ?? 0) > 0);
  }
  check("LAW: promo as marketing → ok", assertCategoryTruth("marketing", "خصم 25%").ok);
  check("LAW: promo as authentication → refused", !assertCategoryTruth("authentication", "اطلب الآن وخصم 10%").ok);
  check("LAW: non-promo as utility → ok", assertCategoryTruth("utility", "تحديث طلبك #12: جاهز").ok);
  check("LAW: non-promo as authentication → ok", assertCategoryTruth("authentication", "رمز التحقق 1234").ok);

  // ---- Meta mappers ---------------------------------------------------------
  check("map category MARKETING", mapMetaCategory("MARKETING") === "marketing");
  check("map category default→utility", mapMetaCategory("SOMETHING") === "utility");
  check("map status APPROVED", mapMetaStatus("APPROVED") === "approved");
  check("map status IN_APPEAL→pending", mapMetaStatus("IN_APPEAL") === "pending");
  check("map status DELETED→disabled", mapMetaStatus("DELETED") === "disabled");
  check("map status unknown", mapMetaStatus("WAT") === "unknown");
  check("map quality GREEN", mapQualityRating("GREEN") === "green");
  check("map quality unknown", mapQualityRating(null) === "unknown");

  // ---- upsertTemplate: LAW enforced BEFORE any DB write ----------------------
  {
    const sink: Record<string, unknown>[] = [];
    const r = await upsertTemplate(makeAdmin(sink), "A", {
      name: "flash_sale", category: "utility", bodyText: "خصم 40% اطلب الآن",
    });
    check("upsert promo-as-utility → refused, NO db write",
      !r.ok && (r as { error: string }).error === "category_truth_violation" && sink.length === 0);
  }
  {
    const sink: Record<string, unknown>[] = [];
    const r = await upsertTemplate(makeAdmin(sink), "A", {
      name: "flash_sale", category: "marketing", bodyText: "خصم 40% اطلب الآن",
    });
    check("upsert promo-as-marketing → stored", r.ok && sink.length === 1 && sink[0].category === "marketing");
  }
  {
    const sink: Record<string, unknown>[] = [];
    const r = await upsertTemplate(makeAdmin(sink), "A", {
      name: "order_status_update", category: "utility", bodyText: "تحديث طلبك #7: جاهز", fromSync: true,
    });
    check("upsert utility non-promo → stored + last_synced_at stamped",
      r.ok && sink.length === 1 && sink[0].category === "utility" && typeof sink[0].last_synced_at === "string");
  }
  {
    const sink: Record<string, unknown>[] = [];
    const r = await upsertTemplate(makeAdmin(sink), "A", { name: "  ", category: "utility", bodyText: "x" });
    check("upsert empty name → name_required, no write", !r.ok && sink.length === 0);
  }

  console.log(`\nTEMPLATE-REGISTRY PROOF: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
run();
