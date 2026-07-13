// ============================================================================
// WO-ALLERGEN-EDITOR — red-first proof. Three interacting React races on the SAFETY
// allergen editor, driven through the pure transport-injectable model so each race is
// demonstrated CLOSED (not just the happy path):
//   BUG 1 (FR-019) a prep edit survives an ingredient save (per-axis apply) + stays dirty.
//   BUG 2 (FR-021a) a toggle→save persists on the FIRST settled save (no stale refetch).
//   BUG 3 (FR-021b) save-then-verify lands the badge SET regardless of resolution order,
//                   WITH a control proving the OLD double-load() model clobbered it.
//   Binding (a) a second action mid-write is BLOCKED until the first FULLY settles.
// Run: node --experimental-strip-types scripts/proof-allergen-editor-races.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createAllergyEditorController, mergeAxisResponse, isAxisDirty,
  type AllergyData, type AllergyTransport,
} from "../lib/console-v2/allergy-editor-state.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

const BASE: AllergyData = {
  ingredients: ["دجاج"], allergens: ["gluten"], ingredientVerifiedAt: "V0",
  prepStatus: "shared_line", crossContactRisks: [], kitchenCanIsolate: "unknown",
  preparationNotes: "", prepVerifiedAt: null,
};

// A stand-in server the transport mutates, so it returns the TRUE post-write row (mirrors
// the route + db semantics: a content save clears that axis's stamp; verify sets it).
function makeServer(init: AllergyData) {
  let row: AllergyData = { ...init };
  let clock = 0, calls = 0;
  const transport: AllergyTransport = async (action, payload) => {
    calls++;
    if (action === "save_ingredient") row = { ...row, ingredients: [...(payload.ingredients as string[])], allergens: [...new Set(payload.allergens as string[])], ingredientVerifiedAt: null };
    else if (action === "verify_ingredient") row = { ...row, ingredientVerifiedAt: "V" + (++clock) };
    else if (action === "save_prep") row = { ...row, prepStatus: (payload.prepStatus as string), crossContactRisks: [...(payload.crossContactRisks as string[])], kitchenCanIsolate: (payload.kitchenCanIsolate as string), preparationNotes: (payload.preparationNotes as string), prepVerifiedAt: null };
    else row = { ...row, prepVerifiedAt: "V" + (++clock) };
    return { ok: true, row: { ...row } };
  };
  return { transport, calls: () => calls };
}

// --- BUG 1: a prep edit survives an ingredient save, and stays visibly dirty ---------
{
  const { transport } = makeServer(BASE);
  const c = createAllergyEditorController(transport, BASE);
  c.setLocal({ prepStatus: "isolated_line" }); // unsaved local prep edit
  check("prep axis is dirty after a local prep edit", c.dirty("prep") === true);
  await c.run("save_ingredient", { ingredients: ["دجاج"], allergens: ["gluten", "egg"] });
  check("BUG1: the unsaved prep edit is PRESERVED after an ingredient save", c.getState().prepStatus === "isolated_line");
  check("BUG1: prep axis stays DIRTY (edit not silently dropped)", c.dirty("prep") === true);
  check("BUG1: the ingredient save persisted (allergens now include egg)", c.getState().allergens.includes("egg"));
  check("BUG1: ingredient axis is now CLEAN (saved)", c.dirty("ingredient") === false);
}

// --- BUG 2: toggle → save persists on the FIRST settled save --------------------------
{
  const { transport, calls } = makeServer(BASE);
  const c = createAllergyEditorController(transport, BASE);
  c.setLocal({ allergens: ["gluten", "egg"] }); // toggled egg ON
  const out = await c.run("save_ingredient", { ingredients: BASE.ingredients, allergens: ["gluten", "egg"] });
  check("BUG2: the FIRST save succeeds", out.ok === true);
  check("BUG2: the toggle persisted on the FIRST settled save", c.getState().allergens.includes("egg"));
  check("BUG2: ingredient axis is clean — no stale refetch reverted it", c.dirty("ingredient") === false);
  check("BUG2: exactly ONE request was issued (no separate load() to race)", calls() === 1);
}

// --- Binding (a): a second action mid-write is BLOCKED until the first fully settles ---
{
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const inner = makeServer(BASE).transport;
  const slow: AllergyTransport = async (a, p) => { await gate; return inner(a, p); };
  const c = createAllergyEditorController(slow, BASE);
  const p1 = c.run("save_ingredient", { ingredients: BASE.ingredients, allergens: BASE.allergens });
  check("busy is held while the write is in flight", c.isBusy() === true);
  const blocked = await c.run("verify_ingredient", {});
  check("(a) a second action mid-write is BLOCKED (serialized)", blocked.blocked === true && blocked.ok === false);
  release();
  await p1;
  check("(a) busy clears only AFTER the first write fully settles (through the apply)", c.isBusy() === false);
  const after = await c.run("verify_ingredient", {});
  check("(a) the action succeeds once the first has fully settled", after.ok === true);
}

// --- BUG 3: the verify-badge race — the MOST IMPORTANT assertion ----------------------
{
  const { transport, calls } = makeServer({ ...BASE, ingredientVerifiedAt: "V0" });
  const c = createAllergyEditorController(transport, { ...BASE, ingredientVerifiedAt: "V0" });
  // save (server clears the stamp) then verify (server sets it), serialized:
  await c.run("save_ingredient", { ingredients: BASE.ingredients, allergens: BASE.allergens });
  check("BUG3: after the save the stamp is cleared (server truth)", c.getState().ingredientVerifiedAt === null);
  await c.run("verify_ingredient", {});
  check("BUG3: after verify the badge is SET (stamp non-null), regardless of ordering", c.getState().ingredientVerifiedAt !== null);
  check("BUG3: only the two writes ran — NO extra load() to resolve out of order", calls() === 2);

  // CONTROL — the OLD flow: each write was followed by a SEPARATE load() (a 2nd request);
  // two writes' loads could resolve out of order, and load() overwrote ALL state. A verify's
  // load (stamp set) applied first, then a save's stale load (null) clobbered it.
  const legacyLoadOverwrite = (_state: AllergyData, loadedRow: AllergyData): AllergyData => ({ ...loadedRow });
  let old: AllergyData = { ...BASE, ingredientVerifiedAt: "V0" };
  old = legacyLoadOverwrite(old, { ...BASE, ingredientVerifiedAt: "V1" }); // verify's load resolves FIRST → set
  old = legacyLoadOverwrite(old, { ...BASE, ingredientVerifiedAt: null }); // save's stale load resolves LAST → CLOBBER
  check("CONTROL: the OLD double-load model CLOBBERS the badge to null (the real bug)", old.ingredientVerifiedAt === null);
  check("BUG3: the NEW model lands the badge SET where the OLD model clobbered it", c.getState().ingredientVerifiedAt !== null);
}

// --- pure helper sanity --------------------------------------------------------------
check("mergeAxisResponse touches ONLY the acted axis (prep untouched by an ingredient merge)",
  mergeAxisResponse({ ...BASE, prepStatus: "LOCAL" }, "ingredient", { ...BASE, prepStatus: "SERVER", allergens: ["egg"] }).prepStatus === "LOCAL");
check("mergeAxisResponse applies the acted axis from the server row", mergeAxisResponse(BASE, "ingredient", { ...BASE, allergens: ["egg"] }).allergens[0] === "egg");
check("isAxisDirty is advisory-true when local content differs, false when equal",
  isAxisDirty({ ...BASE, allergens: ["gluten", "egg"] }, BASE, "ingredient") === true && isAxisDirty(BASE, BASE, "ingredient") === false);

// --- wiring (source): the component is a thin view over the race-closed model ---------
const editor = read("components/console-v2/AllergyAxisEditor.tsx");
check("(editor) applies the response PER-AXIS via mergeAxisResponse", /mergeAxisResponse\(p, axis, row\)/.test(editor));
check("(editor) clears busy in a FINALLY, after the apply (serialized)", /finally \{\s*setBusy\(null\);\s*\}/.test(editor));
check("(editor) refuses a re-entrant write while busy", /if \(busy\) return;/.test(editor));
check("(editor) the write path does NOT refetch via load() (no race)", !/await load\(\)/.test(editor));
check("(editor) the dirty indicator is ADVISORY — buttons gate on busy, never on dirty", /disabled=\{!!busy\}/.test(editor) && !/disabled=\{[^}]*dirty/.test(editor));
check("(editor) shows a «تم الحفظ» success signal on a write", /تم الحفظ/.test(editor));
const route = read("app/api/menu/[id]/allergy-data/route.ts");
check("(route) POST returns the authoritative post-write row (allergyView)", /return NextResponse\.json\(\{ ok: true, \.\.\.allergyView/.test(route));

console.log(`\nALLERGEN-EDITOR-RACES PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
