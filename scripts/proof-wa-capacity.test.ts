// ============================================================================
// WO-6 proof — WhatsApp capacity: tier map, normalizers, remaining-est, and the
// best-effort send ledger. remaining_est is always an estimate we own.
//
// Run: node --conditions=react-server --import <tsx>/dist/loader.mjs \
//        scripts/proof-wa-capacity.test.ts
// ============================================================================

import {
  TIER_LIMITS,
  normalizeTier,
  tierLimit,
  normalizeQuality,
  computeRemaining,
  recordTemplateSend,
  countTemplateSends24h,
} from "../lib/messaging/capacity.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } }

function makeAdmin(opts: { count?: number; sink?: Record<string, unknown>[]; throwOnInsert?: boolean } = {}) {
  const sink = opts.sink ?? [];
  return {
    from(_t: string) {
      const q: Record<string, unknown> = {};
      q.insert = async (row: Record<string, unknown>) => {
        if (opts.throwOnInsert) throw new Error("boom");
        sink.push(row); return { error: null };
      };
      q.select = () => q;
      q.eq = () => q;
      q.gte = () => q;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ count: opts.count ?? 0, error: null });
      return q;
    },
  } as never;
}

async function run() {
  // ---- tier map / normalize -------------------------------------------------
  check("tier TIER_250 → 250", tierLimit("TIER_250") === 250);
  check("tier TIER_1K → 1000", tierLimit("TIER_1K") === 1000);
  check("tier TIER_100K → 100000", tierLimit("TIER_100K") === 100000);
  check("tier TIER_UNLIMITED → null", tierLimit("TIER_UNLIMITED") === null);
  check("tier unknown → null", tierLimit("TIER_WAT") === null);
  check("tier null → null", tierLimit(null) === null);
  check("normalizeTier '1k' → TIER_1K", normalizeTier("1k") === "TIER_1K");
  check("normalizeTier 'tier_250' → TIER_250", normalizeTier("tier_250") === "TIER_250");
  check("normalizeTier '' → null", normalizeTier("") === null);
  check("TIER_LIMITS has 6 tiers", Object.keys(TIER_LIMITS).length === 6);

  // ---- quality --------------------------------------------------------------
  check("quality GREEN → green", normalizeQuality("GREEN") === "green");
  check("quality red lower → red", normalizeQuality("red") === "red");
  check("quality junk → unknown", normalizeQuality("banana") === "unknown");
  check("quality null → unknown", normalizeQuality(null) === "unknown");

  // ---- remaining-est --------------------------------------------------------
  {
    const r = computeRemaining("TIER_1K", 300);
    check("remaining: 1000 − 300 = 700", r.tierLimit === 1000 && r.remainingEst === 700);
  }
  {
    const r = computeRemaining("TIER_250", 300);
    check("remaining: never negative (250 − 300 → 0)", r.remainingEst === 0);
  }
  {
    const r = computeRemaining("TIER_UNLIMITED", 5000);
    check("remaining: unlimited tier → null (no finite cap)", r.tierLimit === null && r.remainingEst === null);
  }
  {
    const r = computeRemaining(null, 10);
    check("remaining: unknown tier → null", r.remainingEst === null);
  }

  // ---- send ledger: best-effort ---------------------------------------------
  {
    const sink: Record<string, unknown>[] = [];
    await recordTemplateSend(makeAdmin({ sink }), "A", "order_status_update");
    check("recordTemplateSend writes one row", sink.length === 1 && sink[0].restaurant_id === "A" && sink[0].template_name === "order_status_update");
  }
  {
    const sink: Record<string, unknown>[] = [];
    await recordTemplateSend(null, "A", "x");
    check("recordTemplateSend null admin → no-op, no throw", sink.length === 0);
  }
  {
    let threw = false;
    try { await recordTemplateSend(makeAdmin({ throwOnInsert: true }), "A", "x"); } catch { threw = true; }
    check("recordTemplateSend swallows insert error (never throws)", threw === false);
  }
  {
    const n = await countTemplateSends24h(makeAdmin({ count: 42 }), "A");
    check("countTemplateSends24h returns the count", n === 42);
  }

  console.log(`\nWA-CAPACITY PROOF: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
run();
