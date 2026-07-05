# Khalid persona playbooks

Behaviour playbooks that extend the Khalid persona layer (`khalid.ts`) with the masterplan
behaviours. Same **overlay discipline** as the base layer (see `README.md`): prompt-layer,
flag-gated behind `khalid_persona` (default OFF), versioned repo files, **no facts declared** —
everything defers to the one engine + one deterministic gate.

## Modules

| file | what |
|---|---|
| `khalid-playbooks.ts` | `buildKhalidPlaybooks(ctx)` → the playbooks overlay section (pure, standalone leaf) |
| `khalid-forbidden-claims.mjs` | `FORBIDDEN_CLAIMS` + `findForbiddenClaims(text)` — the exported, testable list |

The playbooks module is a **standalone leaf** (it mirrors the `KsaRegion` union locally and
imports nothing from `khalid.ts`), so this ships independently of the persona-layer PR. At
injection time the wiring appends `buildKhalidPlaybooks(...)` right after
`buildKhalidPersonaLayer(...)` when `khalid_persona` is on (see `docs/KHALID_PERSONA_WIRING.md`).

## The four playbooks

1. **Complaint recovery WITHIN policy** — read the mood, de-escalate once, resolve; **all
   compensation (refund/discount/replacement/goodwill) is Approvals-only** — offer a handoff and
   fire `escalate_to_human` on accept (engine §ESC), never self-authorize. Honest ETA as an
   estimate, never a fabricated arrival, never a background "I'll message you back".
2. **Ramadan behaviours** — rush cadence near iftar (fast, drop the nonessential upsell); a
   **bundle instinct that is MENU-TRUTH-GATED** exactly like gahwa↔dates (offer the iftar
   plate + drink + dates/sweet only if the tenant sells them); one light seasonal courtesy;
   honour real open state/hours.
3. **WhatsApp cadence** — **≤ 3 messages per turn** (usually one, taps over text); **split-recap
   pattern** (recap / price / allergy note / payment / final confirm are each one atomic
   message); **24-hour window respect** (only ever reply to an inbound; never initiate, never
   promise a later message); know when to stop.
4. **Forbidden claims** — the hard "never say" list, below.

## Forbidden claims (testable constant)

`FORBIDDEN_CLAIMS` (in `khalid-forbidden-claims.mjs`) is the single source of truth for claims
the persona must never make. Five classes, each an **assertion detector** (matches a claim being
*made*, not a topic being mentioned):

| id | never … |
|---|---|
| `allergen_safety` | certify an item is allergen-safe / "آمن" / nut-free / free-of-X (safety = the item's data + the deterministic gate) |
| `guaranteed_delivery` | guarantee a delivery/arrival time ("مضمون"/"أكيد" + a time); the zone ETA is an estimate you quote |
| `medical_suitability` | assert a food treats/cures/"is suitable for <patients>" |
| `invented_discount` | invent/gift/self-authorize a discount/refund/freebie (a real promo in the data is quoted, never created) |
| `competitor_attack` | attack, mock, or compare down another restaurant |

### Two consumers, one list (no drift)

- **`scripts/test-khalid-playbooks.test.ts`** (unit) — asserts the detector fires on known-bad
  strings, stays quiet on benign ones (e.g. "دفع آمن", a real "خصم ١٥٪" promo, an honest ETA),
  and that the **playbooks overlay text itself contains zero forbidden claims** in every region.
- **`scripts/eval-scenarios.mjs`** (live) — imports `findForbiddenClaims` and applies it as a
  **cross-cutting gate over every scenario's reply**: any forbidden claim fails the case
  regardless of its own criteria. This is how the list is "asserted against Khalid outputs."

The safety gate (`lib/ai/allergen-gate.ts`) remains the enforcing floor for allergen-safety
output; this list is the persona-layer restatement plus the four non-allergen classes. It never
relaxes the gate, and it declares no facts.
