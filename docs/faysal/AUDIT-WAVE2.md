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

### Still open (not shipped, recorded)

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
7. **`internal_medicine` has the identical latent defect one need over**: it is
   `named_at_site` at two sites with zero internists rostered.
8. **The denylist guard reads the seed file, not the engine roster.** Part C's
   full-name containment scan does cover `lib/health`, but the stricter name-part
   check is blind to `lib/health/clinicians.ts`. The new roster was checked against it
   by hand — zero clashes — and widening Part D is a small follow-up.
9. **`scripts/seed-faysal.ts` is six people behind the engine roster.**

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
