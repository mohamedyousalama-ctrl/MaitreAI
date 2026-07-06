# KSA Encyclopedia — Injection Curation Spec (V1)

**Work order:** ENCYCLOPEDIA CURATION (follow-up to WO-KHALID-WIRING).
**Owner:** Khalid persona window (this doc = the curation half).
**Counterpart:** Core-code holds the injection mechanics (selector wiring, prompt placement,
gate-12 extension). **This is docs-only.** Core-code builds against it verbatim; guardian
reviews the eventual PR.

**Content source:** `knowledge/ksa/` — 15 entries, `gahwa` is the template. Every entry already
carries the frontmatter this spec selects on (`id`, `category`, `cuisine_tags`, `regions`,
`default_pairings`, `menu_join_hint`, `allergens_note`) and a per-entry **Rule** restating
LAW 1 / LAW 2.

## Inherited laws (non-negotiable, restated so the selector can't erode them)

- **LAW 1 — encyclopedia NEVER overrides tenant menu truth.** Selection injects *culture*, never
  menu items, prices, or availability. Everything recommendable is still gated on real tenant menu
  data at recommend time.
- **LAW 2 — money is engine-computed; allergens come from the menu + the deterministic gate.** An
  entry's `allergens_note` may only *raise* caution, never reassure. The persona/encyclopedia has
  **zero** effect on `detectAllergenAvoidance` / the output guard (they run in `customer-turn.ts` /
  `respond.ts` independently).

Curation changes *what culture Khalid knows*, never *what the restaurant sells* or *what is safe*.

---

## 1. WHICH entries inject

**Not all 15.** The whole pack is ~47 KB of raw markdown; injecting it wholesale would nearly
double the ~40 KB flag-ON prompt and drown the tenant's own menu. V1 injects a **small curated
subset, tiered by relevance to the tenant**, in two tiers:

### Tier A — Hospitality spine (always, when the encyclopedia is ON)
`gahwa`, `dates` — and `arabic-tea` if budget allows. These are the persona's core register
(قهوة وتمر / karam), offered as *hospitality*, not as menu items, so they are relevant to **every**
KSA tenant regardless of what's on the menu. They stay menu-truth-gated like everything else
(if the tenant actually sells dates/coffee, great; if not, Khalid speaks of them as the culture of
welcome, never as an orderable line).

### Tier B — Menu-relevant culture (dynamic, ranked)
The remaining slots are filled by entries whose **`cuisine_tags` intersect the tenant's configured
cuisine tags** *and* whose **`regions` include the tenant's region** (or `all`), ranked by the
deterministic score in §2. This is what keeps a Najdi grill house from being told about `mutabbaq`
it doesn't serve, and a sweet-shop from being handed `mandi`.

**Net:** a tenant gets its hospitality spine + a handful of culture entries that actually match its
kitchen — never the full pack, never entries for a cuisine it doesn't cook.

---

## 2. THE SUBSET RULE (deterministic, testable)

Selection is a **pure function of tenant config + entry frontmatter** — no open retrieval, no
embeddings, no fuzzy dish-name matching, no model call. Same inputs → same output, every time.

### Inputs
- `tenant.region` — the resolved `ksaRegion` already wired in WO-KHALID-WIRING (`najd|hijaz|asir|eastern`).
- `tenant.cuisineTags: string[]` — the tenant's configured cuisine tags (`ctx.ksaCuisineTags` per
  `KHALID_PERSONA_WIRING.md` §4). **If empty/absent → Tier B is skipped; only the spine injects.**
- The pack frontmatter (`cuisine_tags`, `regions`, `category`, `id`).

### Score (higher = more relevant)
```
regionMatch(entry)  = 2  if tenant.region ∈ entry.regions
                      1  else if "all" ∈ entry.regions
                      0  otherwise
tagOverlap(entry)   = | entry.cuisine_tags ∩ tenant.cuisineTags |
categoryBonus(entry)= 3  if entry.cuisine_tags contains "signature"
                      2  else if entry.cuisine_tags contains "hospitality"
                      0  otherwise
score(entry)        = tagOverlap*10 + regionMatch + categoryBonus
```

### Tier B eligibility (all must hold)
`tagOverlap ≥ 1` **and** `regionMatch ≥ 1` **and** entry ∉ Tier A. (Region-inappropriate or
zero-overlap entries are never eligible — the culture must fit the tenant.)

### Assembly (deterministic order + tie-breaks)
1. **Spine first:** `gahwa`, `dates` in that fixed order (then `arabic-tea` if a slot remains).
2. **Then Tier B**, sorted by `(score DESC, id ASC)` — a total order, so selection and drop are
   fully reproducible.
3. Truncate to the entry/byte caps in §3.

> Reference selector (core-code implements; shape only): `selectKsaEntries(region, cuisineTags) → Entry[]`
> returns the ordered, capped list. Pure, no I/O. This is the unit-testable seam.

### Optional v1.1 refinement (noted, not required for V1)
If core-code can cheaply surface the tenant's **menu categories/tags**, intersect those into
`tagOverlap` as a second signal (relevance to the *actual* menu, not just declared cuisine). Kept out
of V1 to avoid fuzzy menu-string matching; the declared-cuisine-tag rule above is the deterministic baseline.

---

## 3. SIZE BUDGET (hard cap + deterministic drop order)

The flag-ON prompt is already ~40 KB. The encyclopedia block is **capped hard**:

| Cap | Value | Rationale |
|---|---|---|
| `MAX_ENCYCLOPEDIA_ENTRIES` | **6** | spine (2–3) + ~3–4 menu-relevant; keeps the block scannable |
| `MAX_ENCYCLOPEDIA_BYTES` | **3072** (3 KB) | ≤ ~8 % of the current prompt; protects size + cache |
| `MAX_INJECT_LINE_BYTES` | **480** / entry | one compact line, not the raw entry |

### Injected form is COMPACT, not the raw entry
The raw entries have 12 body sections (~3 KB each). **We do not inject the body.** Each selected
entry renders to **one compact line** built from frontmatter only (deterministic, no body parsing):

```
• {name_ar} ({name_en}) — {inject_summary}. تُقترح فقط لو كانت ضمن منيو المطعم. {menu_join_hint}
```

- `inject_summary` — a **new, hand-curated frontmatter field**, ≤ 160 chars, one honest culture-and-
  taste line per entry (the curation PR adds it to all 15 entries; it is the only pack content change).
  Hand-curated so the injected line is quality-controlled and length-bounded — no risk of the body's
  prose leaking in.
- The `menu_join_hint` reminds the model how to map the concept onto real menu items.
- No prices, no `allergens_note` reassurance — `allergens_note` is **not** rendered into the sell line
  (it is caution-only background; surfacing it here risks reading as a clearance).

Block header (~1 line, static): a single framing sentence — *"ثقافة السوق (معرفة فقط، ليست منيو):"*
("market culture — knowledge only, not a menu") — so the model never mistakes the block for orderable inventory.

### When over budget — deterministic drop order
Apply in order until under **both** caps:
1. Drop **Tier B** entries from the **bottom of the ranked list** (lowest `score`, ties by `id` DESC) one at a time.
2. If still over after all Tier B is gone, drop the **optional** spine member `arabic-tea`.
3. Never drop below the **two-entry core spine** (`gahwa`, `dates`). If even that overflows the byte cap
   (should be impossible at ≤480 B/line), inject the spine at line level and log a build-time warning —
   never silently truncate a line mid-entry.

**Silent-truncation ban:** entries drop whole, in the stated order, never partially. The drop set is a
pure function of the inputs, so it's assertable.

---

## 4. FLAG RECOMMENDATION

**Recommend: its own `ksa_encyclopedia` flag, hard-dependent on `khalid_persona`.**

- The encyclopedia may inject **only if** `khalid_persona` is ON **and** `ksa_encyclopedia` is ON.
  (`ksa_encyclopedia` ON while `khalid_persona` is OFF → inject nothing; the culture block has no
  meaning without the persona voice.)
- **Why a separate toggle, not riding `khalid_persona`:**
  1. **Independent kill switch.** The encyclopedia is the one part of the persona that *adds
     prompt size and model-shapeable content*. If it bloats the prompt, degrades cache, or a
     specific entry misbehaves, we can kill the culture block **without** taking Khalid's voice
     offline. Riding one flag couples "turn off a culture bug" to "turn off the whole persona."
  2. **Staged rollout.** Ship persona voice (already wired, byte-identical-OFF proven) to الديرة
     first; enable culture-knowledge as a separate, observable step once we've watched the voice in
     production. Two independent dials = two independent rollbacks.
  3. **Symmetry with existing pattern.** Same `isFeatureExplicitlyEnabled` read as every other flag
     (`khalid_persona`, `menu_playbook`, `deterministic_allergen_safety`); add `ksa_encyclopedia` to
     the `ProFeature` union. No schema change (it's a `feature_flags` jsonb key).

Default **OFF**. For ratification.

---

## 5. FORBIDDEN-CLAIMS INTERACTION — the ordering call

**Finding: forbidden-claims must stay TERMINAL. Encyclopedia must be injected BEFORE the playbooks,
not after them.**

Today the playbooks' `FORBIDDEN_CLAIMS` list terminates the flag-ON prompt (verified in the
WO-KHALID-WIRING render — the prompt ends on *"…you sell on your own merits."*). Core-code's
pre-commit pins `persona < playbooks < encyclopedia`, i.e. **encyclopedia last**. I'm flagging that
as a safety regression and recommending the order flip.

**Why not "encyclopedia last":**
- The forbidden-claims list is the persona's **terminal safety backstop** — the never-say-safe /
  no-guaranteed-delivery / no-medical-suitability / no-invented-discount / no-competitor-attack
  prohibitions. Models weight the **end of the prompt** most heavily (recency/primacy).
- Encyclopedia entries are **warm, descriptive** culture ("dates are the heart of Saudi welcome…").
  Placed *after* the prohibitions, a stray effusive line is exactly the kind of content that can
  soften a terminal "never claim it's healthy/safe/suitable" — e.g. nudging toward a **medical-
  suitability** claim, which is itself a forbidden claim. Descriptive content must never be the
  model's last word after a safety prohibition.
- Content-wise each entry's Rule already forbids contradiction, and `allergens_note` is not rendered
  into the sell line (§3) — so a *direct* contradiction is unlikely. But **position**, not just
  content, is the risk. The fix is ordering, and it's free.

**Ratifiable order:**
```
persona layer  →  encyclopedia block  →  playbooks (FORBIDDEN_CLAIMS terminal)
```
Gate-12 then pins `persona < encyclopedia < playbooks` **and** adds the load-bearing assertion:
**the flag-ON prompt still ENDS with the forbidden-claims sentinel string** (the exact terminal line).
That end-anchor is the real safety pin — it guarantees no future section, encyclopedia included, can
push the prohibitions out of the terminal position.

**Cache note (pre-empting the counter-argument):** "most-volatile-last" would argue encyclopedia (per-
tenant) belongs after playbooks (per-region). But the entire flag-ON tail is already per-tenant/per-
region, so the prefix-cache gain from encyclopedia-last is marginal — and it is not worth trading the
terminal safety anchor for. Safety-primacy wins; the order above stands.

---

## 6. Testable properties (for gate-12 / guardian)

Core-code's selector + placement should be pinned by these pure assertions (no LLM, no DB):

1. **Determinism** — `selectKsaEntries(region, tags)` returns the identical ordered list across runs.
2. **Spine invariant** — with the flag ON, `gahwa` and `dates` are always present (any region, empty tags).
3. **Region gating** — no Tier B entry appears whose `regions` excludes `tenant.region` and lacks `all`.
4. **Tag gating** — no Tier B entry appears with zero `cuisine_tags` overlap.
5. **Caps** — selected entries ≤ 6; rendered block ≤ 3072 bytes; each line ≤ 480 bytes.
6. **Drop order** — over-budget inputs drop the lowest-scored Tier B first; spine core survives; entries
   drop whole (never a partial line).
7. **Flag dependency** — `ksa_encyclopedia` ON + `khalid_persona` OFF → empty block (nothing injected).
8. **Ordering + terminal anchor** — `indexOf(persona) < indexOf(encyclopedia) < indexOf(playbooks)`, and
   the prompt **ends** with the forbidden-claims sentinel line.
9. **Byte-identical-OFF preserved** — encyclopedia OFF (either flag) → prompt byte-identical to the
   flag-OFF golden (extends the existing WO-KHALID-WIRING snapshot; Karim/Wesaya's live prompt untouched).
10. **No price / no clearance** — rendered block contains no currency token and does not render
    `allergens_note` into a sell line.

---

## 7. Open items for PM ratification

1. **Flag** — approve a dedicated `ksa_encyclopedia` (dependent on `khalid_persona`)? (§4, recommended.)
2. **Ordering** — approve the flip to `persona → encyclopedia → playbooks` with forbidden-claims
   terminal + the end-anchor assertion? (§5 — this reverses core-code's pre-committed
   `encyclopedia-last`, so it needs your explicit call.)
3. **`inject_summary` field** — approve adding one ≤160-char curated frontmatter line per entry as the
   sole pack content change? (§3.)
4. **Caps** — ratify `MAX_ENTRIES=6`, `MAX_BYTES=3072`, `MAX_LINE=480`, or set your own.
5. **Tenant cuisine tags** — confirm `ctx.ksaCuisineTags` is (or will be) surfaced by core-code as the
   Tier B signal; else V1 ships spine-only until that lands.
