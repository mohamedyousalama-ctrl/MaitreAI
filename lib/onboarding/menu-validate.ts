// ============================================================================
// MaitreAI — Menu payload validation (pure, no I/O)
//
// Validates a structured menu payload before it is stored as a draft or
// published. All errors are collected and returned together so the caller
// can surface every problem in one response rather than one at a time.
//
// Allergen fields on items are INFORMATIONAL operator-entered data — they do
// not interact with the deterministic allergen gate (#87), which operates on
// customer message text independently.
// ============================================================================

export interface MenuChoiceOption {
  label: string;
  price_delta?: number;
  sort?: number;
}

export interface MenuChoiceGroup {
  name: string;
  min_select?: number;
  max_select?: number;
  sort?: number;
  options: MenuChoiceOption[];
}

export interface MenuVariant {
  name: string;
  price: number;
  sort?: number;
}

export interface MenuItemPayload {
  name: string;
  name_en?: string;
  description?: string;
  price: number;
  available?: boolean;
  ingredients?: string[];
  allergens?: string[];
  modifier_names?: string[];
  variants?: MenuVariant[];
  choice_groups?: MenuChoiceGroup[];
}

export interface MenuCategoryPayload {
  name: string;
  sort?: number;
  items: MenuItemPayload[];
}

export interface MenuModifier {
  name: string;
  price_impact?: number;
  category?: string;
}

export interface MenuPayload {
  categories: MenuCategoryPayload[];
  modifiers?: MenuModifier[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const MAX_CATEGORIES = 50;
const MAX_ITEMS = 500;
const MAX_VARIANTS_PER_ITEM = 20;
const MAX_CHOICE_GROUPS_PER_ITEM = 10;
const MAX_OPTIONS_PER_GROUP = 30;
const MAX_MODIFIERS = 100;

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && isFinite(v) && !isNaN(v);
}

export function validateMenuPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, errors: ["payload must be a JSON object"] };
  }
  const p = payload as Record<string, unknown>;

  if (!Array.isArray(p.categories)) {
    errors.push("categories must be an array");
    return { ok: false, errors };
  }
  if (p.categories.length === 0) {
    errors.push("categories must not be empty");
  }
  if (p.categories.length > MAX_CATEGORIES) {
    errors.push(`too many categories (max ${MAX_CATEGORIES})`);
  }

  let totalItems = 0;
  const modifierNames = new Set<string>();

  // Validate modifiers first so we can cross-check modifier_names on items.
  const mods = Array.isArray(p.modifiers) ? p.modifiers : [];
  if (mods.length > MAX_MODIFIERS) {
    errors.push(`too many modifiers (max ${MAX_MODIFIERS})`);
  }
  for (let mi = 0; mi < mods.length; mi++) {
    const mod = mods[mi] as Record<string, unknown>;
    const loc = `modifiers[${mi}]`;
    if (typeof mod.name !== "string" || !mod.name.trim()) {
      errors.push(`${loc}: name is required`);
    } else {
      modifierNames.add(mod.name.trim());
    }
    if (mod.price_impact !== undefined && !isFiniteNum(mod.price_impact)) {
      errors.push(`${loc}: price_impact must be a finite number`);
    }
  }

  // Validate categories + items.
  for (let ci = 0; ci < (p.categories as unknown[]).length; ci++) {
    const cat = (p.categories as unknown[])[ci] as Record<string, unknown>;
    const catLoc = `categories[${ci}]`;

    if (typeof cat.name !== "string" || !cat.name.trim()) {
      errors.push(`${catLoc}: name is required`);
    }
    if (cat.sort !== undefined && !isFiniteNum(cat.sort)) {
      errors.push(`${catLoc}: sort must be a number`);
    }

    if (!Array.isArray(cat.items)) {
      errors.push(`${catLoc}: items must be an array`);
      continue;
    }

    totalItems += (cat.items as unknown[]).length;
    if (totalItems > MAX_ITEMS) {
      errors.push(`too many items across all categories (max ${MAX_ITEMS})`);
      break;
    }

    for (let ii = 0; ii < (cat.items as unknown[]).length; ii++) {
      const item = (cat.items as unknown[])[ii] as Record<string, unknown>;
      const itemLoc = `${catLoc}.items[${ii}]`;

      if (typeof item.name !== "string" || !item.name.trim()) {
        errors.push(`${itemLoc}: name is required`);
      }
      // Price must be POSITIVE — 0/empty is rejected, not silently published. An
      // empty or Arabic-Indic-stripped input coerces to 0 upstream; catching it
      // here (and client-side) is the belt & suspenders against the fee-bug class.
      if (!isFiniteNum(item.price) || (item.price as number) <= 0) {
        errors.push(`${itemLoc}: price must be a positive finite number`);
      }
      if (item.available !== undefined && typeof item.available !== "boolean") {
        errors.push(`${itemLoc}: available must be boolean`);
      }

      // ingredients / allergens — must be string arrays if provided
      for (const field of ["ingredients", "allergens"] as const) {
        if (item[field] !== undefined) {
          if (!Array.isArray(item[field])) {
            errors.push(`${itemLoc}: ${field} must be an array`);
          } else {
            const arr = item[field] as unknown[];
            for (let ai = 0; ai < arr.length; ai++) {
              if (typeof arr[ai] !== "string") {
                errors.push(`${itemLoc}.${field}[${ai}]: must be a string`);
              }
            }
          }
        }
      }

      // modifier_names — must reference known modifiers
      if (item.modifier_names !== undefined) {
        if (!Array.isArray(item.modifier_names)) {
          errors.push(`${itemLoc}: modifier_names must be an array`);
        } else {
          for (const mn of item.modifier_names as unknown[]) {
            if (typeof mn !== "string") {
              errors.push(`${itemLoc}: modifier_names entries must be strings`);
            } else if (!modifierNames.has(mn)) {
              errors.push(`${itemLoc}: modifier_name "${mn}" not found in modifiers list`);
            }
          }
        }
      }

      // Variants
      if (item.variants !== undefined) {
        if (!Array.isArray(item.variants)) {
          errors.push(`${itemLoc}: variants must be an array`);
        } else {
          if ((item.variants as unknown[]).length > MAX_VARIANTS_PER_ITEM) {
            errors.push(`${itemLoc}: too many variants (max ${MAX_VARIANTS_PER_ITEM})`);
          }
          for (let vi = 0; vi < (item.variants as unknown[]).length; vi++) {
            const v = (item.variants as unknown[])[vi] as Record<string, unknown>;
            const vLoc = `${itemLoc}.variants[${vi}]`;
            if (typeof v.name !== "string" || !v.name.trim()) {
              errors.push(`${vLoc}: name is required`);
            }
            if (!isFiniteNum(v.price) || (v.price as number) < 0) {
              errors.push(`${vLoc}: price must be a non-negative finite number`);
            }
          }
        }
      }

      // Choice groups
      if (item.choice_groups !== undefined) {
        if (!Array.isArray(item.choice_groups)) {
          errors.push(`${itemLoc}: choice_groups must be an array`);
        } else {
          if ((item.choice_groups as unknown[]).length > MAX_CHOICE_GROUPS_PER_ITEM) {
            errors.push(`${itemLoc}: too many choice_groups (max ${MAX_CHOICE_GROUPS_PER_ITEM})`);
          }
          for (let gi = 0; gi < (item.choice_groups as unknown[]).length; gi++) {
            const g = (item.choice_groups as unknown[])[gi] as Record<string, unknown>;
            const gLoc = `${itemLoc}.choice_groups[${gi}]`;
            if (typeof g.name !== "string" || !g.name.trim()) {
              errors.push(`${gLoc}: name is required`);
            }
            const minSel = typeof g.min_select === "number" ? g.min_select : 1;
            const maxSel = typeof g.max_select === "number" ? g.max_select : 1;
            if (minSel < 0) errors.push(`${gLoc}: min_select must be >= 0`);
            if (maxSel < minSel) errors.push(`${gLoc}: max_select must be >= min_select`);
            if (!Array.isArray(g.options) || (g.options as unknown[]).length === 0) {
              errors.push(`${gLoc}: options must be a non-empty array`);
            } else {
              if ((g.options as unknown[]).length > MAX_OPTIONS_PER_GROUP) {
                errors.push(`${gLoc}: too many options (max ${MAX_OPTIONS_PER_GROUP})`);
              }
              for (let oi = 0; oi < (g.options as unknown[]).length; oi++) {
                const opt = (g.options as unknown[])[oi] as Record<string, unknown>;
                const oLoc = `${gLoc}.options[${oi}]`;
                if (typeof opt.label !== "string" || !opt.label.trim()) {
                  errors.push(`${oLoc}: label is required`);
                }
                if (opt.price_delta !== undefined && !isFiniteNum(opt.price_delta)) {
                  errors.push(`${oLoc}: price_delta must be a finite number`);
                }
              }
            }
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
