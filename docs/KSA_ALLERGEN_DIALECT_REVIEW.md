# KSA Allergen Safety-Dialect Review — Najdi/Hijazi coverage

**Status: PROPOSAL — BLOCKING gate for KSA go-live. Requires PM sign-off before any
change to the LOCKED safety vocabulary.**
Owner: Khalid persona window · Reviewer sign-off required: PM (safety vocabulary is ratified-path only).

---

## 0. Why this review exists (the law)

The deterministic allergen gate (`lib/ai/allergen-gate.ts`) is the **universal, country-
agnostic safety floor** — it fires a hard safety escalation when a customer expresses an
allergy/avoidance, independent of the LLM. Its vocabulary was written and tuned for
**Egyptian** Arabic. Before a Saudi tenant goes live, that vocabulary must be audited against
how **Najdi/Hijazi** speakers actually phrase an allergy — or the safety floor is weaker for
KSA customers than for Egyptian ones.

The gate's vocabulary is **LOCKED**: it may only change via the **ratified path** —
> a reviewed PR + a full rerun of the allergen eval suite (the "211-eval" in PM tracking:
> `scripts/test-allergen-gate.test.ts` = 34 pure base-gate cases, the KSA extension below, and
> the live conformance harness `scripts/eval-scenarios.mjs`) + **explicit PM sign-off.**

**This document PROPOSES; it does not merge.** No file under `lib/ai/allergen-gate*.ts` is
touched by this review. The changes below land only after PM sign-off, as their own PR.

---

## 1. Method (evidence-based, not guessed)

Every verdict below was produced by **executing the real gate** (`detectAllergenAvoidance`
from `lib/ai/allergen-gate.ts`) against a KSA-dialect case set. The reproducible harness is
committed at **`scripts/test-allergen-gate-ksa.test.ts`**:

```
node --experimental-strip-types scripts/test-allergen-gate-ksa.test.ts        # informational (today)
KSA_GATE_RATIFIED=1 node --experimental-strip-types scripts/test-allergen-gate-ksa.test.ts  # blocking (post-merge)
```

The base gate (`allergen-gate.ts`) is the layer under review. A **separate** additive layer,
the symptom detector (`allergen-gate-symptoms.ts`), catches symptom/condition language and has
its **own** pending medical review (`docs/ALLERGEN_SYMPTOM_REVIEW.md`); gaps that belong to it
are **routed there**, not fixed in this PR.

---

## 2. Coverage report (executed against today's LOCKED gate)

### 2a. Already covered ✅ (11 KSA phrasings — must not regress)

The Najdi/Hijazi phrasings the base gate **already fires on** today. These become **regression
guards** in the KSA eval (hard-fail if they ever stop firing):

- Explicit «حساسية»: «عندي حساسية من السمك», «حساسيتي من المكسرات», «عندي حساسيه من اللبن», «عندي حساسية القمح», «يطلع لي حساسية من اللوز»
- Can't-eat: «ما أقدر آكل مكسرات», «ما اقدر اكل سمسم», «ما ينفع آكل قمح», «ما أقدر آكل جوز»
- Harm verbs: «الفول السوداني يضرني», «البيض يتعبني»

Good news: the **shared normalization** (`normalizeAr` handles أ/إ/آ→ا, ة→ه, ى→ي, tashkeel) means
KSA orthography and MSA-ish «ما أقدر آكل» already flow through the Egyptian patterns cleanly.

### 2b. GAPS — base gate MISSES today (this review's ratified-path proposals) 🔴

10 real Najdi/Hijazi phrasings the base gate **does not fire on**, all of which SHOULD escalate:

| # | phrasing | class | why it misses |
|---|---|---|---|
| 1 | أنا **حساس** من الفول السوداني | adjective | `EXPLICIT_ALLERGY_RE=/حساسي/` needs the «ـية»; «حساس» (masc adj) has no «حساسي» |
| 2 | أنا **حساسة** من البيض | adjective (fem) | same — «حساسه» ≠ «حساسي» |
| 3 | **أتحسس** من الحليب | reaction verb | «تحسس» has no «حساسي» substring; not in avoidance set |
| 4 | يجيني **تحسس** من الفستق | reaction noun | same |
| 5 | **ألرجيا** من البيض | transliteration | «الرجيا» has no «حساسي»; no Latin either |
| 6 | عندي **الرجي** من الجلوتين | transliteration | same |
| 7 | **مو قادر** آكل جمبري | Najdi negation | avoidance set has Egyptian «ماقدرش/مينفعش», not «مو قادر» |
| 8 | **ما يصير** آكل لبن | Najdi negation | «ما يصير» (not permissible) absent |
| 9 | المكسرات **تأذيني** | harm verb (fem/3rd) | avoidance has «ياذي/باذي», not «تاذي» |
| 10 | **ما أتحمل** اللاكتوز | intolerance | «ما أتحمل» absent AND «لاكتوز» is not an allergen term |

### 2c. GAPS routed to the SYMPTOM layer (not this PR) 🟠

Symptom/condition language belongs to `allergen-gate-symptoms.ts` (own review). Tracked in the
KSA eval as informational, `[symptom]`:

«وجهي ينتفخ لما آكل مكسرات» (swelling), «يطلع لي طفح من السمك» (rash), «ما أقدر أتنفس بعد ما آكل
جمبري» (breathing), «حلقي يضيق من البيض» (throat), «يجيني كتمة لما آكل قمح» (choking), «يجيني حكة
من السمسم» (itch), «يجيني رد فعل من الطحينة» (reaction), «عندي أنيميا الفول» (favism).
Several are Egyptian-worded in the current symptom layer («وشي بيورم» vs Najdi «وجهي ينتفخ»);
the Najdi equivalents should be added when that layer's KSA extension is reviewed.

---

## 3. PROPOSED additions to the LOCKED base vocabulary (validated)

These close all **10 base-gate gaps** with **zero regressions** and **zero over-fires** — proven
against the existing 34-case must-fire/must-not-fire set **and** a set of false-positive traps
(«موضوع حساس», «احساس جميل», «رجيم», «الرجيم», «الراجل», «الرجل»). All fire only with the same
allergen co-occurrence rule the gate already uses (except the high-precision explicit patterns).

### 3a. `EXPLICIT_ALLERGY_RE` (fires standalone — kept high-precision)

```diff
- const EXPLICIT_ALLERGY_RE = /حساسي/;
+ const EXPLICIT_ALLERGY_RE = new RegExp(
+   "حساسي" +                                          // حساسية/حساسيه/حساسي (existing)
+   "|(?<![ء-ي])حساس(?:ه|ين)? (?:من|تجاه|ضد|علي)" +    // «حساس/حساسة/حساسين من/تجاه/ضد» (adjective bound to «من»)
+   "|(?<![ء-ي])الرجي(?!م)"                             // «ألرجي/ألرجيا/الرجي» transliteration; NOT «الرجيم» (diet)
+ );
```
- The `(?<![ء-ي])` boundary stops «إحساس» (feeling) from matching «حساس».
- Requiring «حساس» to be bound to «من/تجاه/ضد/علي» stops the bare sensitive-topic «موضوع حساس».
- The `(?!م)` guard stops «الرجيم» (diet) and, with the boundary, «الرجل/الراجل» never match «الرجي».

### 3b. `AVOIDANCE_INTENT_RE` (requires allergen co-occurrence — safe by construction)

```diff
    "الدكتور (?:قالي|منعني|قال)",
    "ميصحش ?اكل|ما ?ينفعش ?اكل",
+   // KSA (Najdi/Hijazi) additions:
+   "تحسس",                          // أتحسس/يتحسس/يجيني تحسس (reaction verb)
+   "(?:مو|مب) ?قادر",               // مو قادر / مب قادر (Najdi "can't")
+   "ما ?يصير ?اكل|ما ?يجوز ?اكل",   // ما يصير/يجوز آكل (not permissible to eat)
+   "تاذي|تضر",                      // feminine/3rd-person harm (تأذيني/تضرني)
+   "ما ?اتحمل|مااتحمل",              // ما أتحمل (intolerance)
```

### 3c. `ALLERGEN_TERMS` (new terms)

```diff
    "سمك", "جمبري", "قشريات",
+   "لاكتوز",   // lactose — dairy (needed for «ما أتحمل اللاكتوز»)
+   "طحينه",    // tahini — sesame (normalizeAr maps ة→ه, so «طحينة»→«طحينه»)
```
> Note: `allergen-vocab.ts` already lists «طحينة» and «لاكتوز» as aliases; adding them to the gate's
> `ALLERGEN_TERMS` keeps the vocab module and the gate aligned (the vocab test asserts this).

### Validation result (reproducible)

Applying 3a–3c: **10/10 base gaps close · 9/9 existing must-fire still fire · 14/14 must-not-fire
stay silent** (incl. every false-positive trap). The symptom-class gaps are unaffected (they are
the symptom layer's responsibility).

---

## 4. The ratified path — checklist for the (separate) merge PR

Nothing here merges until **all** of these are done in a dedicated PR with **PM sign-off**:

- [ ] Apply diffs 3a–3c to `lib/ai/allergen-gate.ts` (base gate only).
- [ ] Extend `scripts/test-allergen-gate.test.ts` with the 10 base-gap cases + the false-positive
      traps as permanent must-fire / must-not-fire assertions.
- [ ] Keep `allergen-vocab.ts` and its test (`test-allergen-vocab.test.ts`) in sync (new terms).
- [ ] **Full eval rerun ("211-eval"):** `npm run test:unit` green + `scripts/eval-scenarios.mjs`
      (both dialects) with no allergen regression.
- [ ] Flip the KSA eval to blocking: run `KSA_GATE_RATIFIED=1 scripts/test-allergen-gate-ksa.test.ts`
      → base gaps must show **CLOSED**, exit 0. Wire it into `.github/workflows/agent-eval.yml` as a
      blocking step.
- [ ] Route the `[symptom]` KSA gaps (§2c) to the symptom-layer review (`docs/ALLERGEN_SYMPTOM_REVIEW.md`).
- [ ] **PM SIGN-OFF (explicit) on the safety-vocabulary change.** ← required; do not merge without it.

## 4b. PM ruling — conditional sign-off (recorded)

Conditional sign-off on the vocabulary additions is **GRANTED, sequenced.** The actual
gate-vocabulary change (the 10 additions in §3) is a **THIRD, future PR** on the ratified path,
and it **waits for Core's `WO-SAFE-2`** (the unconditional base-gate work) to land first — so
there is no collision on the safety module. Conditions carved into that future PR:

- **(a) Context-anchored patterns, never bare tokens.** The additions must match the existing
  vocabulary's style and anchor to allergy/food context. In particular `مو قادر` and `ما يصير`
  are broad on their own — they go into `AVOIDANCE_INTENT_RE`, which **only fires with a
  co-occurring allergen term** (that co-occurrence IS the anchor), exactly as validated in §3b.
  The high-precision explicit patterns (`حساس … من`, `الرجي(?!م)`) carry their own boundary
  anchors. No bare token is proposed.
- **(b) Full suite green in one run.** The full "211-eval" suite **and** this KSA regression set
  must be green in the same run.
- **(c) Flip to blocking in the same PR.** `KSA_GATE_RATIFIED=1` becomes a blocking CI step in
  that same PR (base gaps must show CLOSED).
- **(d) Explicit PM sign-off at that PR's merge** — given by the PM at merge time, not inherited
  from this review.

This review (coverage report + informational KSA eval) lands now and does **not** touch the
LOCKED gate. The vocabulary PR is gated on (a)–(d) + `WO-SAFE-2` landing first.

## 5. Go-live gate

Per the Saudization roadmap, the A3.1 allergen hard-test is a per-launch gate. **KSA go-live for
the allergen floor is blocked until the base-gate gaps in §2b are closed via the ratified path
above.** Until then, the KSA eval runs informational (exit 0) so this review can land without
altering the LOCKED gate, and the symptom layer + prompt rules remain the (partial) backstop —
but that is not sufficient coverage for launch on its own.
