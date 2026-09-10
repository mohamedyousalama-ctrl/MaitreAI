# Faysal — Wave 2: the humanization audit

Twelve invented patients drove the demo through a settable clock, a dedicated
reviewer turned their transcripts into a design, and the auditor rejected it. This
file records what was found, what shipped, what was refused, and what is still open.
It is the standing record for the §12 clinician review, and the reading list for
whoever picks this up next.

Sources: the persona transcripts (`persona-*.md`, session scratch), the reviewer's
ranked defects DEF-01…DEF-18, the design items DES-01…DES-14, and the auditor's
verdict. Specs: `SPEC-1-DOMAIN.md`, `SPEC-2-PERSONA.md`, `SPEC-4-SAFETY.md`.

---

## 1. What the twelve patients said

Scores are the patients' own, 1–5. The pattern is not subtle: he was honest
throughout (median 4) and did not listen (median 1).

| Patient | context | time | case | needs | warmth | honesty |
|---|---|---|---|---|---|---|
| Mother, 2-year-old, 38.9, 11 pm | 1 | 1 | 1 | 1 | 1 | 3 |
| Man, 68, knee, insurance | 1 | 2 | 1 | 1 | 2 | 3 |
| Woman, 27, laser, price-sensitive | 1 | 1 | 2 | 1 | 2 | 3 |
| Son, father's chest pain, Friday night | 2 | 2 | 4 | 2 | 2 | 5 |
| Regular patient, thanks and goodbyes | 2 | 4 | 4 | 3 | 2 | 4 |
| Man, rash, Friday noon | 3 | 4 | 3 | 2 | 2 | 5 |
| Patient who waited 50 minutes last week | 2 | 4 | 3 | 2 | 3 | 4 |
| English-speaking mother, 9-year-old | 1 | 3 | 1 | 1 | 2 | 4 |
| Everything in one message | 1 | 4 | 3 | 2 | 3 | 5 |
| «are you open now», 11:40 pm | 2 | 2 | 3 | 2 | 3 | 3 |
| Pregnant, 5th month, female doctor | 1 | 3 | 1 | 1 | 2 | 3 |
| Asked for a named doctor | 2 | 4 | 3 | 2 | 2 | 4 |

> «I told him everything in one message … and he told me to call an ambulance. When
> I said she's not a baby he sent me the exact same red-siren text again, and again,
> eight times, even when I said thank you.»

---

## 2. The defect nobody had listed

**An age in days was being read as a body temperature, and it silenced the rail.**

`bodyTemperature` (`lib/health/safety/match.ts`) took the first two-digit number in
`[35, 43]` anywhere in the clause. In «رضيعي عمره ٣٦ يوم وعنده حرارة» that number is
the **36 belonging to «يوم»**. `infantFever` then applied its own
`value < 38.0 → return null`, and a **thirty-six-day-old with a fever produced no hit
at any tier**. Driven before the fix: `fired: false, ruleId: none`. The same sentence
without the age fires `emergency`.

The window that lands inside `[35, 43]` days is roughly five to six weeks — squarely
the population §2.6 exists for.

**Fixed.** A number bound to an age unit (يوم · ايام · اسبوع · اسابيع · شهر · شهور ·
سنه · سنوات, and the English units) or sitting directly after an age lead with no
«درجة» after it is skipped, and the scan continues. Skipping it **fails toward
firing**: with no temperature value, an infant marker plus a fever term is still an
emergency under §2.6's own tier table.

`PRED_INFANT` also gained «مولودي» and «مولودتي» — the possessive forms a parent
actually types. The bare «مولود» was matching «مولودي» by accident of substring and
missing «مولودتي» entirely.

Proof: `proof-faysal-safety.test.ts` gains a generated must-fire row crossing five
parent words × seven age phrasings × four fever phrasings. Suite: 18,883/18,883.

---

## 3. What shipped in this wave

| Item | What changed |
|---|---|
| **Age is not a temperature** | Above. Fail-toward-firing. |
| **Read the whole message** | `extractFacts` runs once per turn and rides on **every** classification, including the model tier's. Need, district, carrier, payment, window, female-doctor preference, courtesy and correction are read from the text — never from the model. `female_doctor` is now a last-resort kind, so «أبغى موعد جلدية بكرة الصبح في الروابي، عندي بوبا، وأفضّل دكتورة» is a booking ask that carries all five facts. |
| **Ask only what is missing** | The combined «أنت بأي حي، والزيارة تأمين ولا كاش؟» went out even to a patient who had just said both. |
| **Courtesy is courtesy** | A whole-message thanks or goodbye closes, in every scene, and names the appointment back. It was reaching the honest-unknown line or re-opening the slot list. |
| **The booking is remembered** | `renderAppointment` records what was booked and clears the offered slots. «موعدي باقي صح؟» is answered, «خليه» keeps it, a yes after the confirmation no longer places a second hold. |
| **A «لا» inside a request is not a walk-away** | `decline` is now a bare decline. A negation inside a message that also carries a need, a district, a payment, a window, a booking word or a clock time falls through to the ask. A yes-hedge («تمام بس بعدين») is `objection_delay`, not a refusal — two refusals close the thread, and two of these did. |
| **Reschedule exists** | SPEC-1 §8's التعديل had no implementation: «أغير الوقت» was read as a refusal. It now names the current appointment and offers two alternatives; nothing is cancelled until the patient picks. |
| **Hold the time they asked for** | The slot matcher took the leftmost number, so «ليش 5:15؟ انت قلت 4:30!! ثبت 4:30» held 5:15. Times are now paired with the weekday in front of them, times after a negation or a question head are dropped, a pick verb decides between survivors, and **two real candidates with no verb hold nothing** — he asks which. |
| **A complaint never loses a held slot** | The complaint branch re-searched while a hold was live; the held slot is out of inventory by then, so it vanished. |
| **The confirmation matches what they said** | A cash patient is no longer told to bring an insurance card. |
| **Held emergency thread** | Below. |
| **General practice books** | Six invented GPs (three women, three men) at the three demo-bookable sites, plus the Ar Rawdah capability row. «أبغى كشف عام» minted zero slots at every site and the engine reported it as unconfirmed *hours*. |
| **Internal medicine books** | Below — items 7, 8 and 9 of the old open list, closed together. |
| **English echo** | An English thread's greeting echo is English end to end, and the thread language comes from the last substantive message. |

### The held emergency thread

The first message of a red flag is §4.2's frozen rail, byte for byte, and it stays
that way. What changed is turn three. The full four-line siren was re-sent verbatim
for «شكرا», for «يعطيك العافية», and for «عطني رقم الفرع أتصل عليهم بكرة» — six
identical copies in one thread.

SPEC-4 §1.5 R2 **H-6** is explicit: a patient under an open hold «may always be
handed a phone number. The hold blocks committing, never unwinding or helping.»

So: the hold is unchanged — no booking, no slot, no chips, the same `stopReason`,
the same `S0_safety` scene, and a **new hard hit re-fires the byte-exact rail (H-7)**.
Only the words change on the other turns: §5.3's own refusal with the booking clause
removed, the emergency route restated, and the branch number they asked for. The
number is read straight off the raw text with the domain's district resolver — no
classifier, no model, no session state — so nothing the hold blocks can influence it.

**This wording needs the §12 row 4 clinician review.** It introduces no new clinical
claim (every sentence is assembled from strings already frozen in SPEC-2 §5.1/§5.3),
but it is rail-adjacent copy and it is recorded here for that review rather than
treated as settled.

---

## 4. What the auditor refused, and what is still open

### Refused: reading the child's age to downgrade the tier (DES-01)

The reviewer proposed reading «عمرها سنتين» and dropping a child ≥3 months with fever
alone from `emergency` to `urgent` — which is what SPEC-4 §2.6's own threshold says.
The auditor rejected it, and it is **not implemented**:

- **§12 row 3 (infant-fever thresholds, Paediatrician, BLOCKING) is unsigned.**
  §13's stated safe interim is the opposite direction — an unknown age defaults to
  emergency for any fever carrying an infant marker, «the fail-toward-firing
  direction this document takes everywhere else».
- The proposed parser had four holes the auditor named: a first-person «عمري» is
  never the child's age; the age must be **bound to the marker that made this a class
  F hit**; with more than one age in a clause the **minimum** must win, not the first;
  and an explicit true-infant marker must remain an **absolute floor** regardless of
  any parsed age.

Consequence, stated plainly: **a two-year-old with a 38.9 fever still gets the
emergency rail.** That is an over-fire, it is the direction the spec chooses while row
3 is unsigned, and it is the single most important line on the client-call brief.

### Also shipped, after re-driving the personas against the fixed tree

Driving the four worst transcripts again found six more, each of them the same
shape — a sentence read past rather than read.

| What the patient typed | What he did | What he does now |
|---|---|---|
| «وأفضّل دكتورة» | «ما أقيّم لك دكتور» — it contains «أفضل دكتور» as a substring | A preference, recorded and said back once on the booking turn. The doctor-quality needles end at a word boundary; the Arabic prefixes (و/ب/ل) ride on «دكتورة» like any other word |
| «انا في الروضة، وابغى دكتورة» | «وش تحتاج بالضبط، وأنت بأي حي؟» | A district outranks a bare gender preference — the preference is a flag, not an intent |
| «عندي ألم في الركبة من شهر» ×3 | The generic honest-unknown paragraph, verbatim, three times | «الله يعافيك» first, the specialty said back in their own word, no claim that the clinic exists, and a written request offered |
| «أنا في الورود» + insurance | Answered about Ar Rawabi | Their own district first, the recommendation second, the default last |
| «أبغى موعد جلدية بكرة» | Today's slot offered first | The named day moves the search origin; it never invents inventory |
| «موعد مسائي بعد الساعة ٧» | 4:30 م and 9:45 ص, no comment | The window filters what is offered, and when nothing matches, that is said in their own words before what does exist |

Plus two register fixes: the insurance answer (two sentences that appear in EVERY
insurance turn) was Modern Standard Arabic officialese and is now Riyadh Arabic
with the meaning unchanged word for word; and the routing reason no longer prints
«…والتقويم عندهم..» because half the reason rows already end in a full stop.

### The clinician-data items (old §4 items 7, 8, 9), closed

**7 — internal medicine had the family-medicine defect, at three sites.** §6.2 reads
`named_at_site` for باطنية at Ar Rawabi, Shoaa Al Wurud and Al Yamamah — the whole of
§5.3's internal-medicine chain — and not one of the three had an internist. So
`planFor("internal")` minted nothing at the branch the chain names *first*, and the
only sentence the engine had left was «دوامه قيد التأكيد»: a claim about hours that
are seeded and fine, caused by a roster that was empty.

A **sweep over every (site, specialty) pair whose capability gate opens** found three
more of the same shape, all `named_at_site`, all fixed the same way:

| Site | Clinic | Was | Reachable? |
|---|---|---|---|
| Ar Rawabi | باطنية | 0 rostered | yes — rank 1 of the internal-medicine chain, hours seeded |
| Shoaa Al Wurud | باطنية | 0 rostered | yes — rank 2, hours seeded |
| Al Yamamah | باطنية | 1 man | rank 3; «أبغى دكتورة» emptied it |
| Shoaa Al Wurud | أسنان | 0 rostered | yes — §5.3's dental chain ends here, and the site's hours are seeded |
| Al Yamamah | نساء وولادة | 0 rostered | latent — the site has no seeded hours yet |
| Al Yamamah | مختبر وأشعة | 0 rostered | latent — and §9.4 prices neither, so it never books |

Eleven invented clinicians, a woman and a man each. **No capability row was added and
none was needed**: unlike Ar Rawdah's family medicine, every site above was already
named in §6.2. Roster 36 → 47 (24 women, 23 men).

`proof-faysal-domain` now asserts the **general form** rather than the instance:
every pair where `isBookableSpecialty` is true and `cliniciansFor` is empty fails the
build, at all six sites — hours are what *hides* this defect, never what causes it.

**8 — the denylist guard read the wrong file.** Part D parsed the seed roster only,
so the stricter name-part check was blind to `lib/health/clinicians.ts`, which is the
list a name actually reaches a patient from. Both rosters are parsed now under
identical rules, and each file's extracted names are counted against the roster rows
declared in it, so a reformat fails the guard loudly instead of emptying it. Driven:
«د. نورة الجندي» in the engine roster passed the old guard 28/0 and fails the new one.

**9 — the seed was six people behind, and eleven more after item 7.** It was also
wrong about ten seniorities and four primary specialties, and it seeded
`sub_specialties` empty. `proof-faysal-domain` §15 now projects each roster onto one
string per person and compares the two projections whole — narrowing the check means
deleting a field from a projection that is written once and used for both sides. The
one map between the engine's `SpecialtyKey` and the database's specialty keys is
asserted total over both rosters before it is used.

### Closed since this file was written

Items 1–6 below are **all fixed and pushed**, and item 8 turned out not to be a
roster problem at all — see "the answer was Faysal, not the roster" underneath.
They are kept in place, struck through in intent rather than deleted, because the
reasoning behind each is the reading list for whoever picks this up next.

| Was | Now |
|---|---|
| 1. the `urgent` tier had no voice | speaks, above the spend guard, and survives a guard refusal |
| 2. class F was Arabic-only | every class has an English arm; 34,492 assertions |
| 3. no English age reading | months, years, weeks and days, and never read as a temperature |
| 4. hours were day-blind | `nextOpening` scans forward; asserted at five clocks |
| 5. insurance answer in MSA | Riyadh Arabic, meaning unchanged word for word |
| 6. cadence enforced 3, rule says 2 | cap is 2, `splitRecap` is the documented opt-in |

**The answer to item 8 was Faysal, not the roster.** Padding the roster with
invented male dermatologists to avoid an awkward sentence is the same defect as
the availability claims this product refuses everywhere else. He now says which
of three truths applies — we have one here, we have one at another branch, or we
do not have one and I am sorry — and on the third he does **not** book. Rule
DOC-1 always said gender is a filter; the product simply had no way to apply one.

### Still open

**The rail text is now bilingual — and the English copy needs SPEC-4 §12 row 4
sign-off before a real patient sees it.** All three branches (A with a named ER, B
with none, C for self-harm) have an English form, and the route picks the language
from the raw inbound before any classifier runs, so it costs nothing and cannot
throw.

Every English line is a TRANSLATION of the frozen Arabic beside it: same branch,
same line count, same 997 on the same line, the same forbidden-token predicate —
which now reads English too, or it would have waved through «don't worry, book an
appointment», both banned things in one sentence. The ER site name stays in Arabic
on purpose: «مجمع الوطن الطبي 1» is what is written on the building, and renaming
it would send someone looking for a door that does not exist.

It is still new rail copy. SPEC-2 §5.1 owns the wording and §12 row 4 sends it to
a clinician, and that has not happened. **Shipping a translation and flagging it
beats shipping an emergency instruction nobody in the room can read** — but it is
flagged, not signed off, and this line is the record of that.

Two new ACCEPTED OVER-FIRES from the English arm have **no row in SPEC-4 §12** and
need one. Both are carried in MUST_FIRE with written reasons rather than hidden in
the quiet corpus, which is this repo's rule for an over-fire it has chosen:

- «is there a self harm awareness leaflet for schools?» — the exclusion that would
  close it has the same shape as «I'm suicidal, is there a programme?».
- «I had a heart attack in 2019 and I need a cardiology follow up» — a phrase term
  inside a follow-up frame. §2.1 says such terms fire alone and §1.5 R1 forbids a
  frame veto on a HARD class.

And one deliberate non-guess: «I take a lot of medicines for my blood pressure»
fires poisoning. Only the verb aspect separates it from «he took a lot of pills»,
so it is left firing per §13 rather than closed on a guess.

Smaller, and each real:

- **`hit.termAr` now carries English strings.** Pre-existing, but the field name is
  Arabic-specific and it reaches `rail.ts`, the pager and the audit row. Worth a
  rename to `term`.
- **Arabizi beyond the enumerated franco phrases is unreached**, and the English
  quiet corpus is one register — a patient typing to a clinic.
- **§12 row 13 (CI) is unchanged.** The proof is registered in `unit-suite.json`,
  which is visible, not enforcing.
- **Walls of text.** The insurance answer is still five sentences in one bubble,
  and the package terms are four clauses on one line right after two prices. The
  shape to aim for is one fact, one consequence, one question.

### The original list, kept for its reasoning

1. **The `urgent` tier has no voice.** `safetyUrgent` in `strings.ts` has zero call
   sites and `turn/route.ts` discards a non-emergency verdict. Wiring it must happen
   **before** `consumeSpendGuard` — «a safety rail gated on a billing counter is not a
   safety rail» is that file's own header rule.
2. **Class F is Arabic-only.** `INFANT_FEVER` has no English arm. Shipping English
   parity for *booking* while the safety rail stays Arabic-only is, in the auditor's
   words, «the one combination that must not ship». Either the English arm lands or
   the English surface is gated and the limitation is written down.
3. **English age reading.** «my daughter is 9» is not parsed by any Arabic-lead age
   reader, so anything keyed on age is null for every English patient.
4. **Hours are day-blind.** «يفتح اليوم 9:00 ص» at 23:40, «opens 4:30 pm» at 21:30 on
   a Friday. Any night line must **not** claim a 24-hour building — SPEC-4 §5.3 bans
   the bare «24 ساعة» / «على مدار الساعة» on its own, hedge or no hedge.
5. **The insurance answer is Modern Standard Arabic officialese**, not Riyadh
   WhatsApp. «مُدرجة ضمن», «تُحتسب», «احضر» — no design item touched it.
6. **Cadence.** SPEC-2 §4.2 is ≤2 messages per turn, 3 only for the split-recap.
   `assertCadence` enforces ≤3, and `mergeOpening` drops the greeting at 3. Nothing
   enforces the rule that actually governs.
7. **Ar Rawdah's باطنية is a one-man clinic and must stay one.** The site books
   internal medicine only through its `DEMO_SEEDED_CAPABILITY` row — §6.2 reads
   `group_only` there — and the auditor's rule is that a clinician may be added only
   where the routing or capability row already **names** that specialty at that site.
   So «أبغى دكتورة باطنية» in Ar Rawdah has no answer, and balancing it would mean
   inventing a capability claim. Recorded, not papered over; the domain proof says so
   in a comment beside the loop that skips the site.
8. **Eighteen demo-bookable clinics are staffed by one gender** (five more at the
   unseeded sites). Not the same defect — the roster is not empty — but the same
   sentence to the patient, because a filter that empties the day is a refusal wearing
   a filter's clothes. The full list is what the §15 sweep prints; the one that
   matters most is **Ar Rawabi's جلدية and ليزر, two women and no man**, on the demo's
   busiest path: «أبغى دكتور جلدية» in Ar Rawabi empties the day today. Every one of
   these sites is `named_at_site` for the clinic in question, so the auditor's rule
   permits the fix — it was left out of this pass because the gap the audit named is
   an *empty* roster, and widening the fix to gender balance is a roster decision, not
   a defect repair.

---

## 5. Decisions taken by the founder in this wave

1. **Invented general-practice doctors may be added** so «كشف عام» books like every
   other clinic. All names invented; real clinicians stay blocked by the build-time
   denylist; every price and confirmation keeps its demo label.
2. **The held emergency thread should read as human** — full siren first, then the
   shorter line that keeps 997 visible and hands over the branch number, with booking
   still locked.
3. **Full English for the booking path.** Partly shipped (greeting echo, thread
   language); the slot labels, chips and confirmation rows remain, and item 2 above
   gates how far this can go.
