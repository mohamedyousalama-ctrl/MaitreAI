# AUDIT — WAVE 1.6 · فيصل / Faysal

**Third auditor.** **Date:** 2026-09-09.
**Scope:** the four specs as of `e1791f5` ("Wave 1.6 — 314/314, and a live hole found in Khalid"),
re-driven against `AUDIT-WAVE1.md`, `AUDIT-WAVE1.5.md`, `REVIEW-WAVE1.md`, `SOURCE_DOSSIER.txt`
and the repo at `claude/pm-replacement-test-y8xq96`.

**Method.** Everything marked **[DRIVEN]** was executed. I did not reuse either previous audit's
harness. I rebuilt the §2 corpus **mechanically from the documents themselves** — a parser that
extracts every `«…»` string from every `**Fires:**` block and every `Must NOT fire` table in
§2.1–§2.9 — then implemented all nine class rules verbatim from their `HIT = …` blocks, over the
real `normalizeAr` imported through `scripts/ts-ext-loader.mjs`, and ran the whole thing. The
real `detectAllergenEmergency`, `FRAME_WORDS`, `NOT_A_PERSON` and `PERSON_WORDS` were imported and
executed. `lib/db/safety-hold.ts`, `lib/db/safety-hold-guard.ts`, `lib/order-pricing.ts`,
`lib/ai/symptom-frames.ts`, `scripts/proof-phonetic-net-unwired.test.ts`, both CI workflows and
`.eslintrc.json` were read verbatim. **[READ]** means the named file or section was read.
Where I could not verify something I say so.

> **One note on the tree.** `lib/ai/allergen-emergency.ts` and `lib/ai/symptom-frames.ts` were
> being rewritten by another agent while I audited (commit `5906b91`, "WIP — DO NOT MERGE:
> emergency detector mid-edit", and further uncommitted edits after it). Every claim below that
> compares a spec rule against "the real detector" was therefore driven against **all three
> states**: `e1791f5` (the commit the specs were written against, checked out to a scratch file),
> `5906b91`, and the working tree as I read it. Where the three disagree I say which. See
> should-fix **S4**.

**Verdict up front: BLOCKED. 7 blockers, 6 should-fix.**

Two things need saying before the defect list, because a fourth blocking pass is easy to mistake
for an auditor who cannot approve.

**First: §2.0 is real. It is the best single piece of work in these four documents.** It closed
N4 (the airway composition), N3 (the unscoped veto) and N6 (hardness-as-a-reading) with genuine
mechanism, and it found eleven `MUST_FIRE` failures that no hand-assembled corpus had seen. I
re-drove all six Wave 1.5 blockers and **all six are closed**. I re-drove all seven Wave 1.5
should-fixes and **all seven are closed**, one of them by correctly proving the re-audit wrong.
Nothing in Waves 1 or 1.5 regressed.

**Second: what blocks is not the same six coming back.** Three of the seven blockers below are
consequences of a single asymmetry in §2.0 that no previous pass could have seen, because §2.0
did not exist. Two are false positives on ordinary clinic traffic that no pass has looked for,
because every pass so far has been hunting silences. One is the un-normalized-list shape,
surviving in 57 places including inside the note that claims to have fixed it.

---

## PART 0 — My own corpus totals, and why they are not 314

Wave 1.6 reports **314/314** (204 `MUST_FIRE` + 110 `MUST_BE_QUIET`). I cannot reproduce that
number, and I did not try to; I rebuilt the corpus by the procedure §2.0 L6 prescribes and report
what I got.

**My corpus: 354 assertions — 213 `MUST_FIRE`, 141 `MUST_BE_QUIET`.** Built from: every Fires-list
entry in §2.1–§2.9 extracted by parser (conditional entries mirrored as complete sentences per
L6, `«دم مع البول»` mirrored at both tiers per L6); §2.4's Fires content transcribed from its
prose (it has no `**Fires:**` block, which is itself why a parser-built corpus finds things a
hand-built one does not); every near-miss table row; §11.1's third-person and frame assertions;
§1.5 R1's five booking-frame-in-one-clause assertions; §11.2's site-name, denial-of-symptom,
clinic-ordinary, bereavement and idiom corpora; and every string either previous audit drove.

Because §2.0 L6 says two incompatible things about normalization (blocker **T1**), I drove the
whole corpus twice:

| | `MUST_FIRE` | `MUST_BE_QUIET` | total |
|---|---|---|---|
| **literal** — term lists exactly as §2 writes them | **169 / 213** | **134 / 141** | **303 / 354** |
| **normalized** — lists passed through `normalizeAr` at build time | **210 / 213** | **139 / 141** | **349 / 354** |

Per section, in the charitable (normalized) reading:

```
 §2.1 34/34  §2.2 24/24  §2.3 14/14  §2.4 33/35  §2.5 12/12
 §2.6  8/9   §2.7 11/11  §2.8 11/11  §2.9 14/14
 §11.1 10/10  §1.5R1 5/5  §11.2 quiet 31/31  prior-audit corpus 34/34 fire + 21/21 quiet
 near-miss tables quiet: 2.1 12/12 · 2.2 8/8 · 2.3 11/11 · 2.4 14/14 · 2.5 7/7 ·
                         2.6 6/7 · 2.7 6/7 · 2.8 10/10 · 2.9 13/13
```

**Five residual failures under the charitable reading, forty-nine under the literal one.** The
five are blockers **T4** (two rows), **T5** (two Fires entries) and **T7** (one). The extra
forty-four are all blocker **T1**.

Separately, §11.2's boundary-behaviour corpus **reproduces 30/30** (every row from both audits
plus the three new §2.0 L7 phrase rows) — with the terms normalized; one row is transcribed
un-normalized in the document and is quiet as written, which is T1's shape again.

And a corpus is only as good as what is in it. **I also drove fifty ordinary Saudi clinic
messages that appear in no §2 near-miss table and no §11.2 corpus. Three fired.** Two of those
three are blockers **T2** and **T3**.

---

## PART 1 — Are the six Wave 1.5 blockers closed?

| ID | Verdict | Evidence |
|---|---|---|
| **N1** ER copy layer | **CLOSED** | driven, both halves |
| **N2** `«تقيأت دم»` | **CLOSED** | driven |
| **N3** unscoped `الحمدلله` | **CLOSED** | driven, five strings |
| **N4** airway composition | **CLOSED**, one ambiguity remains (**T7**) | driven |
| **N5** `demo_seeded` union | **CLOSED** | read |
| **N6** SOFT readings | **CLOSED as a rule**, not as a table (**T4**) | driven + read |

**N1 · [DRIVEN + READ].** `SPEC-2-PERSONA.md` L238's frozen string now reads
«أعرف إن الوقت متأخر — العيادات مسكّرة الحين، والطوارئ في {er_branch_name} مفتوحة الحين.» —
*open now*, exactly what `erSites({ now })` returns. `grep` over all four specs finds
«مدار الساعة» only in correction notes. The second half — §5.3's `availability` guard — is
rewritten from five surface strings into a claim in any inflection with the carve-out scoped to
*the field the tool returned*, which is the right structural answer. Driven, G4-as-was is blocked
and G4-as-is passes. **See should-fix S1: the rewritten guard's own strings are un-normalized,
and §5.2 says the banned shapes are matched normalized.**

**N2 · [DRIVEN].** `تقيا · تقيات · تقيت · يتقيا · تتقيا · استفرغ · استفرغت · يستفرغ · تستفرغ` are
SITE terms and `بول · البول · التبول` is `SITE.urgent`. All of §2.3's Fires list fires; 14/14 in
both modes. The remediation's own extra find — `«استفرغت دم»`, which the re-audit did not name —
is real and is closed.

**N3 · [DRIVEN].** `الحمدلله` is struck from §2.3's EXCLUSION set and §2.0 L4 makes it structural
("a politeness formula is not an exclusion"). Re-driven, all four of the re-audit's bleeding
emergencies that open politely now fire, and `«الحمدلله وقف النزيف»` stays quiet on
`وقف النزيف` alone.

**N4 · [DRIVEN].** §2.4 now carries an eight-arm `HIT = …` block with adjacency. Driven, ARM 1's
`ADJ(NEGATION, [AUX], BREATHE)` fires on `«الطفل ما يتنفس»` and `«ما عاد يقدر يتنفس»` and stays
quiet on `«ما عندي مشكلة في التنفس»` and `«ما فيه صعوبة بالتنفس الحمدلله»` — the third option
neither of the re-audit's two readings had. That is a genuine close. The `عاد` auxiliary and the
two middle slots are correct and I confirmed the cost analysis. **See T7 for the one ambiguity
that survives inside it.**

**N5 · [READ].** `SPEC-1-DOMAIN.md` L116–121: `| "demo_seeded"` is in the `Confidence` union with
a comment that says it is not a provenance rung; §4.2's `bookableWindows()` contract carries the
`DEMO_MODE` clause and the staleness carve-out (L476–484). The reviewer's headline finding now
typechecks in the document that states it.

**N6 · [DRIVEN + READ].** §2.0 L5 draws the line the re-audit asked for — a *frame veto* is one
of §1.4's three regexes and may never touch a HARD class; an *arm exclusion* is an enumerated
term in the message and does not change hardness. `من كم شهر` and `قبل اسبوع` are enumerated in
§2.6 and §2.7's EXCLUSION sets. Hardness is a property of a class again. **But the two rows are
still sitting in tables §11.2 asserts are quiet, and the rules now make them fire at `urgent` —
blocker T4.**

### The seven Wave 1.5 should-fixes

All seven closed. **S1.5-6 is closed by proving the re-audit wrong, and the re-audit was wrong.**
Driven — parsing the named-import list of every `.ts`/`.tsx` under `lib/`, `app/`, `scripts/`,
`components/`:

```
  36 files import SOMETHING from */allergen-gate (excluding -symptoms)   — 34 under lib/+app/
  26 files import normalizeAr specifically                              — 25 under lib/+app/
```

SPEC-3 §10.2's qualified "25 under `lib/` and `app/`" is exact; SPEC-1 DOC-4 now carries the
qualifier. The re-audit's **31 matches neither predicate**, and I say that having recomputed it
independently and expecting to confirm the re-audit.

### Nothing from Waves 1 or 1.5 regressed

I re-drove every failure case in both audits. All nine Wave 1 blockers remain closed. B4's
ACS-with-diaphoresis case (`«عندي ألم شديد بالصدر وأتعرق»`) fires — **but only under the
normalized reading; under the literal one it is silent again, and that is blocker T1.**

---

## BLOCKERS

### T1 — §2's term lists are not normalized, §2.0's own rule for it contradicts itself, and 57 entries are dead code — including the one §2.8's correction note says it fixed · **[DRIVEN]**

**The rule.** §2.0 L6, `SPEC-4-SAFETY.md:483–484`:

> "Term lists **are normalized at build time**, and §11.1 asserts `list === list.map(normalizeAr)`."

Those two clauses cannot both be operative. If the build normalizes, the assertion is vacuous and
tests nothing. If the assertion is real, the lists must be *written* normalized — and today they
are not.

**Driven.** A parser over every fenced rule block in §2.1–§2.9 that carries a `HIT =` or `ARM`
formula, checking `normalizeAr(entry) === entry`:

```
UN-NORMALIZED entries in §2's operative rule-block sets: 54
  (plus 3 more in §2.4's lexicon block: AUX «قادرة», BLUE «أزرق», EXACERBATION «ما رد على البخاخ»)
```

Seven of the nine classes are affected. The consequences, driven:

**(a) §2.1's pain predicate is `ألم` (L556). `normalizeAr("ألم") = "الم"`, so it matches nothing.**
No other §2.1 predicate is present in any of these sentences:

```
literal-list verdict            string
quiet   «ألم في الصدر»             ← §2.1 Fires list, and B4's own fix
quiet   «ألم بالصدر»               ← §2.1 Fires list, and B4's own fix
quiet   «ألم في صدري»              ← §2.1 Fires list
quiet   «الم بصدري»                ← §2.1 Fires list
quiet   «صدري يألمني»              ← §2.1 Fires list
quiet   «عندي ألم شديد بالصدر وأتعرق» ← AUDIT-WAVE1 B4's ACS-with-diaphoresis failure case
quiet   «زوجي يشتكي من ألم في الصدر» ← §11.1's own third-person assertion
   probe: normalizeAr("ألم في الصدر") = "الم في الصدر";  matcher("ألم") → false;  matcher("الم") → true
   probe: other §2.1 predicates present in that clause → []
```

**(b) §2.8 is phrases-only by design, and six of its twenty-two STANDALONE phrases are dead**
(L1282–1285): `حادث سيارة`, `انقلبت فينا السيارة`, `انقلبت السيارة`, `طاح على راسه`,
`طاحت على راسها`, `حروق كبيرة`. A dead phrase in a phrases-only class is a whole silent Fires
entry. Driven, `«حادث سيارة»` — the first entry on the trauma class's Fires list — is silent.

**And `طاح على راسه` is the exact entry §2.8's own Wave 1.6 note says it corrected.**
`SPEC-4-SAFETY.md:1302`: *"`طاح على راسه` was written **un-normalized** … Driven, `«طاح على راسه»`
and `«ابني طاح على راسه وقاعد يستفرغ»` — one of them §11.1's own third-person assertion — were
**both silent** before this correction."* The prose records the correction. **L1283 still reads
`طاح على راسه`, with the `ى`.** §2.5's twin (`تورم مفاجئ` → `تورم مفاجي`) *was* applied at L1117.
The sweep stopped one section short — which is S1.5-1's shape, on a third axis, inside the note
claiming to have closed it.

**(c) Three exclusions introduced or relied on by Wave 1.6 are dead, so three near-miss rows fire:**

```
§2.2 EXCLUSION «من الجلسة» (L689)  dead → «تنميل في رجلي من الجلسة»          FIRES stroke/emergency
§2.6 EXCLUSION «بعضلة»    (L1176) dead → «تشنج بعضلة رقبتي من النوم»          FIRES infant_fever/emergency
§2.3 EXCLUSION «أفرش»/«أسناني»/«فرشاة» (L775) dead → «نزيف اللثة شديد لما أفرش أسناني» FIRES hemorrhage/urgent
```

The first two are the strings §11.2's **pairing discipline** names explicitly. The benign-cause
exclusion and the muscle-object exclusion are both *Wave 1.6 additions*, introduced precisely to
close these rows, and both are dead on arrival.

**Why this is a blocker and not a nit.** §11.1's mandated assertion `list === list.map(normalizeAr)`
is red at birth against the document's own lists — so the one proof §2.0 L6 relies on to stop
this shape recurring cannot be transcribed into a passing test. And under the literal reading the
cardiac class loses B4's fix, which is the single defect the first audit was most emphatic about.

**Smallest fix.** One sentence in L6 picking one discipline — keep the assertion, delete "normalized
at build time" — and normalize the 57 entries in place. Then §11.1's assertion is a real test and
this shape can never recur.

---

### T2 — §2.4 puts `نفسه · نفسها` in BREATHE, and ARM 1 pairs it with a bare negation. Seven ordinary clinic sentences raise an airway emergency and open an operator-release-only booking lock · **[DRIVEN]**

**Defect.** §2.4's BREATHE set, `SPEC-4-SAFETY.md:903–904`:

```
BREATHE       اتنفس · يتنفس · تتنفس · نتنفس · التنفس · تنفس · ياخذ نفس · تاخذ نفس ·
              اخذ نفس · نفسه · نفسها
```

and ARM 1 is `ADJ(NEGATION, [AUX], BREATHE)`, with NEGATION containing `ما`. `نفسه` is *both*
"his breath" and "itself/the same". §2.4's EXCLUSION set is `— (empty except ARM 2's)`, and ARM
3's idiom guard is written `نفسي ?(ضاق|…)` — first person only. So nothing guards `ما نفسه`.

**Driven** (rules implemented from §2.4's own `HIT =` block, lists normalized — the charitable
reading):

```
FIRES  airway/emergency  ARM1   «الموعد ما نفسه اللي حجزته»        ← "the appointment isn't the one I booked"
FIRES  airway/emergency  ARM1   «السعر ما نفسه المعلن»
FIRES  airway/emergency  ARM1   «الفرع ما نفسه اللي رحت له»
FIRES  airway/emergency  ARM1   «الرقم ما نفسه المسجل»
FIRES  airway/emergency  ARM1   «التقرير ما نفسه»
FIRES  airway/emergency  ARM1   «الدكتور ما نفسه اللي شافني قبل»
FIRES  airway/emergency  ARM1   «المريض ما نفسه طويل على الانتظار»
quiet                           «الطلب نفسه واقف»                  ← no negation adjacent
```

**The machinery §2.4 says it inherits never had this hole.** Driven against the real
`detectAllergenEmergency` at both `e1791f5` (the version the spec was written against) and at
`HEAD`: `fired: false` on all seven. The shipped file only ever had `نفسي ?(ضاق|…)` — first
person, with the idiom guard welded on. §2.4's heading is *"inherit, do not re-invent"*; this is
the second place, after N4's adjacency, where re-inventing dropped a guard the original carried.

**Failure scenario, and it is worse than an ordinary false positive.** A patient writes
«الموعد ما نفسه اللي حجزته». §1.5 R2 H-1: a HARD hit at tier `emergency` sets
`triage_hold = true` **and** `ownership_state = "SYSTEM_HOLD"` before the reply is enqueued. H-5:
release is an explicit operator next-action; no timer, no message, no model output releases it.
So the patient is handed 997 and an ambulance instruction, a human is paged **P0**, and the
thread is booking-locked until a named operator clears it by hand. R2 is correct as a mechanism;
it is what converts a false positive in this class into an outage for that patient.

§2.4's near-miss table has no row for this shape and §11.2 has no pairing for it.

**Smallest fix.** Take `نفسه · نفسها` out of BREATHE — ARM 3 already owns the breath-idiom axis —
or require a person term in front of them, which is what `lib/ai/allergen-emergency.ts` does at
HEAD (`BREATH_TIGHT_THIRD`, guarded by `PERSON_WORDS`, with the comment naming «الطلب نفسه واقف»
as the reason).

---

### T3 — §2.7's poisoning class fires on a patient taking prescribed medicine · **[DRIVEN]**

**Defect.** §2.7's object list, `SPEC-4-SAFETY.md:1231–1233`, contains `دوا · دواء · الكبار ·
دواء الكبار`. Its TAKE verbs are `أخذ · أخذت · أكل · أكلت · تناول · تناولت`. Its only relevant
exclusion, L1241–1243, is:

> "**pills-only** — a TAKE verb whose ONLY object is **`حبوب`** and which carries no
> quantity/ownership qualifier … → not a hit"

`حبوب` is one object out of fifteen. Driven:

```
FIRES  poisoning/emergency  «أخذت الدواء الصبح»
FIRES  poisoning/emergency  «تناولت الدواء بعد الأكل زي ما قال الدكتور»
FIRES  poisoning/emergency  «أكلت الدواء بعد الفطور»
FIRES  poisoning/emergency  «أخذت دوا الضغط اليوم»
FIRES  poisoning/emergency  «تناولت دواء الحساسية»
FIRES  poisoning/emergency  «ابني أخذ الدواء على وقته الحمدلله»
FIRES  poisoning/emergency  «شربت الدواء مع المويه»
quiet                       «عندي ضغط وآخذ حبوب»        ← the one the exclusion covers
FIRES  poisoning/emergency  «بنتي بلعت حبوب»            ← correct, SWALLOW verb
```

§2.7's own reasoning at L1254 states the discriminator exactly right — *"Swallowing pills is
alarming on its own; taking them is what a hypertensive patient does every morning. **The verb is
the discriminator**"* — and then applies it to a single object. Nothing else catches it: §1.5 R1
makes `REFILL_CLAUSE_RE` a SOFT-side veto, and class G is HARD, so it is never consulted. §2.7's
near-miss table has no row for a patient taking prescribed medicine, which is among the most
common sentences a clinic receives.

Same `triage_hold` consequence as T2.

**Smallest fix.** Widen the pills-only exclusion from `حبوب` to the medication sub-list
(`حبوب · دوا · دواء · دواء الكبار · علاج · روشته`) for TAKE verbs only, keeping the existing
quantity/ownership qualifier appeal. SWALLOW verbs are unaffected, so `«بنتي بلعت حبوب»` and
`«ابني بلع كلور»` still fire.

---

### T4 — N6's fix reached the rule and the reason and never reached the table. Two rows sit under "Must NOT fire" while their own rules make them fire · **[DRIVEN + READ]**

**Defect.** §11.2, `SPEC-4-SAFETY.md:2035`: *"Every near-miss table in §2 is quiet **through the
union**, with the firing detector named in the failure message."*

Two rows in near-miss tables now carry reasons that say they *do* fire:

- `SPEC-4-SAFETY.md:1206` — `«حرارته 39 من كم شهر»`, under **"Must NOT fire (near misses)"**:
  *"`من كم شهر` is enumerated in this class's EXCLUSION set below; it scopes the fever-value arm
  only and **downgrades it to `urgent`**."* And §2.6's TIER row: *"fever arm with a chronicity
  term → `urgent`."*
- `SPEC-4-SAFETY.md:1222` — `«تسمم غذائي صار لي قبل اسبوع»`, same table heading:
  *"`قبل اسبوع` … **downgrades this hit to `urgent`**."* And §2.7's TIER row.

Driven, both modes:

```
FIRES  infant_fever/urgent   «حرارته 39 من كم شهر»
FIRES  poisoning/urgent      «تسمم غذائي صار لي قبل اسبوع»
```

`proof-faysal-false-positives.test.ts` as §11.2 specifies it asserts `fired === false` on both
rows. It is red at birth on both. This is exactly the re-audit's **N1 shape** — a fix that landed
in the data model and in the prose and never reached the artifact something downstream actually
reads — with the near-miss table in the role the frozen sentence played in N1.

**Smallest fix.** One sentence in §11.2: a near-miss row annotated `→ urgent` is asserted
`tier === "urgent"`, not `fired === false`. Or move the two rows into a TIER table of their own.

---

### T5 — Two classes are still narrower than their own Fires lists, and §2.0 L6 cannot prevent it because L6 is a proof obligation and the proof neither exists nor would gate · **[DRIVEN]**

The shape B5 found in Wave 1 and N2 found in Wave 1.5, surviving in v1.6 under the charitable
reading, in the two classes neither audit drove exhaustively.

**(a) `«طفلي حرارته ما تنزل»` — `SPEC-4-SAFETY.md:1148`, on §2.6's own Fires list — is silent.**

```
  clause: «طفلي حرارته ما تنزل»
  TERM(fever) present  : [حرارته]
  PREDICATE.redflag    : []            ← «ما تنزل» is in no set
  PREDICATE.infant     : []            ← «طفلي» is in NO set in this document
  temperature value    : none
  HIT = redflag ∨ (TERM ∧ (infant ∨ value ≥ 38)) = false
```

§2.6's infant markers are `رضيع · رضيعي · مولود · بيبي · عمره شهر · عمره شهرين · عمرها شهر ·
حديث الولادة`. `طفلي` — *my child* — is in none of them, and there is no persistence predicate on
the fever axis at all. A parent saying their child's fever will not come down produces no hit at
any tier.

**(b) `«البخاخ ما نفع»` — `SPEC-4-SAFETY.md:1055`, on §2.4's own Fires list — is silent.**

```
  clause: «البخاخ ما نفع»
  ربو boundary present : false
  EXACERBATION present : [البخاخ ما نفع, ما نفع]
  ARM 7 = ربو ∧ EXACERBATION → false.  No other arm matches.
```

ARM 7 requires `ربو` **and** an exacerbation predicate in the same clause. The sentence is a pure
exacerbation report — a failed rescue inhaler — with no asthma noun. It is on the Fires list and
the rule cannot reach it.

**Why §2.0 does not prevent this.** L6 is the law aimed at exactly this shape, and it is a
**proof obligation, not a structural constraint**: it says `proof-faysal-redflag-recall.test.ts`
builds `MUST_FIRE` from the Fires lists and fails if an entry has no assertion. That proof does
not exist; §11.0 and §12 row 13 correctly record that it would not block if it did, because
`core-gate.yml:112` swallows the exit code and `agent-eval.yml`'s `paths:` filter has no
`lib/health/**`. Until then, L6 prevents nothing — and its own §2.0 preamble's "314 of 314"
was computed by the same hand that wrote the rules.

**Smallest fix.** Add `طفلي · طفلتي · ولدي · ابني · بنتي` to §2.6's infant-marker set (or a
persistence predicate `ما تنزل · ما تنخفض · ما ترد · ما تروح`); make `البخاخ ما نفع` and
`ما رد على البخاخ` STANDALONE in §2.4 rather than EXACERBATION-only.

---

### T6 — §2.9's exclusion set is unenumerated, in explicit violation of §2.0 L3, in the one class where §1.3 says the over-fire cost is itself a safety cost · **[DRIVEN]**

**Defect.** §2.0 L3: *"Every predicate set is enumerated. A rule may never refer to a set it does
not list."* §2.9 rule 2, `SPEC-4-SAFETY.md:1334`:

> "**and no idiom object** in the same clause (`على` + **food**, `من الضحك`, `من الجوع`,
> `من التعب`, **a disease/allergen noun**)"

"food" and "a disease/allergen noun" are enumerated nowhere in §2.9, nowhere in §2, and nowhere
in the document. `grep` over all four specs finds exactly one food: `الكبسة`, and only as a
near-miss example. §2.9's "Written in §2.0's terms" paragraph declares `EXCLUSION = the idiom
objects (rule 2)` and never lists them.

**Driven** — the contract implemented as written, with the only food the document names:

```
quiet                      «أموت على الكبسة»          ← the one example given
FIRES  self_harm/emergency «أموت على المندي»
FIRES  self_harm/emergency «أموت على القهوة»
FIRES  self_harm/emergency «أموت على الشاورما»
FIRES  self_harm/emergency «أموت على الكيك»
FIRES  self_harm/emergency «أموت على قهوتكم بصراحة»
FIRES  self_harm/emergency «أموت على السمبوسة برمضان»
```

`«أموت على X»` is the ordinary Saudi way of saying you love something. §1.3 singles this class
out: *"Class I is the only class where the over-fire cost is itself a safety cost — a grieving or
joking patient handed a crisis rail is harmed by the interaction and learns to stop talking to
us."* An unenumerated exclusion set is the one place in §2 where that cost is unbounded, and
§2.0 L3 exists to forbid exactly it.

(Related, minor: §2.9 declares `TERM/PREDICATE/SITE` empty while rule 1 defines a death/harm verb
set. L1 permits an empty set; it forbids an unstated one.)

**Smallest fix.** Enumerate the food set and the disease/allergen set, or invert rule 2 the way
rule 3 already inverts `تعبت من`: `أموت على X` is a hit only when X is a first-person life
object, never when it is any other noun.

---

### T7 — §2.0 L2 and §2.0 L7 specify two different compositions and the document never says which wins. Under L2, §2.4's ARM 2 is silent on the exact string §2.4 says ARM 2 fixes · **[DRIVEN]**

**Defect.** §2.0 L2 (`SPEC-4-SAFETY.md:389–390`) defines composition over bare literals:

```
ADJ(A, B)       →  (A) ?(B)
ADJ(A, [M], B)  →  (A) ?(?:(M) ){0,2}(B)
```

§2.0 L7 (`SPEC-4-SAFETY.md:488–489`) says every term and phrase is matched with §1.2's matcher —
`(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?TERM(?![ء-ي])` — *"including multi-word phrases"*. The two are
not the same operation, and §2.0 never says whether `ADJ`'s operands are bare literals or
matcher-wrapped terms.

**Driven, on §2.4's ARM 2** = `ADJ(DIFFICULTY, [في|ب|بال|في ال], BREATHE-NOUN)`:

```
  normalizeAr("عندي صعوبة بالتنفس") = "عندي صعوبه بالتنفس"
  reading L2 (bare literals, notation verbatim)      : quiet
  reading L7 (operands wrapped in §1.2's matcher)    : FIRES
  the paired denial «ما فيه صعوبة بالتنفس الحمدلله»  : quiet under both
```

Under L2 the middle slot carries a mandatory trailing space (`(?:(M) ){0,2}`), so `بال` cannot
attach to `التنفس`; with zero middle slots `صعوبه` cannot reach `بالتنفس` either. Under L7 the
prefix group on `التنفس` absorbs the `ب` and it fires.

`«عندي صعوبة بالتنفس»` is the string §2.4 explicitly claims ARM 2 fixes (*"the ordinary Gulf
form — it matches nothing. ARM 2 accepts both"*), and it is the string §11.2 pairs with the
denial. Under one of the document's two stated compositions it is lost.

§2.0's opening argument is that *"six word lists and no joining rule is not a rule — it is two or
more rules."* It then supplies two joining rules for the same operator.

**Smallest fix.** One clause in L2: *"`ADJ`'s operands are §1.2-matched terms (L7), not bare
literals."*

---

## SHOULD-FIX

**S1 — §5.3's rewritten `availability` guard is un-normalized, and §5.2 says the banned shapes are
matched normalized. The N1 second-half fix is dead under the document's own matching discipline.
[DRIVEN]** §5.2's table header reads *"Banned shapes (**normalized**)"*. §5.3's new block
(L1684–1688) writes `شغالة`/`مفتوحة`/`متاحة`/`موجودة` and `على مدار الساعة`/`24 ساعة`.

```
  normalizeAr(G4-as-was) = «… والطواري عندنا شغاله علي مدار الساعه في {er_branch_name}.»
  pattern «على مدار الساعة» vs «علي مدار الساعه» → no match
  pattern «شغالة»          vs «شغاله»            → no match
  guard(RAW  G4-as-was) = BLOCKED
  guard(NORM G4-as-was) = PASSES            ← the case §5.2 specifies
  guard with the pattern list normalized too = BLOCKED
```

§11.4's *"in normalized and un-normalized spelling"* clause catches it if `availability` is read
as a §5.2 kind, which §5.3 says it is — so this is self-catching once the proof is written. It is
T1's shape outside §2, and it lands on the fix for the blocker the re-audit said it would fix
first.

**S2 — §1.4's frame regexes carry three dead alternatives. [DRIVEN]** `HYPOTHETICAL_RE`'s `إذا`
and `إن`, and `BOOKING_FRAME_RE`'s `نتيجة (?:ال)?تحليل`, never match normalized text. All three
are harmlessly shadowed by a live alternative (`اذا`, `ان`, bare `تحليل`), so nothing is silent —
but §2's preamble already forbids the shape and §11.1's assertion should reach §1.4's regexes too.

**S3 — the `RELATION_WORDS` prescription is already implemented under another name, and following
the PR list as written would create the duplicate the file exists to prevent. [DRIVEN, READ]**
SPEC-4 §2.4 (L1022) and SPEC-3 §10.2 both prescribe *"export the relation list from
`lib/ai/symptom-frames.ts` as its own constant — `RELATION_WORDS` — and compose `FRAME_WORDS`
from it."* At `HEAD` that is done: `PERSON_WORDS` is exported at L25–27 and `FRAME_WORDS` is
composed from it (commit `5906b91`, "WIP — DO NOT MERGE: emergency detector mid-edit",
2026-09-09 14:21, fifteen minutes after the specs' last commit). Two differences matter:
`PERSON_WORDS` lacks `طفلي · رضيعي · جدي · جدتي`, which the prescribed string carries and which
§2.6 and §11.1 need; and an implementer following the PR list would add a second constant. That
file's own header says *"a copied list is how this file came to exist."* Point both specs at
`PERSON_WORDS` and prescribe the four additions instead.

**S4 — §13 item 2d's three upstream findings are already being closed in this tree. [DRIVEN]**
§13 2d reports `«ما عاد يتنفس»`, `«ما عاد يقدر يتنفس»` and `«عندي صعوبة بالتنفس»` as
`fired: false` on the shipped `detectAllergenEmergency`. **All three were exactly right at
`e1791f5`** — I checked that file out and drove it — and **all three are `fired: true` at HEAD**,
where the same WIP commit is mid-rewrite of that detector. Also: SPEC-3 §10.2 says
`symptom-frames.ts` is 36 lines; it is 44 at HEAD. Neither is a spec defect — the specs were
correct when written — but §13 is a hand-off, and a hand-off that names a hole someone is
already filling should say so. Nothing in either audit's driven evidence about the *pre-WIP* file
was wrong.

**S5 — §2.9 declares `TERM/PREDICATE/SITE` empty while rule 1 defines a verb set.** §2.0 L1: a
class "may leave a set empty; it may not leave it unstated."

**S6 — §2.1's `على الصدر` (L552) is un-normalized but harmlessly shadowed by `الصدر`.** Recorded
only so the T1 pass is complete and does not stop one entry short, which is the failure mode this
document keeps finding.

---

## PART 2 — Does §2.0 structurally prevent the recurring shapes?

This was the question I was asked to answer, and it has a specific answer.

| recurring shape | §2.0's rule | structural? | driven verdict |
|---|---|---|---|
| a rule narrower than its own Fires list | **L6** | **No — a proof obligation, not a constraint** | **survives**: T5 (2 entries) under the charitable reading; 20 more under the literal one. The proof L6 relies on does not exist, and §11.0/§12 row 13 record that it would not gate if it did. |
| an un-normalized string on a Fires list | **L6**, last bullet | **No — and the rule contradicts itself** | **survives**: T1, 57 entries in 7 of 9 classes, including the entry the note claims to have fixed |
| a fix that never reached the artifact (N1's shape) | **none** | **No rule exists** | **survives**: T1(b) §2.8's prose-only correction; T4's two near-miss rows |
| a veto scoped to the message, not the clause | **L4** | **Yes — normative and closed** | closed; re-driven on all five N3 strings |
| a HARD class reasoned as vetoable | **L5** + §1.5 R1 | **Yes — normative and closed** | closed; I swept **all nine** near-miss tables, not the named ones. Every reason that mentions a frame now says *"not the frame"*. §2.3's residual (S1.5-1) and §2.8's fifth instance are both closed. |
| a term in a veto set and in no term set (`رعاف`) | **none** | **No rule exists** | no new instance found — closed case by case, not by law |
| **— new —** a term set wide enough to fire on ordinary traffic | **none. L3 *mandates* enumeration; L6 mirrors only in the recall direction** | **No** | **T2, T3, T6** |

**The one-line answer: §2.0's law is asymmetric.** L6 gives recall a mechanical mirror — every
Fires entry becomes a `MUST_FIRE` assertion — and gives precision nothing. There is no rule that
an enumerated `TERM`/`SITE`/`PREDICATE`/`STANDALONE` member must be paired with a near-miss.
§11.2's pairing discipline runs the *other* way: each narrowing paired with the true positive it
must not cost.

Both of the new emergency-class false-positive families I found were **created by lists that L3
required be enumerated** — `نفسه` in BREATHE, `دواء` in class G's SITE. Enumerating a set is the
right law; enumerating it without a matching obligation in the precision direction is how §2.0
traded one shape for another. And that missing law is also the general form of the `رعاف` shape,
which today has no rule at all and was closed by inspection.

Three of the six shapes are genuinely, structurally closed. That is real progress and it is why
this audit is shorter than the last two.

---

## What checked out that I expected not to

Recorded because a third-pass defect list is more misleading than a second-pass one.

- **All six Wave 1.5 blockers close with mechanism**, and N4's eight-arm block is the kind of
  answer that only comes from driving both readings and rejecting both.
- **Wave 1.6 is right and the re-audit is wrong on S1.5-6.** I recomputed the importer counts
  independently expecting to confirm the re-audit's 31 and got 36 / 34 / 26 / 25, exactly as
  SPEC-1 DOC-4 and SPEC-3 §10.2 now state.
- **Wave 1.6's counter-argument on N4's near-miss is correct.** I re-drove it: a `ما عاد`
  resolution veto that silences `«الحمدلله ما عاد حلقي يقفل»` also silences five phrasings of
  respiratory arrest. Carrying it as an annotated `MUST_FIRE` over-fire and pushing the question
  to §12 row 1 is the right call. **That is the second time a remediation has caught an auditor
  being wrong, and both times it was right.**
- **Every quotation of a real file re-verifies verbatim.** `safety-hold.ts` 23 lines and
  `isSafetyHeld` exact; `safety-hold-guard.ts` 67 lines; `norm()` at `order-pricing.ts` L99–105
  exact (tashkeel + tatweel, whitespace, lowercase, nothing else); `stripComments` at L52 with no
  `export`; `bindingsFrom` at L169 nested in a block; 119 migration files, 59 with
  `restaurant_id`, 65 with `restaurants`. I checked all of them expecting drift and found only
  the two caused by the live WIP edit (S4).
- **Every CI fact re-verifies.** `core-gate.yml:112` `continue-on-error: true` with the L109–111
  comment; `agent-eval.yml`'s `paths:` filter with no `lib/health/**`; both `local-rules` at
  `"warn"` in `.eslintrc.json`. §11.0 and §11.9 remain the best-engineered part of this plan.
- **§11.2's boundary corpus is 30/30**, including the three new §2.0 L7 phrase rows. Driven, a
  phrase matched with a bare `(?<![ء-ي])` lookbehind is quiet on `«حاس بثقل على صدري»`,
  `«ومو راضع»` and `«وأبي أرتاح للأبد»`, and fires with the prefix group. L7 is correct and it is
  a genuinely new find.
- **N1's copy-layer close is complete**, and §5.3's rewrite — banning the *claim* in any
  inflection, with the carve-out scoped to the field the tool returned rather than to "it came
  from a tool" — is a better structural answer than the re-audit asked for.
- **§12's sign-off table is still entirely empty.** Four new clinical questions were added to
  blocking rows in this pass and none of the fifteen was quietly filled in. It still says the
  specification describes a system that must not receive a real patient message. That remains the
  single best thing in these four documents.
- **Cross-spec agreement holds** everywhere I could test it. I swept every symbol, string, type
  and ownership boundary defined in more than one document — `997`, `920009303`, `0504490460`,
  `erSites`, `openStateAt`, `normalizeAr`, `triage_hold`/`isTriageHeld`, `detectRedFlag`,
  `isFaysalSafetyInbound`, `callback_request`, `appointmentKind`, `demo_seeded`,
  `client_confirmed`, `stopReason`/`faysal_redflag_emergency`, `DEMO_MODE`, `requiresDemoLabel`,
  `assertsMedicalClaim`, `bookableWindows`, `lib/health/redflag` — and found **no** disagreement.
  The price label that audit 2 caught (S1.5-2) is now settled with an explicit ownership boundary
  in both directions, and criterion #14 is correctly split into two assertions.

## What I could not verify

- **§3.1's 500-message corpus and §3.4's shadow-mode gates.** Still no corpus in the repo. The
  ≤ 0.5 % false-positive budget is unmeasurable today — though T2 and T3 are the first evidence
  that it is not obviously reachable. **[SUSPECT — correctly gated by §12 row 12.]**
- **Whether `erSites({ now })` can return a site eligible by weekday hours alone.** §4.4 lists
  both fields and never says eligibility requires `er_open_24h`. N1 is closed either way now,
  because the sentence no longer makes a 24-hour claim. **[READ — still ambiguous, now harmless.]**
- **The clinical correctness of every threshold** in §1.3, §2.6 and §5.1, the `«دم مع البول»`
  tier, the accepted `ما عاد` over-fire, the post-extraction gum bleed, and whether 997 or the
  Riyadh 911 line is right for this catchment. **[SUSPECT — §12 blocks on signatures for all of
  it, and is right to.]**
- **`docs/ALLERGEN_SYMPTOM_REVIEW.md`'s one-of-nine-call-sites claim**, cited by §10. Not read in
  full — the same gap both previous audits declared. **[NOT CHECKED.]**
- **My own class implementations are mine, not the spec's.** Where a rule was ambiguous I say so
  and drive both readings (T7); where a list was un-normalized I drive both disciplines (T1).
  Every failure above is reproducible from the harness described in the Method note.

---

## VERDICT: **BLOCKED**

Seven blockers. **The six Wave 1.5 blockers are genuinely closed, all seven should-fixes are
closed, nothing regressed, and §2.0 structurally eliminated three of the six recurring shapes.**
That is the most any pass has achieved, and the two places where Wave 1.6 says a previous
auditor was wrong, it is right.

What blocks is three things:

1. **§2.0's law is asymmetric.** It mirrors Fires lists into `MUST_FIRE` and mirrors nothing into
   `MUST_BE_QUIET`. Two emergency classes now fire on ordinary clinic traffic — «الموعد ما نفسه
   اللي حجزته» and «أخذت الدواء الصبح» — and each one opens a booking lock only a named operator
   can release. A third, `self_harm`, fires on «أموت على المندي» because its exclusion set was
   never enumerated at all. (**T2, T3, T6**)
2. **The normalization shape survived §2.0 in 57 places**, including inside §2.8's own note
   claiming to have fixed it, and it takes B4's ACS-with-diaphoresis fix back down with it.
   (**T1**)
3. **Two smaller instances of shapes §2.0 was written for but did not reach** — a rule narrower
   than its Fires list in §2.4 and §2.6 (**T5**), a fix that reached the rule and not the table
   in §2.6 and §2.7 (**T4**) — plus one ambiguity inside §2.0 itself (**T7**).

### The single smallest change that flips this to APPROVED

Stated honestly, because pretending it is one line is the failure mode these documents exist to
catch. It is **three amendments to §2.0 and the mechanical pass they authorise.**

> **Add §2.0 L8 — the precision mirror — and settle two sentences in L2 and L6.**

1. **New L8, the mirror in the other direction.** Every member of every enumerated `TERM`, `SITE`,
   `PREDICATE` and `STANDALONE` set is mirrored into `MUST_BE_QUIET` as the ordinary clinic
   sentence that carries that member *without* the finding, exactly as L6 mirrors Fires entries
   into `MUST_FIRE`. `proof-faysal-false-positives.test.ts` fails if an enumerated set member has
   no paired near-miss. That single assertion would have caught `نفسه` in BREATHE, `دواء` in class
   G's SITE, and the unenumerated food set in §2.9 at birth — and it is the general form of the
   `رعاف` shape, which today has no law. *(T2, T3, T6)*
2. **L6, one sentence, pick one discipline.** "Term lists are normalized at build time" and
   "§11.1 asserts `list === list.map(normalizeAr)`" cannot both hold. Keep the assertion; delete
   the build-time clause; normalize the 57 entries in place. *(T1, and S1, S2, S6 in the same
   pass — the list is in this audit, line-numbered.)*
3. **L2, one clause.** "`ADJ`'s operands are §1.2-matched terms (L7), not bare literals." *(T7)*

Four mechanical edits land in the same pass and are each one line:

- **§2.6**, add `طفلي · طفلتي · ولدي · ابني · بنتي` to the infant markers, or `ما تنزل ·
  ما تنخفض · ما ترد` as a fever-persistence predicate; **§2.4**, make `البخاخ ما نفع` and
  `ما رد على البخاخ` STANDALONE. *(T5)*
- **§11.2**, one sentence: a near-miss row annotated `→ urgent` is asserted `tier === "urgent"`,
  not `fired === false`. *(T4)*
- **§2.4**, `نفسه · نفسها` out of BREATHE. *(T2)*
- **§2.7**, the pills-only exclusion widened from `حبوب` to the medication sub-list for TAKE
  verbs. *(T3)*

S1 and S3 should land in the same pass, because each makes a mandated proof or a prescribed PR
false at birth. S2, S4, S5 and S6 can wait for Wave 2.

Wave 1 should not proceed to code until L8 exists. Everything else on this list is an afternoon.
