# AUDIT — WAVE 1 · فيصل / Faysal

**Auditor:** Agent 5 (Defects). **Date:** 2026-09-09.
**Scope:** `SPEC-1-DOMAIN.md`, `SPEC-2-PERSONA.md`, `SPEC-3-REUSE.md`, `SPEC-4-SAFETY.md`, read complete, against `SOURCE_DOSSIER.txt` and the repo at `claude/pm-replacement-test-y8xq96`.
**Method:** every matching claim below marked **[DRIVEN]** was executed — the boundary matcher of SPEC-4 §1.2 built verbatim, `normalizeAr` copied verbatim from `lib/ai/allergen-gate.ts`, and `lib/ai/allergen-emergency.ts` imported and run through the repo's own `scripts/ts-ext-loader.mjs`. Claims marked **[READ]** were verified by reading the named file or spec section. Claims marked **[SUSPECT]** were not provable with what is in the repo today and say so.

**Verdict up front: BLOCKED. 9 blockers, 23 should-fix, 10 nits.**

The specifications are unusually good. SPEC-3's factual survey is near-perfect (every line count, every cited line number, the 58/122 counts, the `continue-on-error`, the `Presentation` block, the CI `paths:` filter — all confirmed exactly). SPEC-1's dossier citations are accurate throughout and its hours model is the right design. SPEC-4 found real traps nobody else would have. The blockers below are not sloppiness; they are the places where a rule was stated but never driven, or where two documents each assumed the other owned something.

---

## BLOCKERS

### B1 — A booking frame silences HARD classes, including stroke. `SPEC-4` §1.3/§1.4 vs §2.2, §2.4 · **[DRIVEN]**

**Defect.** §1.3's legend defines `HARD` as "fires through any surrounding frame (past, **booking**, denial, hedging). Only the hypothetical veto stops it," and §1.4 restates it: "It vetoes SOFT only." But §2.2 makes the booking veto part of the operative rule for a HARD class:

> "`شلل` must not be followed by `الأطفال`/`اطفال`, nor preceded/followed by `الرعاش`, **and it must not sit inside a `BOOKING_FRAME_RE` clause**."

Class B (stroke) is HARD. Driving §1.4's `BOOKING_FRAME_RE` verbatim:

```
شلل term FIRES | booking-frame present: true   «ابغى موعد اليوم لان امي جاها شلل نصفي فجاه»
شلل term FIRES | booking-frame present: true   «متى تطعيم شلل الأطفال؟»
```

The veto fires on both — it silences the stroke and, for the polio case, buys nothing, because §2.2 *already* specifies the `الأطفال` negative lookahead that does the real work. The booking clause is pure cost.

**Failure scenario.** «ابغى موعد اليوم لان امي جاها شلل نصفي فجاه» — "I want an appointment today because my mother suddenly has hemiplegia." One clause (no punctuation to split on). `BOOKING_FRAME_RE` matches `ابغي…موعد`. Detector silent. Faysal offers a slot. Thrombolysis window closes.

**Same shape, same class hardness, in four more places.** §2.4 lists «عندي ربو ومحتاج تجديد البخاخ» as MUST-NOT-FIRE with reason "booking frame" — class D, HARD. §2.5 gives "booking frame" as the reason for three class-E (HARD) near-misses. §2.6 for class F (HARD). §2.7 for class G (HARD). Those four are *redundantly* wrong (the messages also lack a danger predicate, so they would be quiet anyway) — but they teach the implementer that the booking frame is a live veto on HARD, and §2.2 is where that teaching gets acted on.

**And §2.4's own stated reason does not even hold** — [DRIVEN]:

```
ربو term FIRES | booking-frame present: false   «عندي ربو ومحتاج تجديد البخاخ»
```

`BOOKING_FRAME_RE` carries `تجديد وصفه`, not `تجديد البخاخ`. There is no booking frame in that sentence. So the asthmatic asking for an inhaler refill fires the airway emergency rail: 997, an ambulance instruction, and a P0 page. §11.2 separately asserts «عندي ربو» **fires**, so the two sections require opposite verdicts on the same term in the same sentence.

**Fix.** Strike the booking clause from §2.2's `شلل` rule and from every HARD near-miss reason in §2.4–§2.7; give «عندي ربو ومحتاج تجديد البخاخ» a real mechanism (a refill/prescription clause veto, or a requirement that `ربو` carry an exacerbation predicate).

---

### B2 — The emergency rail is escapable on the next turn. There is no hold. `SPEC-4` §1.2, §2.9 r5, §4.1, §9.1 · **[READ, grep-verified]**

**Defect.** §1.2 asserts "The verdict is **not revisable by later turns**." §2.9 rule 5 asserts "Once fired, **nothing retracts it in that thread**." §9.1's table says an emergency rail leaves booking "blocked."

There is no mechanism behind any of those three sentences. §1.1 makes the detector `PURE. No I/O, no model, no DB, no clock.` §4.1's flow ends `RETURN. ← the turn ends here`. §11.8's only related assertion is that `self_harm` never carries `booking_allowed: true` — on the firing turn. `grep -n "safety-hold\|safety_hold\|thread-level\|persistent hold\|hold is open"` over SPEC-4 and SPEC-2 returns exactly one hit, and it is the unrelated voice-budget string `hardZeroReason = "safety_hold"`.

The repo already has the mechanism. `lib/db/safety-hold.ts` (`isSafetyHeld`, `ownership_state === "SYSTEM_HOLD" || is_safety_hold`) and `lib/db/safety-hold-guard.ts` ("an order linked to that conversation MUST NOT be committed … Fail-CLOSED on a read error … RELEASE is an explicit operator next-action"). SPEC-3 §10.2 gives both a FORK verdict — "Refuse **booking** confirmation while a triage hold is open." SPEC-4 never references it, and SPEC-4 §13's "still open" list does not claim it either. It fell in the gap between the two documents.

**Failure scenario.** Turn 1: «صدري يعورني وأتعرق». Rail fires, 997, human paged. Turn 2, ninety seconds later: «طيب أبغى موعد قلب بكرة الساعة 10». That message is a booking frame plus `قلب` with no possessive-chest term and no pain predicate — every rule in §2.1 says it is quiet, and it should be. `detectRedFlag` is stateless, returns `fired:false`, the booking tools are back in the tool set, and Faysal replies «تم الحجز ✅ … الموعد: بكرة 10:00 ص». That is SPEC-2 §8.1 #14 `emergency_downgrade` («تعال بكرة الصبح» after chest pain) arriving through the front door, because the persona-layer prohibition is also per-turn.

**Fix.** Name a `health_conversations.triage_hold` state (fork of `SYSTEM_HOLD`), set it in the rail's `pageHuman()` branch, read it in the booking tool's write path (not the prompt), release it only by explicit operator action, and add the assertion to §11.8: *a booking write on a thread with an open triage hold is refused, on the turn after the rail fired.*

---

### B3 — The airway family SPEC-4 inherits is first-person only. A parent reporting a child who cannot breathe is silent. `SPEC-4` §2.4 · **[DRIVEN — real detector executed]**

**Defect.** §2.4 is titled "**inherit, do not re-invent**" and says the airway family is "**imported verbatim from `lib/ai/allergen-emergency.ts`** — patterns, Najdi negations, the «نفسي ضايق» idiom carve-out … and the `hard`/`soft` split. It was written by someone who found these bugs in production, it is already proven." SPEC-4's additions on top are cyanosis, retractions, `اختناق` and inhaler-failure phrases. Nothing in §2.4 adds a third-person breathing pattern.

Executing the real `detectAllergenEmergency` (via `node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs`):

```
ok             MUST FIRE  FIRES  «ما أقدر أتنفس»
ok             MUST FIRE  FIRES  «مو قادر أتنفس»
*** DEFECT *** MUST FIRE  quiet  «ابني ما يقدر يتنفس»
*** DEFECT *** MUST FIRE  quiet  «بنتي ما تقدر تتنفس»
*** DEFECT *** MUST FIRE  quiet  «الطفل ما يتنفس»
*** DEFECT *** MUST FIRE  quiet  «ابني مو قادر يتنفس»
*** DEFECT *** MUST FIRE  quiet  «ابني حلقه يقفل»
*** DEFECT *** MUST FIRE  quiet  «ابني شفايفه زرقاء»
*** DEFECT *** MUST FIRE  quiet  «أمي ما تقدر تتنفس»
*** DEFECT *** MUST FIRE  quiet  «زوجتي حلقها يتورم»
```

The regexes are `ما ?اقدر ?(?:ا|ال)?تنفس` (first-person `اقدر` only) and `(?:حلقي|زوري|حنجرتي|بلعومي) ?(?:يقفل|…)` / `(?:شفايفي|شفتي|لساني|وشي|وجهي|عيني|حلقي) ?(?:تورم|…)` — every body-part term is first-person-possessive. In a restaurant, the person who cannot breathe is the person typing. In a paediatric clinic it is not.

**The irony is load-bearing.** SPEC-3 §3.5 singles out `lib/ai/symptom-frames.ts` for exactly this — "BOTH PERSONS, DELIBERATELY … the difference between hearing a mother describe her child's symptoms and not." Neither SPEC-3 nor SPEC-4 wires `FRAME_WORDS` into the airway family. `grep` confirms `symptom-frames` is imported by `allergen-gate-symptoms.ts` and `allergen-context.ts`, **not** by `allergen-emergency.ts`.

**Failure scenario.** 02:10. «ابني عمره سنتين وحلقه يقفل وما يقدر يتنفس». Detector silent. No rail, no 997, no page. Faysal's after-midnight greeting (SPEC-2 G4) fires instead and offers to book the morning.

**Fix.** Every body-part term in classes A–D must be enumerated in first *and* third person (`حلقه/حلقها`, `شفايفه/شفايفها`, `لسانه/لسانها`, `وجهه/وجهها`), and the negation families must accept `يقدر/تقدر/يقدرون` beside `اقدر`. Anchor them on `FRAME_WORDS` and assert third person in §11.1's MUST_FIRE corpus for every class.

---

### B4 — The cardiac class cannot hear the commonest way chest pain is written. `SPEC-4` §2.1 · **[DRIVEN]**

**Defect.** §2.1's separating rule and its enumeration:

> "a chest term must be **possessive or prepositional and about the patient** (`صدري`, `بصدري`, `في صدري`, `على صدري`) *and* carry a pain/pressure predicate."
> "List `صدري` · `صدره` · `صدرها` · `بصدري` · `فصدري` · `قلبي` · `قلبه` · `قلبها` explicitly."

Every "prepositional" example given is *also* possessive. No definite-article form appears anywhere in the class. Driving §2.1's rule as written (enumerated terms + boundary + pain predicate, clause-scoped):

```
ok            FIRES  «صدري يعورني»
ok            FIRES  «ألم في صدري»
*** DEFECT *** quiet  «ألم في الصدر»
*** DEFECT *** quiet  «ألم بالصدر»
*** DEFECT *** quiet  «وجع بالصدر من ساعة»
*** DEFECT *** quiet  «عندي ألم شديد بالصدر وأتعرق»
*** DEFECT *** quiet  «الصدر يعورني»
*** DEFECT *** quiet  «حاس بضغط على الصدر»
*** DEFECT *** quiet  «زوجي يشتكي من ألم في الصدر»
```

`بالصدر` and `في الصدر` are the standard written forms; they are what a patient types when they are being careful, and what an expatriate Arabic speaker types by default.

**Failure scenario.** «عندي ألم شديد بالصدر وأتعرق» — textbook ACS with diaphoresis. Detector silent. Faysal proceeds to §6.1 `motion.discover` and asks which district the patient is in.

**The fix is cheap and costs nothing in the near-miss corpus.** Add `الصدر`, `بالصدر`, `في الصدر`, `على الصدر` to the enumerated list. §2.1's own near-misses stay quiet because they carry no pain predicate: «صدر الدجاج مسموح في الرجيم؟» and «صدر التقرير أمس؟» have none.

---

### B5 — The hemorrhage rule is narrower than its own Fires list. `SPEC-4` §2.3 · **[DRIVEN]**

**Defect.** §2.3's Fires list includes «ينزف بغزارة» and «الجرح عميق والدم فوار». Its operative rule says something different:

> "`دم` and `نزيف` are boundary-matched, and a hit requires a **persistence or volume predicate** (`ما يوقف`, `بغزارة`, `كثير`, `يفور`, `ما وقف`) **or** a hemorrhage site (`تقيأ`, `براز`, `بعد الولادة`, `بعد العملية`)."

Two gaps, both driven:

```
ok            FIRES  «نزيف ما يوقف»
*** DEFECT *** quiet  «نزيف شديد»
*** DEFECT *** quiet  «نزيف غزير»
*** DEFECT *** quiet  «نزيف قوي مره»
*** DEFECT *** quiet  «الجرح ينزف بقوة»
*** DEFECT *** quiet  «دم واجد من الجرح»
*** DEFECT *** quiet  «ينزف من نص ساعة وما وقف»
*** DEFECT *** quiet  «الدم فوار من الجرح»
*** DEFECT *** quiet  «جرح عميق وينزف»
```

1. **The verb is not a term.** `ينزف` / `تنزف` / `أنزف` share no substring with the noun `نزيف` (ي-ن-ز-ف vs ن-ز-ي-ف). §2.3 lists only the two nouns, so «ينزف من نص ساعة وما وقف» is silent *even though it carries `ما وقف`*, the strongest predicate on the list.
2. **The predicate list omits the ordinary intensifiers.** `شديد`, `غزير`, `بقوة`, `واجد` (Gulf "a lot") and the adjective `فوار` are all absent — and `فوار` appears in the spec's own Fires list.

**Failure scenario.** «نزيف شديد ما أعرف وش أسوي» — silent. Or, worse, «الجرح عميق وينزف» — a deep bleeding wound, silent, because neither the verb nor a listed predicate is present.

**Fix.** Add the verb forms as terms and `شديد|غزير|بقوة|واجد|فوار|كثير مره|ما وقف` to the predicate set. §11.2 must pair each addition with the near-miss it must not cost (`«أبغى تحليل دم»`, `«نزيف اللثة لما أفرش»`).

---

### B6 — A patient can be sent to a branch whose ER is shut. Three specs model ER availability three incompatible ways. `SPEC-1` §4.1/§11, `SPEC-2` §2.2 G4/§10, `SPEC-4` §4.4 · **[READ]**

**Defect.** Three models, none derivable from the others:

| spec | model | granularity |
|---|---|---|
| SPEC-1 §4.1 | `SiteHours.layers[er].week[day]` — tri-state status, confidence, conflicts, `capturedAt`, 30-day decay | per day, per layer |
| SPEC-2 §10 | `branch.has_24h_er` — **a boolean** | none |
| SPEC-4 §4.4 | `erSites({now})` — `is_er`, `er_open_24h`, `er_hours_by_weekday`, `hours_verified_at`, `verified_by`, 30-day expiry | per weekday, verified |

SPEC-4 §4.4 is right and says why: "Sending a patient with chest pain to a branch that closed at midnight is a lethal defect that a unit test cannot catch." SPEC-2's after-midnight greeting G4 does not use it. It reads `branch.has_24h_er = true` and says «الطوارئ عندنا شغّالة على مدار الساعة في {er_branch_name}». A boolean has no day dimension, so it cannot express Shoaa Rawdah's «ER until midnight» [D §3.6 L204] or Complex 1's Friday, which SPEC-1 §4.4 itself records as `conflicted` — 13:00–24:00 versus 13:00–07:00.

SPEC-1 §0.2 states the principle SPEC-2 then breaks: a flattened hours field "is the exact mechanism by which a patient is sent to a locked door."

**And SPEC-1 §11 MED-2 does the thing SPEC-4 §4.4 forbids outright.** MED-2: "The escalation line names the emergency number and the nearest 24-hour site with an ER — Complex 1 is open 24 hours with an ER and duty doctor `[D §3.1 L112–113, L127]`, and Shoaa Al Wurud advertises 24/7 including ER `[D §3.5 L184–185]`." SPEC-4 §4.4: "`docs/faysal/SOURCE_DOSSIER.txt` is a research artifact and is **not a data source for the rail** … The rail reads ER sites **only** from a tool." Two escalation paths, one dossier-sourced, one tool-gated, and SPEC-1's is the one an implementer reading the domain spec will build.

**Failure scenario.** 00:40, Friday. Patient with a worsening sore throat messages. No red flag fires (correctly). G4 renders and names Complex 1 as the 24-hour ER. Complex 1's own Friday listing closes at midnight under the intersection SPEC-1 §4.7 `[POL-01]` itself adopts for disclosure. The patient drives to Al Yamamah at 01:00 on a Friday and finds it shut.

**Fix.** Delete `branch.has_24h_er` from SPEC-2 §10 and G4; make `{er_branch_name}` a render of `erSites({now})` with the branch-B degradation; strike the two named sites from SPEC-1 §11 MED-2 and point it at the same tool.

---

### B7 — None of SPEC-4's ten proofs is a blocking gate. `SPEC-4` §11 (L930) vs `SPEC-3` §2.1 · **[READ — verified in CI files]**

**Defect.** SPEC-4 §11 preamble: "a standalone `scripts/proof-*.test.ts` … and **registered in `scripts/unit-suite.json`** so it is a blocking gate."

That is false, and SPEC-3 §2.1 already proved it. Confirmed independently:

- `.github/workflows/core-gate.yml:112` — `continue-on-error: true` on the `unit` job, with the comment at L109–111: "Not blocking yet: 2 of 114 files fail … Delete this line once that gap is closed."
- `.github/workflows/agent-eval.yml` `paths:` filter is exactly `lib/ai/**`, `lib/messaging/**`, `lib/db/**`, `app/api/whatsapp/**`, `app/api/channels/whatsapp/**`, `app/api/agent/**`, `scripts/test-*.test.ts`, `scripts/proof-*.mjs`, `scripts/proof-*.test.ts`. No `lib/health/**`.
- `eslint-rules` are both `"warn"` in `.eslintrc.json` (L6–7), and `next lint` exits 0 on warnings.

**Failure scenario.** The three defects in B1–B5 are found in review, fixed in `lib/health/redflag.ts`, and six months later someone narrows one term to kill a false positive. The PR touches only `lib/health/*`. `agent-eval.yml` does not trigger. `core-gate.yml` runs the suite and swallows the exit code. `proof-faysal-redflag-recall.test.ts` goes red and merges green. This is the exact failure `docs/ALLERGEN_SYMPTOM_REVIEW.md` records and that SPEC-4 §11.11 warns about.

**Fix.** SPEC-4 must not claim registration equals gating. It must adopt SPEC-3 §2.4 steps 2 and 3 as a *precondition of its own §11* — a named blocking step in `agent-eval.yml` plus the `paths:` extension — and say so in §12 as a launch gate, because §13 item 5 currently delegates it to SPEC-3 and SPEC-3 lists it only as a risk.

---

### B8 — The real-clinician denylist guard uses the wrong normaliser and will not fire on the likeliest leak. `SPEC-1` §6.4 Rule DOC-4 · **[READ — function inspected]**

**Defect.** DOC-4: "A test … scans all seed data, prompt templates and fixtures for these strings — Arabic and Latin, **diacritic-normalised using the same `norm()` treatment `lib/order-pricing.ts` L99–105 applies** to Arabic menu matching — and **fails the build** on any hit." The implementation gotcha adds: "normalise diacritics, «ال» prefixes, hamza forms and whitespace on both sides first."

`lib/order-pricing.ts` L99–105, read verbatim:

```ts
function norm(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, "")   // tashkeel + tatweel ONLY
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
```

It does **not** fold hamza (`أإآٱ→ا`), does **not** fold `ة→ه`, does **not** fold `ى→ي`, and does **not** strip `ال`. SPEC-1 asserts all four. The function that does all of them is `normalizeAr` in `lib/ai/allergen-gate.ts` — the one SPEC-3 §10.2 wants extracted and SPEC-4 §1.1 reuses.

**Failure scenario.** The denylist holds «هبة أحمد». A seed file, a fixture, or a model completion holds «هبه احمد» — the normalized spelling, and the one every other Arabic matcher in this repo produces. `norm("هبة أحمد")` = `"هبة أحمد"`; `norm("هبه احمد")` = `"هبه احمد"`. Not equal. The build-time guard on a real, identifiable, licensed clinician's name passes silently. PROHIBITION A is unenforced in exactly the case it exists for.

**Fix.** Point DOC-4 at `normalizeAr` (post-extraction: `lib/util/arabic-normalize.ts`), and adopt SPEC-4 §11.5's grep-the-built-bundle assertion beside it — that one is stricter and catches the mononym case (see S21).

---

### B9 — "Fail closed" on a detector exception leaves booking open. `SPEC-4` §10 vs §1.3 · **[READ]**

**Defect.** §10: "Red-flag detector throws → **Fail closed**: treat as `urgent`, hand off, log the input hash. A detector exception is never a quiet pass."

§1.3's tier table: `urgent` → "**Booking remains available.**"

So the designated fail-closed path is fail-*open* for the one thing the rail exists to prevent. On the turn where the detector could not run — the only turn where we have no information at all — Faysal keeps the booking tools, keeps `canBook: true`, and can offer a slot.

**Failure scenario.** A malformed voice transcript or an unexpected character class throws inside `detectRedFlag` on the message «صدري يعورني وأتعرق». Per §10 the turn becomes `urgent`. Per §1.3 `urgent` "offers a same-day appointment." Faysal offers a same-day appointment for an active infarct, plus a P1 handoff at normal priority — not P0, not paged immediately.

**Fix.** A detector exception must degrade to `emergency` with rail branch B (997, no site named, no tools, P0), not to `urgent`. Branch B is already specified and needs nothing but `997`, which is exactly the property §10 relies on ("The rail is unaffected — it needs only `997`"). Assert it in §11.9.

---

## SHOULD-FIX

### Cross-spec contradictions

**S1 — SPEC-2's emoji test blocks the emergency rail. Three-way, `SPEC-2` §4.5 / §8.1 #24 / §11.4 · [READ, line-verified]**
§4.5 L429: "**The complete allowlist — three emoji**" (✅ 🙏 🚨). §8.1 row 24 L879: "any emoji outside the **two-item** allowlist." §11.4 L1075: "a regex asserting no outbound contains an emoji outside `✅`/`🙏`." The specified test rejects 🚨 — the emoji §4.5 admits *as SPEC-4's property*. Separately, §4.5's absolute ban ("any emoji in a message that contains a symptom … a red-flag deflection") rejects the 🙏 that opens SPEC-4 §4.2 rail C. **Both rail variants fail SPEC-2's own emoji test.** Someone loosens the test on day one. SPEC-4 should win: make the allowlist three, and carve the rail out of the clinical-message ban by `stopReason`, not by emoji.

**S2 — A price reaches the patient with no demo marker. `SPEC-2` §5.2 vs `SPEC-1` PRICE-1 / acceptance #14 · [READ, grep-verified]**
SPEC-1 Rule PRICE-1: "**no bare number ever leaves the agent.** Every quoted figure is rendered with its demo label «السعر تقريبي للعرض التجريبي، والمعتمد من الاستقبال.»" Acceptance criterion #14 asserts it. SPEC-2's price-loaded `[ANCHOR]`: «كشف {specialty} بـ {price} ر.س. وإذا مهم عندك تخلّصه اليوم، عندي 7:00 م في {branch} — أثبّته؟» No label. `grep -n "تجريب\|demo label\|PRICE-1" docs/faysal/SPEC-2-PERSONA.md` returns **nothing** — SPEC-2 does not know PRICE-1 exists. Its §8.1 #5 only forbids figures *not in `{tariff}`*, which is a different rule. SPEC-1 wins; SPEC-2 §5.2 and §8.3's determinism table need the label as a frozen suffix.

**S3 — The gold transcript names the laser device, which SPEC-1 forbids. `SPEC-2` §9 turn 7 vs `SPEC-1` Rule RES-1 · [READ]**
Turn 7: «جهاز `GentleMax Pro` اللي نسوّي عليه الجلسات موجود في الروابي». SPEC-1 RES-1: "**Faysal does not name the device to the patient.** The evidence is a review, not a spec sheet, and quoting equipment brands is a claim about the client's capital. **If the patient names it first**, Faysal says the branch is the group's laser branch." In turn 6 the patient did not name it. SPEC-2 §9.1's audit checklist certifies turn 7 as correct. SPEC-2 §10's `branch.devices` slot ("if empty: do not name a device") assumes naming is permitted-when-loaded; SPEC-1 forbids it outright, on provenance grounds — the only source is `[D §3.2 L146]`, a patient review. SPEC-1 wins.

**S4 — The gold transcript books a Friday with no phone number. `SPEC-2` §9 turns 10/12/13 vs `SPEC-1` Rule FRI-1 / acceptance #8 · [READ]**
FRI-1: "**Every Friday reply from Faysal — booking, enquiry or directions — ends with the branch's phone number and an offer to confirm. No exceptions, including at sites whose Friday confidence is `medium`.**" Acceptance #8: "Every reply containing a Friday date contains a branch phone number." Turn 10 offers «بكرة الجمعة 5:30 م»; turn 12's confirmation block and turn 13's pre-visit block contain no phone. The slot itself is legal (Rawabi Friday 16:00–24:00, `medium` — bookable), so this is purely the missing disclosure. The showpiece transcript fails SPEC-1's acceptance test.

**S5 — «كويس» in the gold transcript is a dialect leak the mandated linter does not catch. `SPEC-2` §9 turn 7 (L966) · [READ — linter source inspected]**
«شعاع الروضة فرع **كويس** وقريب لك». The Najdi word is «زين» — SPEC-2 §1.3 lists it as such. «كويس» is Egyptian/Hijazi. It is **not** on `EGYPTIAN`, `LEVANTINE`, `HIJAZI`, `OTHER` or `CARICATURE` in `lib/ai/personas/khalid-dialect-linter.mjs`, whose own header records that it "missed 42 of 51 markers an audit fed it." So the transcript passes §11.2's mandated linter and still reads Egyptian to a Riyadhi. §9.1's checklist claims "all: zero Egyptian/Levantine markers." One word, in the one transcript the client will read.

**S6 — SPEC-2 prescribes a word its own mandated linter bans. §1.3 vs §11.2 · [READ]**
§1.3: "`أبي / أبغى` not `أريد`." §11.2: "**`khalid-dialect-linter.mjs` reused unchanged** … Faysal is Najdi, so the `HIJAZI` axis applies to him exactly as it does to a `najd` tenant." `HIJAZI = ["تبغى","تبغون","يبغى","نبغى","أبغى","ابغى","إيش","ايش","دحين"]`. «أبغى» and «ابغى» are on it. No frozen string is affected today, but the model is being instructed to produce a token the gate rejects. Resolve to `أبي` in §1.3, or drop the HIJAZI axis in §11.2 and say why.

**S7 — SPEC-2 §2.2 renders a slot time for Complex 4, which SPEC-1 §4.6 forbids. Q3 is only half-settled · [READ]**
SPEC-1 §4.6 point 2: at `wattan-4` Faysal takes the request "as a **callback request**, not a slot … `appointmentKind: "callback_request"` … it does not consume slot inventory and **never renders a time the patient could turn up for**." Acceptance #10 asserts it. SPEC-2's `greeting.branch_unverified.book_anyway` says «تمام، أحجزه لك في {branch_name} … والحجز يعتبر مبدئي» and its only stated adaptation to `motion.confirm_block` is that it "drops the ✅" — the block still carries «الموعد: {slot}». SPEC-2 Q3 claims this reconciled; it reconciled *bookability*, not *slot-versus-callback*. SPEC-1 wins.

**S8 — SPEC-1 and SPEC-4 disagree on whether 997 is frozen or config. `SPEC-1` §11 MED-2 / `[OPEN-08]` vs `SPEC-4` §4.2 / §11.3 · [READ]**
SPEC-1: "**The emergency number itself must be confirmed with the client before the demo** — `[OPEN-08]`; 997 … and the 911 unified number … are both in circulation," interim behaviour "the number is a **config value, unset until confirmed**." SPEC-4 §4.2 hardcodes `997` in a frozen string and §11.3 asserts it **byte-exact**. SPEC-2 Q1 declares it settled to SPEC-4. Two of three agree, but an implementer building the domain layer from SPEC-1 ships an unset config, and branch A renders «اتصل بالإسعاف  الحين». SPEC-4 wins; SPEC-1 §11 and `[OPEN-08]` must be rewritten to defer, keeping only the sign-off requirement.

**S9 — SPEC-4's phone allowlist cannot enforce SPEC-1's site-scoped suppression. `SPEC-4` §6.2 vs `SPEC-1` §3.4 · [READ]**
SPEC-1 §3.4 suppresses `0114588444` *as Complex 4's number* with a named reason ("Giving it as 'the Shifa number' may route a patient to a different branch"), and `[OPEN-11]` keeps it suppressed. SPEC-4 §6.2's allowlist is number-scoped and contains `0114588444` because it is Complex 1's primary. A reply reading «فرع الشفا — 011 458 8444» passes §6.2 unchallenged. The guard needs a `(site, number)` pair, not a flat set.

**S10 — Shoaa Wurud OB-GYN is bookable on the strength of a review of a real named clinician. `SPEC-1` §6.2 fn3 vs Rule STR-1 · [READ against dossier]**
Rule STR-1: "no strength may be built from a star rating (Rule RATE-1) or **from a review of a named clinician** (Prohibition A)." §6.2 footnote 3 marks Shoaa Wurud OB-GYN `N` (`named_at_site`) "evidenced by a patient review referencing an OB-GYN consultant `[D §3.5 L194]`", and Rule SPEC-1 makes only `named_at_site` **bookable**. Dossier L194's directory list for Shoaa Wurud is "pediatrics, ENT, dentistry, internal medicine, general medicine" — OB-GYN appears there *only* as "OB-GYN Dr. Hanan Ali in one English review," a denylisted person. The prohibition is satisfied at the strength table and bypassed at the specialty matrix. Downgrade to `G` (group-only, conversational) or find a non-review citation.

### The reuse map

**S11 — Two SHARE verdicts are transitively coupled to FORK/NEVER files. `SPEC-3` §7.1, §8.1 · [READ — imports inspected]**
- `lib/messaging/service.ts` is **SHARE** (§7.1). It imports `./message-log-store`, which SPEC-3 §7.4 classifies **NEVER** ("Client Zustand log for the Kivo Settings simulator; imports `newId` from `lib/store`"). A Faysal import of `service.ts` pulls a NEVER module and the Kivo global store across the seam, and §2.2-B fails on it.
- `lib/demo/speech-ticket.ts` is **SHARE** (§8.1). It imports `@/lib/messaging/voice-budget` (**FORK**, §7.3) and `@/lib/demo/voice-out` (**FORK**, §8.1).

SPEC-3 caught this shape once (`send-template.ts` → `capacity.ts`, made SHARE\*) and missed it twice. The `SHARE*` list is 5; it should be at least 7. Every SHARE verdict needs its transitive closure checked before §2.2's ALLOWED_MODULES is transcribed, or the proof is red on Faysal's first commit and the tempting fix is to widen the allow-list.

**S12 — `lib/ai/symptom-frames.ts` is not domain-neutral. `SPEC-3` §0, §3.5, §10.2 · [READ]**
SPEC-3 calls it "zero domain coupling," "the most medically valuable file in a restaurant codebase," and "**Transfers to a clinic with no edit.**" Its `NOT_A_PERSON` place list is:

```
"الجو|المحل|المطعم|المكان|القاعه|الغرفه|الفرن|الشارع|السياره"
```

`المطعم` (the restaurant), `المحل` (the shop), `الفرن` (the oven). It is a restaurant place list. A clinic's places — `العياده`, `المستشفي`, `المجمع`, `الفرع`, `الاستقبال`, `صاله الانتظار`, `الممر` — are absent, and `FRAME_WORDS` carries bare `عندها`/`عندهم`, so «العيادة عندها ازدحام» reads as a person reporting a symptom. Verdict should be **SHARE\*** with a named change: parameterise the place list, or take `FRAME_WORDS` shared and fork `NOT_A_PERSON`.

**S13 — The scanner SPEC-3 says to reuse is not exported. `SPEC-3` §2.2, §11.1 · [READ]**
"Do not write a new scanner. That file already contains … `stripComments()` … `bindingsFrom()`" and "§2.2 reuses them rather than writing a new scanner." In `scripts/proof-phonetic-net-unwired.test.ts`, `stripComments` is declared at L52 with **no `export`**, and `bindingsFrom` at L169 is a **nested function inside a block**. Neither is importable. The Faysal proof must copy them — two divergent copies of an adversarially-hardened scanner, which is the exact drift SPEC-3 praises `symptom-frames.ts` for preventing. Add "export `stripComments`/`bindingsFrom` (or extract to `scripts/lib/import-scan.mjs`)" to the pre-Faysal PR list.

**S14 — There are two divergent `normalizeAr` implementations. `SPEC-3` §10.2 · [READ]**
§10.2's central finding is "`normalizeAr()` … **lives inside `lib/ai/allergen-gate.ts`**." True, but incomplete: `lib/ai/callback-trigger.ts:13` exports a second `normalizeAr`, and it is **missing the 3+-letter run collapse** `.replace(/([ء-ي])\1{2,}/g, "$1")`. SPEC-4 §2 depends on that collapse («ماااا أقدر»). If the extraction PR re-exports the wrong one, or a Faysal file imports from `callback-trigger`, emphatic spellings stop normalizing and every Najdi negation goes deaf on them. The extraction must reconcile both call sites, not just move one.

**S15 — The seam proof's part D has three blind spots. `SPEC-3` §2.2-D, §2.3 · [READ]**
§2.3 is right that part D is the half that matters. As specified it misses:
1. **`rpc()`** — `supabase.rpc("next_order_number", { p_restaurant_id })`, `rpc("is_member_of")`, `rpc("kv_demo_try_consume")`. §1.1 names `next_order_number` as a hazard and part D does not scan for it.
2. **Non-literal table names** — `.from(tbl)` where `tbl` is a constant or template literal matches neither the ban list nor the positive assertion, so it passes silently. Part A's vacuity controls do not cover it. Add: *every `.from(` occurrence in a Faysal source matched the string-literal form.*
3. **Migrations** — a Faysal migration adding `references public.restaurants(id)` is not under any scanned directory.

**S16 — SPEC-3's migration count mis-attributes a column to a table. §1 · [READ]**
"**65 of 119 migration files** touch it [`restaurant_id`]." Actual: 119 migration files ✓; **59** contain `restaurant_id`; **65** contain `restaurants`. The 65 is the table, not the column. Everything else in §1 is exact (58 `from("restaurants")` ✓, 122 `restaurant_id` files ✓).

### The safety rails

**S17 — Three rows of SPEC-4's own boundary-behaviour proof table are contradicted by driving. `SPEC-4` §11.2, §2.1, §2.7 · [DRIVEN]**
§11.2 presents a table "asserted as *behaviour of the matcher*, not as prose — every one of these was driven while writing this spec." Building §1.2's matcher verbatim over `normalizeAr` output, 16 of 19 rows confirm. Three do not:

| input | term | §11.2 requires | driven | why |
|---|---|---|---|---|
| «شفايفه زرقاء» | `شفايف` | **fires** | **quiet** | trailing `ه` fails `(?![ء-ي])` — the same possessive deafness §2.1 documents for `صدر` |
| «صدر التقرير أمس؟» | `صدر` | quiet | **fires** | `صدر` is a whole word (the verb "was issued"), not a substring of `مصدر` |
| «عندي صعوبة في البلع» | `بلع` | quiet | **fires** | `البلع` is the noun "swallowing" as a whole word, not a substring of `البلعوم` |

Two of these also carry a **false reason** in the near-miss tables: §2.1 explains «صدر التقرير أمس؟» as "«صدر» inside «مصدر»/«صدرت» — no boundary," and §2.7 explains «عندي صعوبة في البلع» as "`بلع` is a substring of `البلعوم`." Both are the `الشفا` trap — a whole word the boundary cannot save — caught for one term and missed for two others.

Consequence, and it is the reason this is not a nit: §11.2's table is meant to be transcribed literally into `proof-faysal-false-positives.test.ts`. As written the proof is **red at birth**, and the obvious fix is to relax the lookahead on `شفايف` — after which the possessive-suffix class of bug returns. Meanwhile, if an implementer trusts §2.1's stated reason and adds bare `صدر` with a boundary as a recall net, «صدر التقرير أمس؟» — an ordinary clinic message — raises a cardiac emergency.

**S18 — The «نفسي ضايق» idiom carve-out is restaurant-shaped. `SPEC-4` §2.4 · [DRIVEN — real detector]**
§2.4 imports the carve-out "verbatim." Its object list is `خدمه|تعامل|انتظار|تاخير|وضع|كلام|رد|سوالف|طريق|زحمه` — a delivery complaint vocabulary. Executed:

```
ok             must be quiet  quiet  «نفسي ضايق من الانتظار»
ok             must be quiet  quiet  «نفسي ضايق من الزحمة»
*** DEFECT *** must be quiet  FIRES  «نفسي ضايق من الدوام»     [ضيق نفس]
*** DEFECT *** must be quiet  FIRES  «نفسي ضايق من المواعيد»   [ضيق نفس]
```

A patient frustrated with the clinic's opening hours gets an ambulance instruction and a P0 page. Add `دوام|مواعيد|حجز|اجراءات|مستشفي|فاتوره|استقبال` — and pair each with its true positive, per §11.2's own discipline.

**S19 — `detectRedFlag(text)` cannot carry the infant's age, so §2.6's <3-month rule is unimplementable. `SPEC-4` §1.1 vs §2.6 · [READ]**
§2.6: "age < 3 months + any temperature ≥ 38.0 → **emergency**, with no further question asked; … age ≥ 3 months + fever alone → `urgent`." §1.1's signature is `detectRedFlag(text: string)` and §1.1 requires purity ("No I/O, no model, no DB, no clock"). Age is routinely disclosed in a *previous* message: «ابني عمره شهرين» then, two turns later, «حرارته ما تنزل صار 39». On the second message the detector sees no age, defaults to the ≥3-month reading, and returns `urgent` — booking allowed, P1 not P0 — for a two-month-old with a fever. §11.1's MUST_FIRE corpus tests single strings, so the proof passes. `lib/messaging/inbound-coalescing.ts` (SHARE) merges *bursts*, which mitigates only the same-second case. Either widen the signature to `detectRedFlag(text, ctx: { ageBand })` and say where `ageBand` comes from, or make an unknown age default to `emergency` for any fever with an infant marker.

**S20 — SPEC-4's own replacement line makes an availability claim with no tool. §5.3 vs §6.3 · [READ]**
§5.3's safe-terminal line ends: «وإذا زاد الوضع أو ما احتملت، **الطوارئ مفتوحة** و997 موجود.» §6.3: "**Hours** come from the sites tool with `hours_verified_at`; stale → Faysal says it will confirm … It never recites the dossier." SPEC-2 §8.1 #12 `availability_claim` bans exactly this shape. And §5.2's `assertsMedicalClaim` has no `availability` kind, so the guard §5.3 is checked against cannot catch it — §11.4's double-lock passes it. At 02:00 the line asserts an open ER when Shoaa Rawdah's closed at midnight and Ar Rabwah has none. Reword to «الطوارئ و997 موجودين» (SPEC-2's `safety.urgent` phrasing, which asserts existence, not opening), or add an `availability` kind to `assertsMedicalClaim`.

### Persona and provenance

**S21 — The denylist cannot catch a mononym. `SPEC-1` §6.4 DOC-4 · [READ]**
The denylist contains «Noreen» / «نورين» — a nurse's given name with no surname. DOC-4's implementation gotcha mandates: "**Match full names**; normalise diacritics, «ال» prefixes, hamza forms and whitespace on both sides first." A full-name matcher over a single-token entry will not fire on «الممرضة نورين» inside a prompt template or a fixture. SPEC-4 §11.5 gets this right by grepping for the exact strings. The two specs prescribe different matching disciplines for the same guard; SPEC-4's is correct for mononyms and SPEC-1's is correct for the «ال»-particle false-positive it documents. Both are needed: token-match the mononyms, full-name-match the rest.

**S22 — `motion.discover` asks three things; §4.1 caps it at two. `SPEC-2` §6.1 vs §4.1 #5 · [READ]**
§4.1 rule 5: "**One ask per message.** An ask may bundle **at most two** adjacent logistical facts in one sentence." `motion.discover`: «عشان أرتّب لك على الأصح: وش تحتاج بالضبط، وأنت بأي حي، والزيارة تأمين ولا كاش؟» — three (need, district, payment). §6.1's own heading calls it "One ask that does **triple** duty." A frozen string violating a rule in the same document, and it is the second message every patient sees. (Turn 2 of the §9 transcript quietly uses the two-part form instead, which is the right one.)

**S23 — A frozen customer-facing string ships an unresolved gender slash. `SPEC-2` §6.6 · [READ]**
`motion.expand`: «أقدر أحجز **لها/له** عند {specialty}». `[FROZEN]` means "it ships as a constant." A literal `لها/له` in a WhatsApp message is a visible template artifact. §4.6 already owns gender resolution — resolve it there, or make it a `{pronoun}` slot.

---

## NITS

1. **`SPEC-4` §1.4 ships dead alternatives — the exact bug it documents.** `HYPOTHETICAL_RE` contains `إذا` and `إن`; `normalizeAr` folds `أإآٱ→ا` before the regex runs, so both are unreachable. `BOOKING_FRAME_RE`'s `نتيجة (?:ال)?تحليل` is likewise dead (`ة→ه`). §2's preamble states the rule ("any un-normalized spelling in it is dead code") and cites the three unreachable alternatives in `allergen-emergency.ts`. Harmless here — `اذا`/`ان` are separately present — but §11.1 asserts "the five conditionals … are all implemented," which the dead spellings would satisfy vacuously.
2. **`SPEC-4` §2 lists «ماني» twice** in the mandatory Najdi negation set.
3. **A two-letter emphatic run survives normalization.** `([ء-ي])\1{2,}` collapses 3+ only, so «ماا أقدر أتنفس» normalizes to «ماا اقدر اتنفس» and no negation matches. Either enumerate the doubled forms or change the quantifier to `{1,}` and re-run the false-positive corpus (Arabic geminates would then be at risk — hence the current choice; worth a line in §2).
4. **`SPEC-4` §7.2's ID pattern is specified post-digit-fold but not post-digit-group-collapse.** `«1054 3210 98»` escapes `(?<![0-9])[12][0-9]{9}(?![0-9])`. `collapseDigitGroups` already exists in `allergen-emergency.ts` and should run first. (The discriminator itself is sound — verified that the 920 lines, the branch landlines and Saudi mobiles all start with 9 or 0 and are correctly not matched.)
5. **`guardian_name` is both a required booking field (§7.1) and a forbidden payload key (§7.4).** Also `|insurance|` in the proposed `FORBIDDEN_KEY_RE` extension would reject a legitimate `insurance_network` routing key, and `|birth|` catches `birthday`. Over-broad in the safe direction, but say which write path the guardian fields take so the two never meet.
6. **`SPEC-2` §6.3 licenses a group-level 40-year claim.** «خبرة أكثر من 40 سنة» is permitted "*unless* `{group_established}` is loaded and the sentence is factual." The dossier's 40+ years is the **Yamamah site** (est. 1982) `[D §7 L273]`; the *group* registered in 2000 `[D §2 L54–55]`. Scope the slot to the site.
7. **«تعبت من العمر» is not in §2.9's life-object list** (`الحياة`, `الدنيا`, `كل شي`, `نفسي`, `العيشة`) — [DRIVEN] quiet. A §12-row-1 lexicon item, not a spec defect, but worth adding to the physician's review sheet.
8. **SPEC-1's demo price label breaks the persona's fourth wall.** «السعر تقريبي **للعرض التجريبي**» — SPEC-2 §8.1 #16 `machine_jargon` bans self-description as software. Neither spec resolves the collision. A patient-safe alternative that keeps the marker: «هذا سعر استرشادي، والمعتمد من الاستقبال.»
9. **Small MSA seams in otherwise good Najdi.** «على الأصح» (§6.1) reads MSA — «عشان أرتّب لك صح» is the Riyadh form. «تنقرأ» (§5.2 `insurance.class_honesty`) is a hybrid spelling; «تطلع من بطاقتك» or «الاستقبال يقراها لك من البطاقة» is what a coordinator says. «على محمل الجد» (SPEC-4 §4.2 rail C) is formal — defensible in a crisis register, but it is on §12 row 5's sign-off list and should stay there. «توجّه» in G4's no-ER line is MSA imperative; «روح لأقرب طوارئ» is native.
10. **`SPEC-4` §12's sign-off table is empty and the status line says DRAFT — NOT SHIPPABLE.** That is correct and is the single best thing in these four documents. It must not be quietly filled in by anyone other than the named signatories.

---

## What I could not verify

- **SPEC-4 §3.1's corpus** ("the first 500 real inbound messages from the group's existing WhatsApp line") and §3.4's shadow-mode gates: no such corpus exists in the repo. The false-positive budget is unmeasurable today. **[SUSPECT — unprovable, correctly deferred to §12 row 12.]**
- **SPEC-4 §10's citation** that the `allergen_symptom_detection` flag "was found to be honoured in one of nine call sites and ignored in eight." `grep -rl allergen_symptom_detection lib/ app/` returns 4 files; I did not count call sites within them, and `docs/ALLERGEN_SYMPTOM_REVIEW.md` exists but I did not read it in full. **[NOT CHECKED.]**
- **Whether 997 or the Riyadh 911 unified line is operationally correct** for this group's catchment. Both are in circulation. This is SPEC-4 §12 row 6's territory and no test resolves it. **[SUSPECT — correctly gated.]**
- **The clinical correctness of every threshold and boundary** in §1.3, §2.6 and §5.1. SPEC-4 §12 is right that no test can prove them and right to block on signatures.

## What checked out that I expected not to

Recorded because a defect list is misleading without it. All **[READ]**, all confirmed exactly as claimed:

- SPEC-3's counts: 58 files with `from("restaurants")`, 122 with `restaurant_id`, 119 migration files, 33 files in `lib/messaging`, 228 entries in `scripts/unit-suite.json`. Every per-section verdict subtotal in §4 sums correctly to 126.
- Every line count SPEC-3 quotes (14 spot-checked, 14 exact: `allergen-gate.ts` 347, `allergen-emergency.ts` 237, `allergen-gate-symptoms.ts` 398, `allergen-context.ts` 499, `safety-bridge.ts` 61, `phonetic-safety-net.ts` 331, `consent.ts` 92, `adapters/whatsapp.ts` 625, `outbound.ts` 315, `demo/config.ts` 261, `DemoPhone.tsx` 1940, `dialect.ts` 191, `db/restaurants.ts` 197, `stt/safe-vocab.ts` 231).
- `continue-on-error: true` at `core-gate.yml:112`; `agent-eval.yml`'s `paths:` filter exactly as quoted; both ESLint rules at `"warn"`.
- `Presentation`/`PresentationButton`/`PresentationRow`/`PresentationSection` at `lib/ai/tools.ts:179–194` in a 1,539-line file; `outbound.ts:25` imports the type.
- `adapters/whatsapp.ts` has **zero** occurrences of `restaurant|menu|dish|order` and imports only `../types`, `../config`, `../phone`.
- `resolveWebhookRestaurantId`'s non-production "most recently created active restaurant" fallback (`lib/db/restaurants.ts:174`) and `lib/monitoring/sweep.ts:197`'s unfiltered `from("restaurants")` — both hazards are exactly as §1.1 describes.
- `scripts/proof-phonetic-net-unwired.test.ts` walks `["app","lib","components"]` with a skip list only — **no directory allow-list** — and asserts `sources.length >= 100`. SPEC-3's and SPEC-4's shared claim that it covers `lib/health/*` from day one is **correct**.
- Every SPEC-1 citation into the repo: `demo/config.ts` L13 (`DEMO_RESTAURANT_ID`), L176–179 (the two-marker paragraph), L182–190 (`DEMO_SESSION_TTL_MS`), `order-pricing.ts` L239–249 (`computeTax` + the VAT ruling comment). All exact. Only DOC-4's characterisation of `norm()` at L99–105 is wrong (B8).
- SPEC-1 §9.3's PKG-1 arithmetic: 150/750, 300/1500, 700/3500, 1200/6000 — all exactly ×5.
- SPEC-1 §6.3's roster: 30 clinicians, 15F/15M, per-site counts 5/8/4/4/7/4 all correct, at least one female per site, and no given or family name collides with the §6.4 denylist.
- SPEC-4 §7.4's quoted `FORBIDDEN_KEY_RE` matches `lib/brain/execution/payload.ts:11` verbatim.
- `forcedAllergenSafetyResult` (`lib/ai/customer-turn.ts:335`, called at :1599) and `VOICE_SPEAKABLE_STOP_REASONS` (`lib/messaging/voice-budget.ts:237`) both exist and behave as §4.1 describes.
- 16 of the 19 boundary claims in SPEC-4 §11.2 confirmed under driving, including the three the spec calls out as counter-intuitive: `ربو` quiet on «فرع الربوة», `شفا` **fires** on «فرع الشفا», `شلل` **fires** on «شلل الأطفال». Those three findings are real and are the best work in this document.

---

## VERDICT: **BLOCKED**

Nine blockers. Five are in the red-flag rail (B1, B3, B4, B5, B9) and each has a driven failure string. Two are ownership gaps between specs that neither claimed (B2 the thread hold, B6 the ER model). One is enforcement (B7). One is a build-time safety guard that does not fire (B8).

**The single smallest change that would flip this to APPROVED — stated honestly, because pretending it is one line would be the same false precision this audit flags:**

> **Add one section, `SPEC-4 §1.5 "Hardness, hold, and failure"`, and make four line-edits to §2.**

The new section, roughly a page, closes the three *architectural* blockers at once:

1. **Hardness is absolute.** `BOOKING_FRAME_RE` vetoes SOFT only, without exception. Strike the booking clause from §2.2's `شلل` rule and replace the "booking frame" reason on every HARD near-miss in §2.4–§2.7 with the real mechanism. *(B1)*
2. **Non-revisability has a name.** A HARD hit opens `health_conversations.triage_hold` — a fork of `lib/db/safety-hold.ts`'s `SYSTEM_HOLD`, read by the booking tool at the **write**, released only by an operator, fail-closed on read error. Add to §11.8: *a booking write on a thread with an open triage hold is refused, on the turn after the rail fired.* *(B2)*
3. **A detector exception is an `emergency`, not an `urgent`.** Rail branch B, P0, no tools. *(B9)*

The four §2 line-edits are mechanical once (1) is settled: add `الصدر`/`بالصدر`/`في الصدر`/`على الصدر` to §2.1 (B4); add the verb forms and `شديد|غزير|بقوة|واجد|فوار` to §2.3 (B5); add third-person body-part possessives and `يقدر/تقدر` to §2.4 (B3); and repoint SPEC-1 §6.4 DOC-4 at `normalizeAr` (B8).

B6 (the ER model) and B7 (the gates) are one-line deletions in *other* documents — strike `branch.has_24h_er` from SPEC-2 §10 and G4, strike the two named ER sites from SPEC-1 §11 MED-2, and move SPEC-3 §2.4 steps 2–3 into SPEC-4 §12 as a launch gate — so they do not need a section of their own, but they must land in the same pass.

Wave 1 should not proceed to code until that section exists and those edits are made. Nothing else in the SHOULD-FIX list needs to block; all of it should be fixed before Wave 2 ships, and S1, S2, S17 and S11 should be fixed before anyone writes the proofs, because each of them makes a mandated proof red or vacuous at birth.
