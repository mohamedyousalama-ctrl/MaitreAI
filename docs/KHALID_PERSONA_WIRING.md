# Khalid persona wiring note (for the Core window)

**Purpose:** document how the Khalid persona layer + the KSA encyclopedia get selected and
injected, the **config shape**, and why **no schema change** is needed. This is the contract
between the persona window (owns the content: `lib/ai/personas/khalid.ts`, `/knowledge/ksa/`)
and the Core window (owns the single engine: `lib/ai/prompt.ts`, `lib/ai/customer-turn.ts`).
Nothing here is wired yet — the modules are pure leaves. This note is the wiring spec.

---

## 1. Principle (unchanged laws)

One engine, one guardrail set, one deterministic safety gate — for every persona. A persona is
a **prompt-level overlay only**, selected by tenant config, flag-gated, default OFF. The
encyclopedia is **market knowledge, never menu truth**. See `lib/ai/personas/README.md`.

## 2. Config shape (0012 pattern — no schema change)

Persona selection reuses the exact mechanism already in the codebase (0012 added
`agent_persona_name`; 0008 added `dialect`; `feature_flags` jsonb already carries per-tenant
flags read via `isFeatureExplicitlyEnabled`). **No new column is required.**

| config | where it lives | example | notes |
|---|---|---|---|
| dialect | `restaurants.dialect` (0008) | `"saudi"` | already selects the Saudi voice |
| persona name | `restaurants.agent_persona_name` (0012) | `"خالد"` | falls back to the dialect default in `prompt.ts` |
| persona flag | `restaurants.feature_flags.khalid_persona` (jsonb) | `false` | **default OFF**; gates the overlay |
| region | `restaurants.feature_flags.khalid_region` (jsonb) | `"najd"` | `najd`\|`hijaz`\|`asir`\|`eastern`; Najdi default via `resolveKsaRegion()` |
| cuisine tags | `restaurants.feature_flags.cuisine_tags` (jsonb) | `["najdi","hospitality"]` | selects the encyclopedia curated subset (V1) |

> Why `feature_flags` and not new columns: it's the established flag surface
> (`deterministic_allergen_safety`, `stateful_orders`, `cadence`, `standing_instructions` all
> live there and are read the same way). Region/tags are prompt-level knobs, not relational
> data — jsonb is the right home and keeps this a zero-migration change.

If a first-class column is ever preferred, `agent_persona_id text` (values `khalid_najdi` |
null) is the natural 0012-style addition — but it is **not needed for V1** and is explicitly
out of scope here.

## 3. Read path (mirrors the existing flag flow in `customer-turn.ts`)

`customer-turn.ts` already selects `feature_flags` and builds `BrainContext`. Add three fields,
exactly like `deterministicAllergenSafety`/`cadence` are done today (`customer-turn.ts:288–297`):

```ts
// in the BrainContext assembly (customer-turn.ts), additive:
khalidPersona: isFeatureExplicitlyEnabled("khalid_persona", tenantFeatures),   // default OFF
ksaRegion: resolveKsaRegion(
  typeof tenantFeatures?.khalid_region === "string" ? tenantFeatures.khalid_region : null
),
ksaCuisineTags: Array.isArray(tenantFeatures?.cuisine_tags) ? tenantFeatures.cuisine_tags : [],
```

`BrainContext` (in `prompt.ts`) gains the matching optional fields (all default-off safe):

```ts
khalidPersona?: boolean;     // when true, append the Khalid overlay
ksaRegion?: string;          // najd|hijaz|asir|eastern (resolved)
ksaCuisineTags?: string[];   // for the encyclopedia curated subset
```

## 4. Injection point (`prompt.ts`, additive, flag-gated)

At the end of `buildCustomerAgentSystemPrompt`, append the overlay when the flag is on — the
same "append a section only when the flag is on" shape the prompt already uses for
`buildStandingInstructionsSection(...)`:

```ts
import { buildKhalidPersonaLayer } from "@/lib/ai/personas/khalid";
// ...at the end of the returned template, additive:
${ctx.khalidPersona
  ? buildKhalidPersonaLayer({
      region: ctx.ksaRegion,
      personaName: ctx.personaName,          // tenant agent_persona_name (0012) or خالد
      restaurantName: ctx.profile.name,
    })
  : ""}
```

**Off → the prompt is byte-identical to today.** The overlay adds voice/hospitality only; every
guardrail, the money discipline, and the allergen gate are untouched and still win.

### Encyclopedia curated subset (V1)

Also additive and flag-gated (gate on `khalidPersona` or its own `ksa_encyclopedia` flag). V1 is
**not** open RAG — it selects a small subset of `/knowledge/ksa/` entries whose `cuisine_tags`
intersect `ctx.ksaCuisineTags`, renders a compact "market culture" block (a few entries max),
and appends it near the persona layer. A tiny pure selector (`selectKsaEntries(tags): Entry[]`)
belongs beside the pack; keep the injected block small to protect prompt size + cache. The
block is knowledge only — the engine's menu-truth rules still gate every recommendation.

## 5. Ordering & safety

- Append the persona overlay + encyclopedia block **after** the engine's character/guardrail
  sections and **before/around** the restaurant-data block — never between a guardrail and its
  data. The overlay must not be able to visually "reopen" a rule.
- The deterministic allergen INPUT gate (`detectAllergenAvoidance`) and OUTPUT guard run in
  `customer-turn.ts`/`respond.ts` **independently of any persona** — persona has zero effect on
  them. (KSA-dialect gate coverage is tracked separately in
  `docs/KSA_ALLERGEN_DIALECT_REVIEW.md`.)

## 6. Rollout

1. Land the persona layer + encyclopedia (pure leaves) — **done** (this window).
2. Core wiring PR: the additive reads (§3) + injection (§4), flag default OFF. Prompt unchanged
   for every existing tenant; `npm run test:unit` + `scripts/eval-scenarios.mjs` green.
3. Turn `khalid_persona: true` on the KSA dev tenant (`scripts/seed-demo-ksa-tenant.mjs`) and run
   `EVAL_MODE=ksa` (the Khalid golden evals) to prove the overlay end-to-end.
4. Per-tenant enablement for a real Saudi client is a config flip (propose→approve), no deploy.

## 7. Explicitly out of scope (no schema change)

No migration, no new table, no engine fork, no change to the guardrails, money math, or the
allergen gate. Persona = prompt-level, config-selected, flag-gated, default OFF.
