# AUDIT — WAVE 1.5 · فيصل / Faysal

**Re-auditor:** second pass, adversarial. **Date:** 2026-09-09.
**Scope:** the four specs as of `e5c30f7` ("Wave 1.5 — nine blockers closed, and the audit's own
fix was wrong"), re-driven against `AUDIT-WAVE1.md`, `REVIEW-WAVE1.md`, `SOURCE_DOSSIER.txt`, and
the repo at `claude/pm-replacement-test-y8xq96`.

**Method.** Everything marked **[DRIVEN]** was executed. The §1.2 boundary matcher was built
verbatim over the real `normalizeAr` (`lib/ai/allergen-gate.ts` L19–31); the §1.4 frames were
built verbatim; the new §2.1–§2.4 rules were implemented from the spec text and run; the real
`detectAllergenEmergency`, the real `FRAME_WORDS` and the real `NOT_A_PERSON` were imported and
executed through `node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs`;
`lib/db/safety-hold.ts`, `lib/db/safety-hold-guard.ts`, `lib/order-pricing.ts`,
`lib/ai/callback-trigger.ts`, both CI workflows and `.eslintrc.json` were read verbatim.
**[READ]** means the named file or spec section was read. Where I could not verify something I
say so.

**Verdict up front: BLOCKED. 6 blockers, 7 should-fix.**

This is a much stronger set of documents than the ones the first audit read. Eight of the nine
blockers are closed with real mechanism, one is closed with a residual, and B7 — the gating
blocker — is closed *better* than the audit asked for, because §11.9 turns a prose requirement
into an executable assertion that reads the workflow file. The remediation also drove its own
work honestly: 23 of 23 rows in the rewritten §11.2 boundary table reproduce exactly under
independent driving, including the five it corrected.

The blockers below are not the first audit's blockers returning. They are new, and four of the
six are the *same shapes* the first audit named, surviving in the one or two places the
remediation did not sweep — a HARD class silenced by a frame, a rule narrower than its own Fires
list, a fix landed in one document and not its partner. That is what a second pass is for.

---

## PART 1 — Are the nine blockers actually closed?

Each re-driven from the original failure case in `AUDIT-WAVE1.md`.

| ID | Verdict | Evidence |
|---|---|---|
| **B1** hardness absolute | **CLOSED**, one residual | driven below |
| **B2** thread hold | **CLOSED** | mechanism compared against the real files |
| **B3** airway third person | **CLOSED**, new defect in the fix | driven below |
| **B4** cardiac definite article | **CLOSED**, new defect in the fix | driven below |
| **B5** hemorrhage | **CLOSED**, new defect of its own shape | driven below |
| **B6** ER model | **CLOSED at the data layer, NOT at the copy layer** | driven/read below |
| **B7** gating | **CLOSED — the best work in this pass** | CI files read |
| **B8** denylist normaliser | **CLOSED** | driven below |
| **B9** exception → emergency | **CLOSED** | read below |

### B1 — a booking frame silences HARD classes · **[DRIVEN]** · CLOSED with a residual

New §1.5 R1 is normative and explicitly overrides anything that contradicts it. §2.2's `شلل`
rule struck the booking clause. Driving §2.2's v1.5 rule (boundary `شلل`, negative lookahead on
`الأطفال`/`اطفال`, `الرعاش` before or after, nothing else) over `normalizeAr` output:

```
FIRES  booking=true   «ابغى موعد اليوم لان امي جاها شلل نصفي فجاه»    ← the audit's failure case
FIRES  booking=true   «احجز لي بكرة، ابوي جاه شلل بنص جسمه فجأة»
quiet  booking=true   «متى تطعيم شلل الأطفال؟»                        ← lookahead, not the frame
quiet  booking=false  «الشلل الرعاش»
FIRES  booking=false  «عندي شلل نصفي من سنة»
```

The stroke fires through the booking frame. The polio vaccine stays quiet on the mechanism §2.2
already had. Correct.

**Residual (should-fix S1.5-1).** R1 asserts *"no HARD near-miss is explained by a frame any
more — each is explained by a test that is in the message"* and *"There is no HARD class, no
term, and no clause in §2 for which a booking frame is part of the firing decision."* **That is
false of the document as it stands.** `SPEC-4-SAFETY.md:465`, §2.3's near-miss table — class C,
**HARD**:

> | `«أبغى تحليل دم»` · `«فصيلة دمي»` · `«تبرع بالدم»` · `«صورة دم كاملة CBC»` | booking frame |

§2.1, §2.2, §2.4, §2.5, §2.6, §2.7 and §2.8 all had their reasons rewritten. §2.3 — the class the
remediation rewrote most heavily — did not, and the Wave 1.5 closure table's own list of rewritten
sections omits §2.3, so this is a sweep that stopped one section short rather than a claim made
in bad faith. Behaviourally harmless: driven, all four are quiet for want of a predicate and a
site. But it is exactly the teaching-defect the first audit named ("it teaches the implementer
that the booking frame is a live veto on HARD"), surviving in one of five places.

### B2 — the rail is escapable on the next turn · **[READ, files compared]** · CLOSED

§1.5 R2 is a mechanism, not a repeated assertion. Checked against the real files:

- The quoted `isSafetyHeld` is **verbatim correct** against `lib/db/safety-hold.ts` L20–23.
- The quoted `safety-hold-guard.ts` header fragments are **verbatim correct** (L5–6 "MUST NOT be
  committed", L9–11 "RELEASE is an explicit operator next-action", L13–15 "Fail-CLOSED on a read
  error … safety over convenience").
- The stated line counts are right: `safety-hold.ts` = 23, `safety-hold-guard.ts` = 67.
- H-6's cancellation carve-out is a faithful transfer of the guard's own
  `COMMITTED_ORDER_STATUSES` comment ("cancelling a held order is always allowed").

What makes this a real closure rather than prose: `checkBookingTriageHold` is read **at the
write** (H-2, explicitly not in the prompt, not in tool selection, not as a system message);
§4.1 makes `openTriageHold()` **the one awaited write on the rail path** and emits a P0
`triage_hold_write_failed` if it fails; release is operator-only with `released_by`/`released_at`
and no timer, message, model output or flag can clear it (H-5, §10); §11.8's assertion is
written to be un-gameable (*"if this test can be made to pass by making the first assertion fail,
it is measuring the detector, not the hold"*); §12 row 14 is a launch gate; and `[OPEN-17]` names
the operator surface nobody owns.

**Honestly recorded caveat, not a defect:** H-2 and H-3 bind to a "booking spec" that does not
exist in Wave 1. §13 item 2b lists it as *still open*. The mechanism is specified; the document
that must implement it is not written. That is disclosed, not hidden.

Two nits: `checkBookingTriageHold(admin, clinicId, holdToken)` never says how a `holdToken`
resolves to a conversation row; and `COMMITTED_APPOINTMENT_STATES` is exported but no predicate
in §1.5 R2 consumes it (H-6 references it without a rule that reads it).

### B3 — the airway family is first-person only · **[DRIVEN]** · CLOSED, with a new defect in the fix

Driving the §2.4 v1.5 three-person lexicon, all fourteen strings the spec lists as `*** DEFECT ***
quiet` on the inherited detector now fire:

```
FIRES  neg+breathe     «ابني ما يقدر يتنفس»          FIRES  cyanosis        «ابني شفايفه زرقاء»
FIRES  neg+breathe     «الطفل ما يتنفس»              FIRES  swelling        «زوجتي حلقها يتورم»
FIRES  neg+breathe     «بنتي ما تقدر تتنفس»           FIRES  throat+closing  «ابني حلقه يقفل»
FIRES  neg+breathe     «ابني مو قادر يتنفس»           FIRES  swelling        «ولدي وجهه منتفخ»
FIRES  neg+breathe     «أمي ما تقدر تتنفس»            FIRES  swelling        «بنتي لسانها يتورم»
FIRES  neg+breathe     «ابني عمره سنتين وحلقه يقفل وما يقدر يتنفس»
FIRES  swelling        «طفلي شفايفه تورمت»
```

and every §2.4 near-miss stays quiet («فرع الربوة», «كربوهيدرات», «مربوط», «عندي ربو ومحتاج
تجديد البخاخ», «موعد صدرية», «تحليل وظائف رئة», «فرع الشفا», «نفسي ضايق من الانتظار»). The class
is closed. **See blocker N4 below** for the defect the fix introduced.

### B4 — cardiac cannot hear «ألم بالصدر» · **[DRIVEN]** · CLOSED, with a new defect in the fix

Driving the §2.1 v1.5 enumerated list (`صدري صدره صدرها بصدري فصدري الصدر بالصدر في الصدر على
الصدر قلبي قلبه قلبها`) with a clause-scoped pain/pressure predicate:

```
FIRES  «ألم في الصدر»           FIRES  «الصدر يعورني»
FIRES  «ألم بالصدر»             FIRES  «حاس بضغط على الصدر»
FIRES  «وجع بالصدر من ساعة»      FIRES  «زوجي يشتكي من ألم في الصدر»
FIRES  «عندي ألم شديد بالصدر وأتعرق»   ← the audit's ACS-with-diaphoresis failure case
FIRES  «احجز لي كشف بس صدري يعورني وأتعرق»   ← R1's booking-frame-in-one-clause assertion
FIRES  «ما عندي مشكلة بس صدري يعورني وأتعرق»  ← §1.2's denial-opener assertion
```

and the addition costs nothing: all fourteen §2.1 near-misses stay quiet, including the four
chest-X-ray sentences («أبغى أشعة على الصدر», «موعد أشعة الصدر», «كم سعر أشعة الصدر؟»,
«الأشعة طلعت على الصدر سليمة»), «صدر التقرير أمس؟», «صدر الدجاج مسموح في الرجيم؟» and «أبغى موعد
صدرية». **See blocker N5 below.**

### B5 — the hemorrhage rule is narrower than its own Fires list · **[DRIVEN]** · CLOSED, and the same shape survives

Driving §2.3's v1.5 rule block verbatim
(`HIT = STANDALONE OR (TERM AND (PREDICATE OR SITE)), minus the VETOes`), 32 of 32:

```
FIRES  «نزيف ما يوقف»           FIRES  «نزيف شديد»            FIRES  «نزيف غزير»
FIRES  «نزيف قوي مره»           FIRES  «الجرح ينزف بقوة»       FIRES  «دم واجد من الجرح»
FIRES  «ينزف من نص ساعة وما وقف» FIRES  «الدم فوار من الجرح»    FIRES  «جرح عميق وينزف»
FIRES  «براز أسود»              FIRES  «الجرح حق ابني ينزف بقوة»
quiet  «أبغى تحليل دم»          quiet  «نزيف اللثة شديد لما أفرش»  ← the paired near-miss holds
quiet  «الحمدلله وقف النزيف»     quiet  «رعاف بسيط»            quiet  «ألم في قدمي»
```

Both structural gaps the audit named are closed: the verb forms are terms, and `شديد|غزير|قوي|
بقوه|واجد|فوار` are predicates. The gum veto sitting **outside** the predicate test is the right
call and is driven. **See blockers N6 and N7 below** — the same shape survives twice in this
section.

### B6 — three incompatible ER models · **[DRIVEN / READ]** · CLOSED at the data layer, NOT at the copy layer

`grep -rn "has_24h_er" docs/faysal/*.md` returns hits only in `AUDIT-WAVE1.md` and in the three
Wave 1.5 notes recording the deletion. SPEC-4 §4.4 carries an explicit **OWNERSHIP** block;
SPEC-2 §10 replaces the boolean with `erSites({ now })` and deletes `emergency_number` as a slot;
SPEC-1 §11 MED-2 no longer names Complex 1 or Shoaa Al Wurud and its `er` hours layer is
re-scoped to informational-only. Three models became one, with a named owner. **See blocker N1
below** — the sentence that produced the failure was not changed.

### B7 — none of the ten proofs blocks · **[READ, CI files verified]** · CLOSED, and this is the best work in the pass

Re-verified independently:

- `.github/workflows/core-gate.yml:112` — `continue-on-error: true`, with the L109–111 comment.
- `agent-eval.yml`'s `paths:` filter — no `lib/health/**`.
- `.eslintrc.json` L6–7 — both `local-rules` at `"warn"`.

§11.0 retracts the false claim **with the file evidence**, adopts SPEC-3 §2.4's three steps as a
precondition of its own proof plan rather than delegating them, §12 row 13 makes it a launch
gate, and §11.9 **asserts the wiring in code**: the meta-proof reads `agent-eval.yml` and fails
if any `proof-faysal-*.test.ts` on disk is absent from its `run:` steps, or if `lib/health/**` is
absent from its `paths:`. SPEC-3 §13 risk 2 updated to match. A wiring requirement that only
lived in prose is now the one assertion that guards the plan itself. This is a better close than
the audit asked for.

### B8 — the denylist guard uses the wrong normaliser · **[DRIVEN]** · CLOSED

```
norm()       UNEQUAL / normalizeAr EQUAL   «هبة أحمد»       vs «هبه احمد»
norm()       UNEQUAL / normalizeAr EQUAL   «أحمد سيد مصطفى»  vs «احمد سيد مصطفي»
norm()       UNEQUAL / normalizeAr EQUAL   «هدى الرشيدي»     vs «هدي الرشيدي»
norm()       UNEQUAL / normalizeAr EQUAL   «سارة الجندي»     vs «ساره الجندي»
```

`lib/order-pricing.ts` L99–105 read verbatim: tashkeel + tatweel, whitespace, `toLowerCase`, and
nothing else — exactly as both the audit and the rewritten DOC-4 describe it. DOC-4 now names
`normalizeAr`, acceptance criterion #34 asserts both the «هبه احمد» case and the mononym case,
and the matching-discipline table ships **both** disciplines (full-name containment for
multi-token entries, boundary-matched single token for mononyms) — which is what S21 asked for.
Driven on the mononym: full-name equality on «نورين» against «الممرضة نورين» is `false`;
containment and boundary-match are both `true`.

### B9 — "fail closed" leaves booking open · **[READ]** · CLOSED

§1.5 R3, §1.3's explicit note (*"`urgent` is a classification verdict, never a failure verdict"*),
§10's rewritten row and §11.9's assertion all say the same thing: any throw, timeout or
non-conforming return produces `tier: "emergency"`, rail **branch B**, `997`, `toolNames: []`,
`canBook: false`, `presentation: null`, `triage_hold` set, **P0**. §11.9 asserts it *"on the
arguments actually passed to the pager and the writer, not on the rendered string alone"* and
adds *"a stub that returns `urgent` must fail this proof."* The over-fire cost is stated and
given its own budget line (≤ 0.05 %, excluded from §3.4's 0.5 %) rather than hidden. Closed.

---

## PART 2 — Did the remediation break anything it did not touch?

**No.** This is the cleanest part of the pass and it deserves saying plainly.

**The §11.2 boundary-behaviour table: 23 of 23 rows reproduce under independent driving**,
including all five the remediation corrected.

```
ok  spec=quiet driven=quiet  ربو    «فرع الربوة»          ok  spec=fires driven=fires  الصدر  «ألم في الصدر»
ok  spec=quiet driven=quiet  ربو    «كم كربوهيدرات»        ok  spec=fires driven=fires  بالصدر «ألم بالصدر»
ok  spec=fires driven=fires  ربو    «عندي ربو»            ok  spec=fires driven=fires  صدر    «صدر التقرير أمس؟»
ok  spec=fires driven=fires  شفا    «فرع الشفا»           ok  spec=fires driven=fires  صدر    «صدر الدجاج…»
ok  spec=quiet driven=quiet  شفايف  «شفايفه زرقاء»         ok  spec=quiet driven=quiet  صدر    «…من المصدر»
ok  spec=fires driven=fires  شلل    «شلل الأطفال»          ok  spec=quiet driven=quiet  بلع    «التهاب البلعوم»
ok  spec=quiet driven=quiet  صدر    «صدري يعورني»          ok  spec=fires driven=fires  بلع    «صعوبة في البلع»
ok  spec=quiet driven=quiet  حادث   «وين قسم الحوادث»      ok  spec=fires driven=fires  كسر    «الكسر العشري»
ok  spec=quiet driven=quiet  كسر    «المكسرات» «انكسر»      ok  spec=quiet/fires        نزيف/ينزف «الجرح ينزف»
ok  spec=quiet driven=quiet  دم     «ألم في قدمي» «عدم تحمل» «تقديم الأوراق»
```

**The five whole-word traps** all behave as documented: `ربو` quiet on «الربوة» and firing on
«ربو»; `شفا` **firing** on «الشفا» (therefore not a term) and quiet on «شفايف»; `شلل` firing on
«شلل الأطفال» (therefore the lookahead, not the boundary); `صدر` firing on «صدر الدجاج»; `كسر`
firing on «الكسر العشري».

**The site-name corpus** is clean: «موعد في فرع الربوة», «شعاع الورود», «الوطن 1 اليمامة»,
«شعاع الروضة», «فرع الروابي» carry **zero** boundary-matched red-flag terms. «فرع الشفا» carries
`شفا`, which is precisely why §2.4 forbids `شفا` as a term.

**The bereavement case** is quiet under §2.9 rule 4 in all three punctuation variants, including
the no-comma form: «توفي والدي الله يرحمه، ألغوا الموعد» · «ألغوا الموعد، توفي والدي الله يرحمه» ·
«توفي والدي الله يرحمه ألغوا الموعد».

**The cardiac addition costs nothing.** All four chest-X-ray sentences, both `صدر`-as-a-whole-word
sentences, and «أبغى موعد صدرية» stay quiet with `الصدر`/`بالصدر`/`في الصدر`/`على الصدر` added.

**The hemorrhage additions cost nothing.** «نزيف اللثة شديد لما أفرش أسناني» — the string the
remediation names as the one to watch — stays quiet, because the gum veto sits outside the
predicate test. «أبغى تحليل دم», «فصيلة دمي», «تبرع بالدم», «صورة دم كاملة CBC», «رعاف بسيط» and
all four `دم`-substring near-misses stay quiet.

The one genuine regression risk the new lexicons introduce is N4 below, and it is an
under-specification rather than a driven false positive.

---

## PART 3 — The five "the auditor missed this" claims

**Four of five hold. The fifth is the first audit's own S12, re-driven.** The remediation's own
text is honest about which is which; the framing in the hand-off is not.

### Claim 1 — `FRAME_WORDS` is `false` on all six third-person airway strings, so the audit's B3 fix does not work · **[DRIVEN against the real file] · TRUE, and it is the important one**

```
frame=false  «ابني ما يقدر يتنفس»      frame=false  «زوجتي حلقها يتورم»
frame=false  «الطفل ما يتنفس»          frame=false  «بنتي ما تقدر تتنفس»
frame=false  «ابني شفايفه زرقاء»        frame=false  «ابني حلقه يقفل»
frame=false  «ابني مو قادر يتنفس»       frame=false  «أمي ما تقدر تتنفس»
frame=false  «ولدي وجهه منتفخ»          frame=false  «بنتي لسانها يتورم»
frame=false  «طفلي شفايفه تورمت»        frame=false  «ابني عمره سنتين وحلقه يقفل وما يقدر يتنفس»
frame=TRUE   «ابني فيه طفح»             frame=TRUE   «ابني عنده حراره»
```

Tested both raw and `normalizeAr`'d. The cause is exactly as stated: the relation list appears in
`FRAME_WORDS` **only** welded to a possession verb —
`(?:ابني|بنتي|…|مرتي)\s+(?:فيه|فيها|فيهم|عنده|عندها|عندهم)` — so it matches «ابني **عنده** حرارة»
and cannot match «ابني **ما يقدر** يتنفس», where the relation is the subject of an ordinary verb.
The audit's B3 prescribed *"Anchor them on `FRAME_WORDS`"*; read as a requirement, anchoring would
have left all twelve strings quiet. **The remediation is right and the first audit was wrong on
that line.** The prescribed `RELATION_WORDS` export is the correct named change and is
behaviour-preserving for both existing callers.

Two qualifications, both material and neither disqualifying:

1. The audit's B3 fix had **three** parts, and the other two — *"every body-part term in classes
   A–D must be enumerated in first and third person"* and *"the negation families must accept
   `يقدر/تقدر/يقدرون` beside `اقدر`"* — are what actually close the class. The remediation
   implemented exactly those two and my driving confirms they suffice **without** any frame
   anchor. So the audit's fix was right in its substance and wrong in one of its three clauses.
2. The audit's own driven evidence in B3 was correct in every particular, and its S12 already
   recorded that `FRAME_WORDS` "carries bare `عندها`/`عندهم`" — one observation short of this.

This is a genuine correction to a prescribed line, not a reversal of the finding. It also has a
knock-on: **§12 row 15 over-claims.** It says *"Until it lands, third-person symptom reporting is
deaf"* — driven, the enumerated three-person lexicon in §2.4 closes B3 by itself, with or without
`RELATION_WORDS`. Harmless (it makes one more thing blocking), but it is the same false-precision
the document flags elsewhere.

### Claim 2 — «صدر الدجاج مسموح في الرجيم؟» fires a boundary-matched bare `صدر` · **[DRIVEN] · TRUE, new**

`(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?صدر(?![ء-ي])` **fires** on it. The first audit listed the string
and explained it as safe on the predicate — it did not notice the boundary fails. Correct find,
and it belongs beside the audit's own S17.

### Claim 3 — «الكسر العشري» fires a boundary-matched bare `كسر` · **[DRIVEN] · TRUE, new**

Fires. Neither the first draft nor the audit had it. §2.8 now records it correctly, with the right
consequence: bare `كسر` must never be added as a recall net.

### Claim 4 — `normalizeAr` does not strip «ال» · **[DRIVEN] · TRUE**

`normalizeAr("الرشيدي") === "الرشيدي"`. The audit's B8 wrote *"The function that does all of them
is `normalizeAr`"* of a four-item list that included stripping `ال`. Three of four hold; the
fourth does not. The remediation's reasoning for why it does not matter — the article normalises
identically on both sides of a full-name comparison, and stripping it would widen the match
surface — is correct.

### Claim 5 — `symptom-frames.ts` is not domain-neutral; five clinic sentences read as symptom reports · **[DRIVEN] · TRUE as a fact, NOT NEW as a find**

```
frame=TRUE  notPerson=false  «العياده عندها ازدحام»    frame=TRUE  notPerson=false  «الفرع عنده زحمه»
frame=TRUE  notPerson=false  «المستشفي عنده طوارئ»     frame=TRUE  notPerson=false  «الاستقبال عنده مشكله»
frame=TRUE  notPerson=false  «المجمع عنده تاخير»       frame=TRUE  notPerson=TRUE   «المطعم عنده زحمه»
```

All five confirmed. But this **is the first audit's S12**, which quotes the same `NOT_A_PERSON`
list verbatim, names the same missing clinic places, and gives «العيادة عندها ازدحام» as its own
example. SPEC-3's Wave 1.5 row files it under S12 and labels only the `FRAME_WORDS` half as *"a
second finding the audit did not have"* — which is accurate. Counted as a fifth independent find
it does not hold; counted as the container for Claim 1 it does.

**Net: three genuinely new finds (`صدر الدجاج`, `الكسر العشري`, `ال`-stripping) plus one correct
correction to a prescribed fix (`FRAME_WORDS`). The self-grading is closer to honest than the
default expectation, and I say that having gone looking for the opposite.**

---

## PART 4 — Do the three structural fixes have mechanisms?

| | mechanism? | evidence |
|---|---|---|
| **Hardness absolute** | **Yes** | §1.5 R1 is normative and overriding; the veto is gated on class hardness at the point of consultation; every HARD near-miss reason rewritten **except §2.3's four** (S1.5-1); §11.1 asserts a booking frame and a symptom sharing one clause with no punctuation, for each HARD class. |
| **`triage_hold` read at the write** | **Yes** | Forked from the real `safety-hold.ts` / `safety-hold-guard.ts`, verified verbatim. `checkBookingTriageHold` at the write path, explicitly not the prompt (H-2). Fail-closed (H-4). Operator-only release with `released_by`/`released_at` (H-5). `openTriageHold()` awaited, P0 on write failure (§4.1). §11.8's assertion is un-gameable by construction. §12 row 14 blocks launch. The one gap — the booking spec that implements it does not exist — is disclosed in §13 item 2b. |
| **Exception degrades to `emergency`** | **Yes** | §1.5 R3 + §1.3 + §10 + §11.9, all in agreement, asserted on the pager/writer arguments with an explicit "a stub returning `urgent` must fail". Own budget line. |

None of the three is an assertion repeated in a new section.

---

## PART 5 — Do the cross-spec agreements hold?

| Agreement | Holds? |
|---|---|
| One ER model, one owner | **Data layer yes, copy layer no** — blocker **N1** |
| `client_confirmed` genuinely reachable | **Yes for `client_confirmed`; no for the `demo_seeded` path it depends on** — blocker **N3** |
| Demo disclaimer in all three placements | **Yes for DEMO-1; no for PRICE-1** — should-fix **S1.5-2** |
| Gold transcript no longer breaks its own rules | **Yes** |

**`client_confirmed`.** §4.10 makes it a real rung: `ClientConfirmation` with a named person,
role, channel, datetime, verbatim and scope; invariant **H6** makes an unattributed confirmation
uncompilable; `clientConfirmedStaleAfterDays` 180 → `high`, 365 → `medium`, downgrading rather
than voiding; `bookableWindows()`'s contract updated to admit it; acceptance criterion #28 asserts
a non-empty result at 120 days **and** at 400 days. Rule DOC-3 rewritten into three honest
conditions. The reviewer's headline finding is answered properly.

**The gold transcript.** Turn 7 no longer names `GentleMax Pro` (S3) and reads «زين» not «كويس»
(S5), with the linter's failure to catch «كويس» driven and recorded rather than papered over.
Turn 10 carries the Rawabi phone with the Friday slot (S4). Turn 12 carries the DEMO-1(c) suffix.
§9.1's checklist row is rewritten to name **both** gates instead of citing one that cannot enforce
the claim. §6.1's `motion.discover` is now two asks with payment moved to its own turn (S22), and
turn 2 matches. `motion.expand`'s `لها/له` is `{for_pronoun}` (S23). S7/Q3 closed:
`motion.confirm_block.callback` has no `الموعد:` row at all.

---

## BLOCKERS

### N1 — B6's failure sentence was not changed. A patient is still told an ER is open 24 hours when it is not. `SPEC-2` §2.2 G4 (L238) vs `SPEC-4` §4.4, §5.3 · **[READ]**

B6 was closed at the data layer and left open in the copy. G4's `[FROZEN]` string, unchanged:

> «أعرف إن الوقت متأخر — العيادات مسكّرة الحين، والطوارئ عندنا **شغّالة على مدار الساعة** في {er_branch_name}.»

`{er_branch_name}` is now a render of `erSites({ now })`, which is right. But `erSites({ now })`
answers **"is this site's ER open at this instant, on this weekday"** — that is what
`er_hours_by_weekday` exists for, and §4.4 explicitly admits sites eligible by weekday hours and
not only by `er_open_24h`. The sentence asserts **"around the clock"**, which is not derivable
from what the tool returns.

**Failure scenario, and it is B6's own.** A site whose `er_hours_by_weekday` gives Friday
16:00–02:00 is eligible at 00:40. G4 renders «الطوارئ عندنا شغّالة على مدار الساعة في {that
site}». The patient reads *24 hours*, goes at 03:00, and finds a locked door. §4.4's own words:
*"Sending a patient with chest pain to a branch that closed at midnight is a lethal defect that a
unit test cannot catch."* The correction note under G4 diagnoses the boolean perfectly and then
leaves the 24-hour claim standing above it.

**And the new guard cannot catch it, twice over.** §5.3's remedy for S20 added an `availability`
kind to `assertsMedicalClaim`, banning «شغّالين على مدار الساعة» — **masculine plural**; G4 says
«شغّالة», feminine singular, which does not match — **and** the kind carries the carve-out
*"unless the sentence is rendered from a tool result in this turn"*, which G4's is by
construction. The double-lock §11.4 is supposed to provide is decorative for this exact string.

**Smallest fix.** Replace the middle line's claim with one `erSites({ now })` can support:
«والطوارئ في {er_branch_name} مفتوحة الحين» (open *now*), and drop the `مدار الساعة` clause; then
either remove the tool-render carve-out from the `availability` kind or scope it to the specific
fields the tool returned.

### N2 — `SPEC-4` §2.3's rule is still narrower than its own Fires list. «تقيأت دم» is silent. · **[DRIVEN]**

B5's finding was *"the rule is narrower than its own Fires list."* It is still true, on a
different word, and the "Driven, 34/34" corpus does not contain the failing entry.

`«تقيأت دم»` is in §2.3's **Fires** list. Driving §2.3's v1.5 rule:

```
quiet  «تقيأت دم»        norm=[تقيات دم]      ← in the section's own Fires list
FIRES  «تقيا دم»
quiet  «دم مع البول»                          ← also in the section's own Fires list
   probe: normalizeAr("تقيأت") = "تقيات" ;  boundary("تقيا") on «تقيات دم» -> false
```

`normalizeAr` folds `أ→ا`, so `تقيأت` becomes `تقيات`; the SITE term `تقيا` is boundary-matched
and the trailing `ت` fails `(?![ء-ي])`. The STANDALONE phrase `تقيا دم` does not match `تقيات دم`
either. **Haematemesis, written in the first-person past — the ordinary way a patient reports
it — is silent.** `تقيات` · `تقيت` · `استفرغت` · `يتقيا` · `تتقيا` are not terms. This is the
verb-form defect B5 closed for `نزف` and did not close for `تقيأ`.

`«دم مع البول»` is likewise in the Fires list (annotated *"→ urgent unless with pain+fever"*) and
carries a TERM with no PREDICATE and no SITE, so the rule never reaches it at any tier.

**Smallest fix.** Add the verb forms to SITE (`تقيا|تقيات|تقيت|يتقيا|تتقيا|استفرغ|استفرغت`), add
`بول`/`البول` as a site with the urgent-tier annotation the Fires list already carries, and add
both strings to §11.1's MUST_FIRE corpus so the 34/34 claim is measured against the whole list.

### N3 — `SPEC-4` §2.3's VETO set is unscoped and contains bare «الحمدلله». One of the two readings the document permits silences a HARD class. · **[DRIVEN]**

§2.3's rule reads `HIT = (a STANDALONE phrase) OR (a TERM AND (a PREDICATE OR a SITE)), **minus
the VETOes**` — a whole-hit subtraction — and the VETO set contains bare `الحمدلله`. §1.2 says
*"Exclusions are clause-scoped, never message-scoped"*, but §2.3 does not call its VETOes
exclusions and does not scope them. Both readings driven:

```
message-scoped=quiet   clause-scoped=FIRES   «الحمدلله، ابني طاح والجرح ينزف بقوة»
message-scoped=quiet   clause-scoped=FIRES   «الحمدلله على كل حال بس الجرح ينزف بقوة»
message-scoped=quiet   clause-scoped=FIRES   «الحمدلله بخير، نزيف شديد من نص ساعة»
message-scoped=quiet   clause-scoped=FIRES   «نزيف اللثة، بس الجرح في يدي ينزف بقوة»
message-scoped=quiet   clause-scoped=quiet   «الحمدلله وقف النزيف»          ← the one it is for
```

«الحمدلله» is the most common discourse particle in Saudi WhatsApp Arabic and routinely opens a
message that goes on to describe a catastrophe. Under the message-scoped reading a bleeding child
is silent because his father opened politely. Only the last line — the one the veto exists for —
behaves the same under both readings, which is the tell that the veto should be
`وقف النزيف|بطل النزيف|انحبس` and that `الحمدلله` should not be a veto token at all.

**Smallest fix.** State that §2.3's VETOes are clause-scoped per §1.2, and strike bare `الحمدلله`
from the resolved set (it is redundant: «الحمدلله وقف النزيف» is caught by `وقف النزيف`).

### N4 — `SPEC-4` §2.4 gives the airway class six word lists and **no composition rule**. Both readings are wrong. · **[DRIVEN]**

§2.3 ends with an explicit `HIT = …` formula. §2.4 does not. It gives NEGATION, CAN-VERB, BREATHE,
THROAT, LIPS/TONGUE, FACE/EYES, CLOSING and SWELLING as unordered lists and never says how they
combine — in particular, whether the CAN-VERB is required and whether the three must be adjacent.
Two defensible readings, driven:

```
reading A — NEGATION + CAN-VERB + BREATHE required
  quiet  «الطفل ما يتنفس»                  ← §2.4's OWN must-fire string, lost

reading B — CAN-VERB optional (NEGATION + BREATHE anywhere in the clause)
  FIRES  «ما عندي مشكلة في التنفس»          ← a denial of breathing difficulty → ambulance + P0
  FIRES  «ما فيه صعوبة بالتنفس الحمدلله»     ← reassurance → ambulance + P0
  FIRES  «الحمدلله ما عاد حلقي يقفل»         ← resolution → ambulance + P0
```

**The inherited machinery already solved this and §2.4 threw the solution away.** The real
regex is `ما ?اقدر ?(?:ا|ال)?تنفس` — negation, can-verb and breathe-verb **adjacent**, with at
most one space between each. Driven on the real `detectAllergenEmergency`:

```
quiet  «ما عندي مشكلة في التنفس»       quiet  «ما فيه صعوبة بالتنفس الحمدلله»
FIRES  «ما أقدر أتنفس»                 FIRES  «صعوبة في التنفس»
```

§2.4's own heading is *"inherit, do not re-invent"* and its text says the machinery is imported.
The adjacency constraint **is** the machinery for this family, and replacing a tight regex with
loose word lists discards it. Class D is the class B3 lived in; it must not ship
under-determined.

**Smallest fix.** Add the `HIT = …` formula §2.3 has, with adjacency stated:
`NEGATION (\s?CAN-VERB)? \s?BREATHE` within one clause, plus `(THROAT|LIPS|FACE) \s?
(CLOSING|SWELLING)`, plus the cyanosis pairs. Then add «ما عندي مشكلة في التنفس» and «الحمدلله ما
عاد حلقي يقفل» to §11.2's near-miss corpus, paired with «ما أقدر أتنفس» per §11.2's own
discipline.

### N5 — `SPEC-1` §2's `Confidence` union does not contain `demo_seeded`, so the entire demo bookability path does not typecheck. · **[READ]**

The reviewer's headline finding — *nothing is bookable* — is answered by Rule HRS-DEMO, which
seeds three sites *"each stamped `confidence: "demo_seeded"` at the data layer — a value
`bookableWindows()` accepts **only** when `DEMO_MODE` is on"*. Acceptance criterion #27 greps the
production bundle for the value. §14 depends on it, `[OPEN-01]` and `[OPEN-15]` depend on it.

`SPEC-1-DOMAIN.md` L107–115, the `Confidence` union, read verbatim:

```ts
type Confidence =
  | "client_confirmed" | "high" | "medium" | "low" | "conflicted" | "unknown";
```

`grep -n "demo_seeded"` returns nine hits and **not one of them is a type declaration**. Under
the document's own type, `confidence: "demo_seeded"` does not compile — the same law H6 invokes
to make an unattributed `ClientConfirmation` unrepresentable now makes the demo's only inventory
unrepresentable too. And §4.2's `bookableWindows()` contract, which the remediation *did* edit
(it added `client_confirmed` and the `clientConfirmedStaleAfterDays` exception), still reads
`confidence is "client_confirmed" | "high" | "medium"` with no mention of `demo_seeded` or
`DEMO_MODE`.

So the fix for the reviewer's #1 finding is uncompilable in the same document that states it, in
two places. This is a small edit and a large consequence: it is the difference between a demo
with inventory and the state the review called *"a booking agent that cannot book."*

**Smallest fix.** Add `| "demo_seeded"` to the union with its comment, and add the `DEMO_MODE`
clause to `bookableWindows()`'s contract.

### N6 — `SPEC-4` §2.6 and §2.7 create SOFT *readings* inside HARD *classes*, and nothing says how the detector chooses. This is B1's shape on the past-tense axis. · **[READ]**

§1.3 declares class F (`infant_fever`) and class G (`poisoning`) **HARD**, and defines HARD as
*"fires through any surrounding frame (**past**, booking, denial, hedging)."* §1.5 R1 makes the
veto gate depend on *"the candidate **class**"*. But:

- §2.6 near-miss: `«حرارته 39 من كم شهر»` — *"past clause + a value — **SOFT for the fever-only
  reading**; a convulsion clause is still HARD"*
- §2.7 near-miss: `«تسمم غذائي صار لي قبل اسبوع»` — *"past clause, **SOFT reading** → `urgent`"*

Hardness is now a property of a *reading*, not of a *class*, in two subsections — while R1's
mechanism, §1.3's table and §1.2's row all define it per class. Nothing in the document says how
the detector decides which reading it is in before it decides whether the past veto applies.

Note also that R1's own replacement table claims §2.6's near-misses are now explained by *"the
temperature is out of body range or the subject is not a body"* — neither is true of
«حرارته 39 من كم شهر», where 39 is in `[35, 43]` and the subject is a child. That row is still
carried by a past-clause veto against a class §1.3 says takes none.

The direction of error is the B1 direction — a HARD class going quiet on a frame. It is smaller
than B1 (a chronic fever is a genuinely different clinical object from an acute one) but it is
unresolved, and §1.5 R1 was written precisely to make this class of ambiguity impossible.

**Smallest fix.** Either give §1.3 a per-class-per-reading hardness column and say in R1 how the
reading is selected, or promote both rows to the same treatment every other HARD near-miss got —
a test that is in the message (`من كم شهر` / `قبل اسبوع` as an explicit **chronicity term**, not
as an instance of `PAST_CLAUSE_RE`).

---

## SHOULD-FIX

**S1.5-1 — §2.3's four near-miss reasons still say "booking frame", on a HARD class.**
`SPEC-4-SAFETY.md:465`. R1 claims no HARD near-miss is explained by a frame any more; this row
is. Behaviourally harmless (driven: quiet for want of predicate and site), but it is the teaching
defect B1 named. Rewrite to the real reason: *`دم` is a term but there is no predicate and no
site — the class never becomes a candidate.*

**S1.5-2 — SPEC-1 and SPEC-2 now specify two different frozen strings for the same
renderer-emitted price label.** `SPEC-1-DOMAIN.md:1120` Rule PRICE-1 still reads «السعر تقريبي
للعرض التجريبي، والمعتمد من الاستقبال.» `SPEC-2-PERSONA.md:604` renders «هذا سعر استرشادي،
والمعتمد من الاستقبال.» SPEC-2's note says the difference is *"deliberate"* (audit nit 8, to avoid
`machine_jargon`) — but the change landed in only one of the two documents, and SPEC-1 acceptance
criterion #14 asserts *"Every price rendered to a patient carries **the demo label**"*, which is
SPEC-1's label. As it stands that criterion is red at birth against SPEC-2's renderer. Worse, the
substitute drops the demo semantics entirely: «سعر استرشادي» means *indicative*, not *invented*.
The demo framing does move to DEMO-1's three placements, which is defensible — but SPEC-1 must be
amended to say so, and criterion #14 reworded to name the string that actually ships. Pick one
string, in one document, and point the other at it.

**S1.5-3 — §2.1's pain/pressure predicate set is never enumerated.** §2.3 enumerates PREDICATE
explicitly; §2.1 says only *"carry a pain/pressure predicate"* and leaves the set to be inferred
from the Fires list. This is load-bearing in both directions: §2.1 states the four chest-X-ray
near-misses are *"saved **only** by the predicate requirement"*, and §11.2 says it *"pairs all
four of them"* — a proof cannot be transcribed from an unenumerated list. Driven, whether `ضيق`
is a predicate decides one of §2.1's own v1.5 rows: without it, «ضيق في الصدر من امس» is **quiet**
while the spec's driven block shows it firing; with it, all four X-ray sentences and
«عندي ضيق في التنفس» stay quiet. Enumerate it the way §2.3 does.

**S1.5-4 — §11.4 item 4's emoji test still rejects rail C.** `SPEC-2-PERSONA.md:1292–1298` asserts
*"that `✅` and `🙏` do not appear in a message matching the clinical/price/complaint/safety
classifiers"* — **unqualified** — and, three lines later, *"that both SPEC-4 §4.2 rail strings
(A/B and C) pass this test verbatim."* Rail C is a safety message and opens with 🙏. §4.5's
carve-out is correct and structural (`stopReason === "faysal_redflag_emergency"` exempts the turn
*entirely*); §8.1 row 24 carries the qualifier; §11.4 item 4 does not. Same category as the first
audit's S17 — a proof description that is red at birth against its own final clause. Add the
`stopReason` qualifier to the ✅/🙏 clause, and state explicitly that rail C carries the same
`stopReason` (§4.1's table never says class I does).

**S1.5-5 — the gum/nose veto caps a post-extraction haemorrhage at `urgent` by construction.**
Driven: «نزيف اللثة ما يوقف من ساعتين بعد خلع الضرس» and «نزيف اللثة شديد ما يوقف وانا على مميع
دم» are both held at `urgent` at most, because the veto sits outside the predicate test — which
is the right structure for the brushing complaint and the wrong one for an anticoagulated patient
who will not stop bleeding after an extraction. §12 row 2 already names gum bleeding for the
physician; this specific interaction (`نزيف اللثة` **+** a persistence predicate **+** an
extraction or anticoagulant term) should be named in that row so the physician is asked the
question that matters rather than the general one.

**S1.5-6 — `SPEC-1` DOC-4 and `SPEC-3` §10.2 both say `normalizeAr` has "25 importers".**
Counted: **31** files import from `lib/ai/allergen-gate` (excluding `allergen-gate-symptoms`).
Everything else re-verified in SPEC-3's Wave 1.5 is exact — `service.ts:12` → `message-log-store`
→ `newId` from the Kivo store ✓; `speech-ticket.ts:53` voice-budget and `:59` voice-out ✓;
`stripComments` at L52 with no `export` ✓; `bindingsFrom` at L169 nested in a block ✓; 119
migration files, 59 with `restaurant_id`, 65 with `restaurants` ✓. One stale count in an
otherwise exact re-verification.

**S1.5-7 — DEMO-1(b) has no defined behaviour when turn 1 is a red flag.** (b) is *"the first
message of every conversation, before Faysal's greeting"*; detail 5 exempts the rail from (b) and
(c). A patient whose **first** inbound fires the rail therefore never receives the system line
carrying the real booking numbers (920009303 / 0504490460 / 997) — and never receives it on turn
2 either, because (b) is defined as the first message. The rail's own `997` covers the emergency;
what is lost is the demo marker on a conversation that opened with a screenshot-able message
wearing the group's real trade name. Say whether (b) is deferred to the next non-rail turn or
dropped for that thread.

---

## What I could not verify

- **Whether `erSites({ now })` can ever return a site that is genuinely 24-hour.** N1 assumes it
  can return a site eligible by `er_hours_by_weekday` alone; §4.4 lists both `er_open_24h` and
  `er_hours_by_weekday` as fields and never says eligibility requires the former. If eligibility
  *did* require `er_open_24h === true`, N1's sentence would be sound — but nothing in §4.4 says
  so, and §4.4's whole argument is that a boolean cannot express Shoaa Rawdah. **[READ — the
  spec is silent; I read the ambiguity in the direction that fails.]**
- **The §2.4 airway composition** was driven under two readings I constructed, because the
  document supplies none. Neither reading is *the* spec's; that is the defect. **[DRIVEN — both
  readings; the spec's own rule does not exist.]**
- **§3.1's 500-message corpus and §3.4's shadow-mode gates.** Still no corpus in the repo. The
  false-positive budget remains unmeasurable today, correctly deferred to §12 row 12.
  **[SUSPECT — unprovable, correctly gated.]**
- **The clinical correctness of every threshold** in §1.3, §2.6 and §5.1, and whether 997 or the
  Riyadh 911 line is right for this catchment. §12 blocks on signatures for all of it, and is
  right to. **[SUSPECT — correctly gated.]**
- **`docs/ALLERGEN_SYMPTOM_REVIEW.md`'s one-of-nine-call-sites claim**, cited by §10. Not read in
  full. **[NOT CHECKED — same as the first audit.]**

## What checked out that I expected not to

Recorded because a second-pass defect list is more misleading than a first-pass one.

- **The §11.2 boundary table: 23 of 23 rows reproduce exactly**, including all five corrections
  and both "new" rows. The first audit found three wrong rows in this table; there are now zero.
- **All fourteen B3 strings fire and all eight §2.4 near-misses stay quiet** under the new
  lexicon, with no frame anchor needed.
- **The B4 addition costs nothing**: fourteen near-misses, four chest-X-ray sentences, two
  whole-word `صدر` sentences and «موعد صدرية» all still quiet.
- **The B5 gum-veto placement is correct and driven**: «نزيف اللثة **شديد** لما أفرش أسناني» stays
  quiet even with `شديد` newly a predicate — the one interaction the section flags as the trap.
- **Every quotation of a real file in the Wave 1.5 sections is verbatim-accurate**: `isSafetyHeld`,
  the `safety-hold-guard.ts` header, `norm()` at `order-pricing.ts` L99–105, `FRAME_WORDS`,
  `NOT_A_PERSON`, the `callback-trigger.ts` second `normalizeAr` and its missing run-collapse, and
  the three CI facts. I checked all of them expecting drift and found one stale number (S1.5-6).
- **The bereavement case is quiet in all three punctuation variants**, including the no-comma
  form the first audit did not test.
- **§12's sign-off table is still empty and still says the specification describes a system that
  must not receive a real patient message.** Three new blocking rows (13, 14, 15) were added and
  none of the twelve original ones was quietly filled in. That remains the single best thing in
  these four documents.

---

## VERDICT: **BLOCKED**

Six blockers. **The nine Wave 1 blockers are genuinely closed** — eight cleanly, one (B1) with a
documentation residual — and the remediation's central counter-claim about `FRAME_WORDS` is
correct: the first audit's prescribed anchor does not work, and I drove it against the real file
to say so. B7 is closed better than it was asked to be.

What blocks is not regression. It is that four of the six new blockers are the **same shapes the
first audit named**, surviving in the one place each sweep did not reach: a HARD class silenced by
a frame (**N6**, past-tense axis, §2.6/§2.7), a rule narrower than its own Fires list (**N2**,
«تقيأت دم»), a fix landed in one document and not its partner (**N1**, the G4 sentence; **N5**, the
`Confidence` union). Plus one genuinely new one: **N4**, where a tight inherited regex was
replaced by loose word lists and the adjacency constraint that made it work was dropped. **N3** —
bare «الحمدلله» as an unscoped veto on a haemorrhage class — is the one I would fix first if I
could only fix one, because it is the cheapest to get wrong and the worst to get wrong.

**The single smallest change that flips this to APPROVED — stated honestly, because pretending it
is one line is the failure mode this document exists to catch:**

> **Add `SPEC-4 §2.0 "How a class rule is composed"`, and make three one-line edits in the other
> two specs.**

The new subsection — half a page, above §2.1 — closes four of the six because they are one
omission wearing four faces: **§2 never says how a class rule is built.** §2.3 has a `HIT = …`
formula; no other class does; and every ambiguity below flows from that.

1. **Every class states its `HIT = …` formula**, §2.3-style. For class D that means adjacency:
   `NEGATION (\s?CAN-VERB)? \s?BREATHE` within a clause, plus `(THROAT|LIPS|FACE) \s?
   (CLOSING|SWELLING)`, plus the cyanosis pairs — the constraint the inherited machinery already
   carries. *(N4)*
2. **Every class enumerates its predicate set**, §2.3-style. Class A's pain/pressure list is
   named, including whether `ضيق` is in it. *(S1.5-3, and it decides one of §2.1's own rows)*
3. **Every veto is clause-scoped, per §1.2, and stated as such** — and a veto may not be a bare
   discourse particle. `الحمدلله` comes out of §2.3's resolved set. *(N3)*
4. **Hardness is a property of a class, never of a reading.** §2.6's and §2.7's SOFT readings
   become explicit chronicity terms in the message, or §1.3 gains a per-reading column and R1
   says how the reading is chosen. *(N6)*
5. **Every Fires-list entry in §2 appears in §11.1's MUST_FIRE corpus**, mechanically. That is
   what would have caught «تقيأت دم» and «دم مع البول» before this pass. *(N2)*

The three line-edits are mechanical and land in the same pass:

- **`SPEC-2` §2.2 G4:** strike «شغّالة على مدار الساعة» from the frozen string; assert *open now*,
  which is what `erSites({ now })` returns. *(N1)*
- **`SPEC-1` §2:** add `| "demo_seeded"` to `Confidence`, and add the `DEMO_MODE` clause to
  §4.2's `bookableWindows()` contract. *(N5)*
- **`SPEC-1` §9.2:** make PRICE-1's string the one SPEC-2 actually renders, and reword acceptance
  criterion #14 to match. *(S1.5-2)*

S1.5-1, S1.5-4 and S1.5-7 should land in the same pass because each makes a mandated proof or a
stated invariant false at birth. S1.5-5 and S1.5-6 can wait for Wave 2.

Wave 1 should not proceed to code until §2.0 exists and those three edits are made. Nothing else
in the should-fix list needs to block.
