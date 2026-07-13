// ============================================================================
// MaitreAI — WO-ALLERGEN-EDITOR: the allergy editor's state model (PURE, testable).
//
// The console_v2 two-axis allergy editor is a SAFETY surface, and three interacting
// React races (FR-019/FR-021) all traced to one thing: every write refetched the whole
// row and overwrote ALL local state, both axes, while the busy flag re-enabled the
// buttons mid-refetch. This module is the fix, extracted PURE so the red-first proof can
// drive the exact race sequences deterministically.
//
// The model (PM-ratified):
//   • SERVER-AUTHORITATIVE — a write's RESPONSE carries the post-write row; we apply it
//     directly. No separate load() → no second request to race.
//   • PER-AXIS apply — a write to one axis merges ONLY that axis's fields, leaving the
//     other axis's (possibly-unsaved) local edits intact → a prep edit can never be
//     clobbered by an ingredient save.
//   • SERIALIZED — a controller holds `busy` from the first keystroke of a write THROUGH
//     the response-apply (not just until fetch returns); a second action while busy is
//     refused, so two writes' applies can never interleave.
//   • The verify STAMP is authoritative from the response, so a save (stamp→null) and a
//     verify (stamp→set) can no longer desync the badge from server truth.
// ============================================================================

/** The editor's data shape — mirrors the GET/POST allergy-data projection. */
export interface AllergyData {
  ingredients: string[];
  allergens: string[];
  ingredientVerifiedAt: string | null;
  prepStatus: string | null;
  crossContactRisks: string[];
  kitchenCanIsolate: string | null;
  preparationNotes: string | null;
  prepVerifiedAt: string | null;
}

export type Axis = "ingredient" | "prep";
export type EditorAction = "save_ingredient" | "verify_ingredient" | "save_prep" | "verify_prep";

/** The fields each axis owns — the merge boundary that keeps the two axes independent. */
const INGREDIENT_FIELDS = ["ingredients", "allergens", "ingredientVerifiedAt"] as const;
const PREP_FIELDS = ["prepStatus", "crossContactRisks", "kitchenCanIsolate", "preparationNotes", "prepVerifiedAt"] as const;

export function axisOf(action: EditorAction): Axis {
  return action === "save_ingredient" || action === "verify_ingredient" ? "ingredient" : "prep";
}

/** Apply a post-write server row to ONE axis only: the acted axis takes the server's
 *  authoritative values; the OTHER axis keeps `current` (the user's local, possibly
 *  unsaved edits). This is what makes BUG 1's cross-axis clobber structurally impossible. */
export function mergeAxisResponse(current: AllergyData, axis: Axis, serverRow: AllergyData): AllergyData {
  const fields = axis === "ingredient" ? INGREDIENT_FIELDS : PREP_FIELDS;
  const next: AllergyData = { ...current };
  for (const f of fields) {
    // Copy only this axis's fields from the server row.
    (next as unknown as Record<string, unknown>)[f] = (serverRow as unknown as Record<string, unknown>)[f];
  }
  return next;
}

const sameSet = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
};

/** True when the acted axis's CONTENT (not its verify stamp) differs from the last
 *  server-applied baseline — drives the advisory «تغييرات غير محفوظة» indicator. It is
 *  ADVISORY only: it informs the operator an axis is unsaved; it never gates a save. */
export function isAxisDirty(current: AllergyData, baseline: AllergyData, axis: Axis): boolean {
  if (axis === "ingredient") {
    return !sameSet(current.ingredients, baseline.ingredients) || !sameSet(current.allergens, baseline.allergens);
  }
  return (
    current.prepStatus !== baseline.prepStatus ||
    !sameSet(current.crossContactRisks, baseline.crossContactRisks) ||
    current.kitchenCanIsolate !== baseline.kitchenCanIsolate ||
    (current.preparationNotes ?? "") !== (baseline.preparationNotes ?? "")
  );
}

/** The write transport (injectable so the proof can script timing/ordering). Returns the
 *  post-write row on success; `notProvisioned` maps the route's 409 (0083 columns not
 *  applied yet), `error` any other failure. */
export type AllergyTransport = (
  action: EditorAction,
  payload: Record<string, unknown>,
) => Promise<{ ok: boolean; row?: AllergyData; notProvisioned?: boolean; error?: string }>;

export interface RunOutcome {
  ok: boolean;
  /** True when the action was refused because another write was still settling (BUG 3
   *  serialization guard) — the caller should NOT treat this as a completed write. */
  blocked?: boolean;
  notProvisioned?: boolean;
  error?: string;
}

/** A tiny controller that owns the editor's authoritative state + baseline + busy flag.
 *  The React component is a thin view over this; the proof drives it directly. */
export function createAllergyEditorController(transport: AllergyTransport, initial: AllergyData) {
  let state: AllergyData = initial;
  let baseline: AllergyData = initial; // last server-applied values, per axis, for dirty-detection
  let busy: EditorAction | null = null;

  return {
    getState: (): AllergyData => state,
    getBaseline: (): AllergyData => baseline,
    isBusy: (): boolean => busy !== null,
    busyAction: (): EditorAction | null => busy,
    dirty: (axis: Axis): boolean => isAxisDirty(state, baseline, axis),
    /** Local, unsaved edits (chip toggle, select, notes). Never touches the baseline. */
    setLocal: (patch: Partial<AllergyData>): void => { state = { ...state, ...patch }; },

    /** Run ONE write end-to-end. SERIALIZED: refused (blocked) while another write is
     *  still settling — and `busy` is held THROUGH the response-apply (the finally runs
     *  after the try's merge), so a second action can't interleave the apply. */
    async run(action: EditorAction, payload: Record<string, unknown>): Promise<RunOutcome> {
      if (busy) return { ok: false, blocked: true };
      busy = action;
      try {
        const res = await transport(action, payload);
        if (res.notProvisioned) return { ok: false, notProvisioned: true };
        if (!res.ok || !res.row) return { ok: false, error: res.error ?? "write_failed" };
        const axis = axisOf(action);
        // Server-authoritative, per-axis: apply ONLY the acted axis from the response;
        // advance the baseline for that axis so its dirty indicator clears.
        state = mergeAxisResponse(state, axis, res.row);
        baseline = mergeAxisResponse(baseline, axis, res.row);
        return { ok: true };
      } finally {
        busy = null;
      }
    },
  };
}
