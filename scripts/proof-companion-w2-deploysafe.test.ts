// ============================================================================
// WO-COMPANION-W2 — DEPLOY-SAFE-against-0083-unapplied proof (the #409 standing
// verification point). Every new-column READ must tolerate a missing column, and
// every new-column WRITE must PROBE (42703) and degrade — never crash before the
// migration is applied. Source-asserted (the paths are DB-bound).
//
// Run: node --experimental-strip-types scripts/proof-companion-w2-deploysafe.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// ── READS — tolerant (select("*") + ?? defaults) ───────────────────────────
{
  const brain = read("lib/db/brain.ts");
  ok("brain: menu_items loaded via select(\"*\") (missing col simply absent)", /from\("menu_items"\)\.select\("\*"\)/.test(brain));
  ok("brain: axis-2 fields mapped with ?? fallbacks (no throw on missing)",
    /prepStatus: r\.prep_status \?\? null/.test(brain) &&
    /crossContactRisks: r\.cross_contact_risks \?\? \[\]/.test(brain) &&
    /prepVerifiedAt: r\.prep_verified_at \?\? null/.test(brain));
}

// ── WRITES — probe 42703 and degrade ───────────────────────────────────────
{
  const w = read("lib/db/menu-allergy-data.ts");
  ok("writer: has a 42703 undefined-column probe", /42703/.test(w) && /isColumnMissing/.test(w));
  ok("writer: savePrepAxis returns columnsMissing on a missing 0083 column",
    /savePrepAxis[\s\S]*isColumnMissing\(error\)[\s\S]*columnsMissing: true/.test(w));
  ok("writer: verifyPrepAxis also probes 42703", /verifyPrepAxis[\s\S]*isColumnMissing\(error\)[\s\S]*columnsMissing: true/.test(w));
  ok("writer: axis-1 (pre-0083 columns) needs no probe — always applicable", /saveIngredientAxis/.test(w));
}

// ── ROUTES — surface not_provisioned instead of crashing ────────────────────
{
  const editor = read("app/api/menu/[id]/allergy-data/route.ts");
  ok("editor route: columnsMissing → 409 not_provisioned", /res\.columnsMissing[\s\S]*not_provisioned[\s\S]*409/.test(editor));
  ok("editor route: GET reads via select(\"*\") (deploy-safe initial state)", /select\("\*"\)/.test(editor));
  const cov = read("app/api/onboarding/allergy-coverage/route.ts");
  ok("coverage route: reads menu_items via select(\"*\")", /from\("menu_items"\)\.select\("\*"\)/.test(cov));
}

// ── MIGRATION — PREPARE-ONLY + preserves ingredients on re-publish ──────────
{
  const mig = read("supabase/migrations/0083_allergy_companion_two_axis.sql");
  ok("0083: declared PREPARE-ONLY", /PREPARE-ONLY/.test(mig));
  ok("0083: adds the axis-2 columns additively (if not exists)", /add column if not exists prep_status/.test(mig) && /add column if not exists cross_contact_risks/.test(mig));
  ok("0083: publish_menu_draft PRESERVES ingredients on re-publish (nullif→coalesce)",
    /ingredients {2}= coalesce\([\s\S]*nullif\(array\(select jsonb_array_elements_text\(v_item->'ingredients'\)\)[\s\S]*ingredients\s*\n?\s*\)/.test(mig));
}

console.log(`\nWO-COMPANION-W2-DEPLOYSAFE PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
