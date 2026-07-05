# Saudi Food Encyclopedia — Pack v1

**Market-knowledge layer for the KSA market (Kivo / MaitreAI).**
Owner: Khalid Al-Najdi persona window · Version 1 · Status: content pack, **not yet wired into a live injection path**.

---

## What this is (and what it is NOT)

This directory is a curated, versioned **market-knowledge encyclopedia** about Saudi
food and drink culture. It gives the customer agent (Khalid) *cultural fluency* — so he
recognises «قهوة وتمر», knows kabsa is a rice-and-meat centerpiece, pairs gahwa with dates
by instinct, and speaks about food like a Saudi host who grew up with it.

It is **market knowledge, never menu truth.** Two hard laws bind every entry:

> ### LAW 1 — The encyclopedia NEVER overrides tenant menu truth.
> The single source of truth for what a restaurant sells, its prices, availability, and
> allergens is the **tenant menu** (the Restaurant Brain / POS data injected into the
> prompt by `lib/ai/prompt.ts`). This encyclopedia describes the *culture*; it does
> **not** add items to any menu. If an entry mentions a dish, a pairing, or a drink, the
> agent may only **recommend or offer it if that exact thing exists in the tenant's menu
> data**. If the tenant doesn't sell it, Khalid may talk about it as culture but **must
> never invent it as an orderable item, never quote a price for it, and never imply it is
> available.** (Same law as Karim: the persona changes the *voice*, never the *facts*.)

> ### LAW 2 — Money is engine-computed; allergens come from the menu + the safety gate.
> No entry contains prices. Any allergen note in an entry is *cultural background only*
> (e.g. "kabsa is commonly cooked with nuts as a garnish") — it is **not** an allergen
> clearance. Allergen safety is decided exclusively by the tenant item's `allergens`
> data and the deterministic allergen gate (`lib/ai/allergen-gate.ts`). An entry's
> `allergens_note` may only *raise* caution, never *reassure*.

---

## How V1 injection works (curated subset, not open RAG)

The structure below is **RAG-optimised** (stable ids, cuisine tags, region tags, frontmatter
metadata) so a later version can retrieve entries by embedding similarity. **But V1 does
NOT do open retrieval.** V1 injection = a **curated subset selected by the tenant's cuisine
tags**: e.g. a Najdi grill house tenant gets the `saleeg`, `kabsa`, `jareesh`, `gahwa`,
`dates`, `arabic-tea` entries injected as a compact culture block; a coffee-and-sweets
tenant gets `gahwa`, `dates`, `saudi-sweets`, `arabic-tea`. Selection is by matching an
entry's `cuisine_tags` against the tenant's configured cuisine tags — a small, reviewed,
deterministic subset, never the whole pack. This keeps the prompt small and the knowledge
relevant, and keeps a Sweet-Shop tenant from being told about mandi it doesn't serve.

**Nothing here is injected until the wiring PR lands** (see `docs/KHALID_PERSONA_WIRING.md`).
This pack is a pure content leaf — imported by nothing yet — exactly like `allergen-vocab.ts`
landed before its gate wiring.

---

## Entry schema

Every entry is a Markdown file with YAML frontmatter and a fixed section order (started from
the `gahwa` entry as the template). The section order is the one specified for Pack v1:
**region · ingredients · taste · cultural significance · rituals · etiquette · recommendation
voice · anecdote · regional variations · pairings · modern context · rule.**

### Frontmatter fields

| field | meaning |
|---|---|
| `id` | stable slug (retrieval key, never changes) |
| `name_ar` | Arabic name(s), incl. common variants |
| `name_en` | English name |
| `category` | `dish` \| `beverage` \| `sweet` \| `staple` |
| `cuisine_tags` | tags used by V1 curated-subset selection (e.g. `najdi`, `hijazi`, `rice-dish`, `hospitality`) |
| `regions` | KSA regions where it is core: `najd` \| `hijaz` \| `asir` \| `eastern` (+ `all`) |
| `default_pairings` | cultural pairing ids — **knowledge only, gated by menu truth at recommend time** |
| `menu_join_hint` | how the agent should map this concept onto real tenant items |
| `allergens_note` | cultural allergen background — **caution only, never a clearance** |
| `version` | pack version (1) |

### Body sections

- **Region** — where in KSA it belongs.
- **Ingredients** — typical components (cultural, not a tenant recipe).
- **Taste** — flavour/texture profile, for honest sensory selling.
- **Cultural significance** — why it matters socially.
- **Rituals** — how/when it's served or eaten.
- **Etiquette** — host/guest conventions (karam, multiple-offer etiquette, gahwa cup shake…).
- **Recommendation voice** — 1–2 example lines showing how Khalid *talks about it* — **anchors, not scripts**, and always menu-truth-gated.
- **Anecdote** — a short human line that gives warmth (storyteller register).
- **Regional variations** — how it changes najd ↔ hijaz ↔ asir ↔ eastern.
- **Pairings** — cultural pairings (gated by menu truth).
- **Modern context** — how it shows up today (Ramadan, cafés, delivery…).
- **Rule** — the per-entry restatement of LAW 1 / LAW 2: what the agent must NOT do.

---

## Files in this pack (v1)

Beverages & hospitality: `gahwa`, `arabic-tea`, `laban`, `ramadan-drinks`
Rice & meat centrepieces: `kabsa`, `mandi`, `saleeg`, `margoog`
Grain & comfort dishes: `jareesh`, `mathloutha`, `harees`, `aseedah`
Savoury & sweet: `mutabbaq`, `dates`, `saudi-sweets`

15 entries. `gahwa` is the canonical template.
