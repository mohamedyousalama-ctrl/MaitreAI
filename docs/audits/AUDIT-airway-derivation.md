# AUDIT — airway derivation (`5906b91` + `dc6c9f9`)

**Branch:** `claude/pm-replacement-test-y8xq96` · **Module:** `lib/ai/allergen-emergency.ts`
**Proof under audit:** `scripts/proof-airway-derivation.test.ts`
**Auditor method:** every finding below is a *driven* string. The real module was imported
through `scripts/ts-ext-loader.mjs`; every result is a differential against the pre-fix module
(`git show e1791f5:lib/ai/allergen-emergency.ts`), so "NEW" means *quiet before, fires now*.

---

## 0. What reproduces

| Claim | Result |
|---|---|
| `proof-airway-derivation.test.ts` 14,696/14,696 | **reproduces** (8,353 must-fire · 6,321 must-be-quiet) |
| `proof-allergy-false-positives.test.ts` 529/529 | **reproduces** |
| Full unit suite 229/229 | **reproduces** (`node scripts/run-unit-suite.mjs` → `passed 229 failed 0`, exit 0) |
| Regex cost unchanged on adversarial 22 KB input | **reproduces** (see §6) |
| "596 of 8,353 airway strings fired before" | **reproduces** — I re-ran the new proof against `e1791f5` (see §3c) |
| "Before: 6,936 of 14,696" | **reproduces** |
| "The widening cost zero false positives" | **FALSE — see §1** |

`lib/ai/symptom-frames.ts`'s change is a pure refactor — `PERSON_WORDS` is extracted from
`FRAME_WORDS` byte-for-byte, so `FRAME_WORDS` is unchanged and the symptom detectors are
untouched.

Nothing was lost: across every corpus I drove, **0 strings that fired before are silent now.**
The widening direction of the work is real and it is good. The problem is entirely on the
quiet side.

---

## 1. FALSE POSITIVES — the change introduces six new families (**BLOCKING**)

I built my own quiet corpus the same way the proof builds its must-fire corpus — a cross
product of ordinary restaurant vocabulary, not a list of sentences somebody thought of.
**4,081 ordinary strings driven · 3,993 of them now raise a full allergy emergency · 0 of them
did before.**

Every one of these reaches `recordCriticalAlert(type: "allergy_emergency_active")`, which
writes a `system_alerts` row, sends an alert email, and **sends a real WhatsApp message to
`ALERT_WHATSAPP_TO`** (see §5).

### A. `NEG` has no left word boundary — any word ending in «ما» is a negation particle

```
const NEG = "(?:…|مهوب|موب|مش|مو|مب|ما|مني)";
const CANNOT_TAKE_BREATH = `${NEG}${NO_LONGER}${ABLE} ?(?:[ايتن]?اخذ|اسحب) ?(?:ال)?نفس`;
```

`ما` matches inside **دايما / دائما / عموما / لما / كما / بينما / طالما / عندما / مهما / حينما**,
and `(?:ال)?نفس` matches «نفس» = *the same*. The result:

| driven string | gloss | old | new |
|---|---|---|---|
| **«دايما ناخذ نفس الطلب»** | *we always order the same thing* | quiet | **FIRES** `صعوبة تنفس` |
| «كنا دايما ناخذ نفس الطلب» | *we always used to order the same thing* | quiet | **FIRES** |
| «عندما ناخذ نفس الطلب» | *when we take the same order* | quiet | **FIRES** |
| «عموما ناخذ نفس الوجبة» | *we generally take the same meal* | quiet | **FIRES** |
| «لما ياخذ نفس الطلب يزعل» | *when he gets the same order he gets upset* | quiet | **FIRES** |
| «ماخذ نفس الشي» | *I got the same thing* | quiet | **FIRES** |
| «ما عاد أقدر آخذ نفس الطلب» | *I can no longer take the same order* | quiet | **FIRES** |

Control: «احنا ناخذ نفس الطلب» (no word ending in «ما») is quiet — which isolates the
mechanism exactly. **264 of 330 driven strings in this family fire; 0 fired before.**

«دايما ناخذ نفس الطلب» is not an exotic string. It is a returning customer's most ordinary
sentence, and it now pages a human by WhatsApp.

### B. The breath noun `(?:ت)?نفس` is bare, so «نفس» = *the same* satisfies it

```
const BREATHING_DIFFICULTY = `(?:صعوبه|صعوبات|ضيق)${IN}(?:ت)?نفس`;
const IN = "(?: ?(?:في|ب|ف)? ?(?:ال)?)";
```

`IN` may match empty, a space, «في », «ب», «ف» — so the head noun and «نفس» need only be
adjacent.

| driven string | gloss | old | new |
|---|---|---|---|
| **«عندي صعوبة في نفس الطلب»** | *I have trouble with the same order* | quiet | **FIRES** |
| «عندي صعوبة بنفس الطلب» | same, Gulf «ب» | quiet | **FIRES** |
| «فيه صعوبة في نفس الوقت» | *there's a difficulty at the same time* | quiet | **FIRES** |
| «المحل ضيق نفس الفرع الثاني» | *the place is cramped, same as branch 2* | quiet | **FIRES** |
| «الشارع ضيق بنفس الطريقة» | *the street is narrow in the same way* | quiet | **FIRES** |

**140 of 140 driven strings fire; 0 fired before.**

### C. The third-person breath now fires on «نفسه ضايق» = *he is fed up* (**largest family**)

```
const BREATH_TIGHT_THIRD = `(?:${PERSON_WORDS})[^.،,؛!؟\n]{0,12}?نفس(?:ه|ها|هم) ?${BREATH_TIGHT}${NOT_THE_IDIOM}`;
const NOT_THE_IDIOM = "(?! ?من ?(?:ال)?(?:خدمه|تعامل|انتظار|تاخير|وضع|كلام|رد|سوالف|طريق|زحمه))";
```

The fix chose `PERSON_WORDS` as the anchor that keeps «الطلب نفسه واقف» quiet. But
`PERSON_WORDS` is a list of **humans**, and with a human subject «نفسه ضايق» is the idiom
*he is fed up* far more often than it is *his breath is tight*. The only thing standing
between this family and the alert path is `NOT_THE_IDIOM` — a **closed list of ten
complements**, i.e. exactly the "list of sentences" anti-pattern this whole change exists
to kill, left in place and then multiplied across a new person axis.

| driven string | gloss | old | new |
|---|---|---|---|
| **«صاحبي نفسه ضايق»** | *my friend is fed up* | quiet | **FIRES** `ضيق نفس` |
| **«أمي نفسها ضايقة من الأسعار»** | *my mum is annoyed at the prices* | quiet | **FIRES** |
| «زوجتي نفسها ضايقة اليوم» | *my wife is in a mood today* | quiet | **FIRES** |
| «أبوي نفسه واقف معنا بالمحل» | *my dad is standing with us in the shop* | quiet | **FIRES** |
| «أخوي نفسه انقطع عن الدوام» | *my brother stopped coming to work* | quiet | **FIRES** |
| «أختي نفسها مقطوعة من الشغل» | *my sister is cut off from work* | quiet | **FIRES** |
| «ابني نفسه ضايق لأن الطلب تأخر» | *my son is annoyed the order is late* | quiet | **FIRES** |

`«صاحبي نفسه ضايق من الخدمة»` **is** quiet — because «خدمه» happens to be one of the ten.
`«صاحبي نفسه ضايق من الأسعار»` is not. That is the whole guard.

**3,528 of 3,528 driven strings fire; 0 fired before.**

*In fairness:* part of this family is genuinely ambiguous — «ابني نفسه ضايق» from a parent in
an allergy conversation may well be the airway reading, and firing on it is defensible under
this file's own fail-safe policy. But «أبوي نفسه واقف معنا بالمحل», «أخوي نفسه انقطع عن الدوام»
and «صاحبي نفسه ضايق» are not ambiguous in any register, and the guard that separates them is
a ten-item complement list. That is why the fix here is a design call (see §7) rather than a
mechanical narrowing.

### D. `SWELL_BODY` × `POSS` × «كبر/كبرت» — *grew*, not *swelled*

| driven string | gloss | old | new |
|---|---|---|---|
| «عينها كبرت من الفرح» | *her eyes went wide with joy* | quiet | **FIRES** `تورم` |
| «وجهه كبر من الأكل» | *his face filled out from the food* | quiet | **FIRES** |
| «وشها كبرت» | — | quiet | **FIRES** |

**45 of 50 newly firing.** «كبرت» was first-person-only before; the possessive axis carried
it into every person without the verb list being re-examined.

### E. «حلقة» (*episode / ring*) normalizes onto «حلقه» (*his throat*)

`«الحلقة قفلت»` — quiet before, **FIRES** `انسداد الحلق` now. 5 of 20 driven. Small, but the
proof explicitly claims this homograph is handled: its quiet corpus contains «الحلقة الجديدة»
and «حلقة الفيديو», neither of which carries a closing verb, so the collision was never
actually driven.

### F. English arm — complaints about ventilation

| driven string | old | new |
|---|---|---|
| **«it was hard to breathe inside»** | quiet | **FIRES** |
| «customers complain it is hard to breathe in the hall» | quiet | **FIRES** |
| **«we had issues with breathing space in the kitchen»** | quiet | **FIRES** |
| «having trouble breathing in the smoking section» | quiet | **FIRES** |
| «I can't even breathe in there» | quiet | **FIRES** |
| «the skin looks blue on the chicken» | quiet | **FIRES** |

`(?:hard|difficult|tough) to breathe` and `(?:problems?|issues?) (?:in |with )?breathing`
carry no present-tense or person framing, and `(?:\w+ ){0,2}?` lets «can't … breathe» span
a hedge. **11 of 13 newly firing.**

---

## 2. FALSE NEGATIVES that survive

None of these is a regression — all were silent before and are silent now — but the commit
claims the airway family is now *derived* rather than *listed*, and these are values missing
from the lists on **both** sides (module and proof), which is precisely the failure mode the
derivation was supposed to end.

| driven string | gloss | status |
|---|---|---|
| **«مش قادر آخد نفسي»** | Egyptian *I can't take a breath* | **SILENT** — `CANNOT_TAKE_BREATH` lists «اخذ» (dhal) but not «اخد» (dal), which is the Egyptian spelling. The commit claims the Egyptian ما…ش circumfix as a covered axis; the Egyptian *verb* is not. |
| «ما بقدر اخد نفسي» | Levantine/Egyptian | **SILENT**, same cause |
| **«ما فيني اتنفس»** | Levantine *I can't breathe* | **SILENT** — «فيني» is the Levantine ability auxiliary; not in `ABLE` |
| **«ابني يختنق» / «مختنق» / «بيختنق» / «اختنق»** | *my son is choking / suffocating* | **SILENT** — the entire choking/suffocation family is absent in Arabic |
| **«he is choking» / «my son is suffocating»** | | **SILENT** — absent in English too |
| **«حلقي مقفل» / «حلقي مسكر» / «ابني حلقه مقفل»** | *my throat is shut* | **SILENT** — `THROAT_CLOSES` has the active participle «قافل» and «مسدود» but not the ordinary Gulf passive participles «مقفل»/«مسكر» |
| **«صدري ضايق» / «صدري مسدود» / «صدره ضايق»** | *my chest is tight* | **SILENT** — «صدر» is in no body list |
| **«عندي كتمة» / «فيني كتمة» / «كتمة نفس»** | *I have tightness* | **SILENT** — and the proof's own `namesAnAirway()` helper classifies «كتمة» as naming an airway, so the proof's vocabulary knows a word the module does not detect |
| «ما اقدر اتنفص» | س→ص typo | **SILENT** |
| `ma agdar atnafas`, `mo gader atnaffas`, `ma3ad yatnafas` | transliterated Arabic | **SILENT** — neither arm sees Arabizi at all |
| «اغمي عليه» / «فقد الوعي» / «he passed out» | loss of consciousness | **SILENT** |

Mixed-language *does* work: «my son ما يقدر يتنفس» fires (new), «ابني can't breathe» fires.

---

## 3. Is the proof honest?

### 3a. The run-time extraction: **honest.**

Driven, not argued:

* Renaming the label in `proof-allergy-false-positives.test.ts` (`» is quiet` → `» stays silent`)
  drops the extraction from **181 → 32**, and the floor assertion **FAILS**
  (`FAIL extracted 32 quiet strings … (floor 150)`, suite 14546/14547, exit 1).
* Deleting the file entirely **throws** (`ENOENT`), it does not silently pass.

So the section cannot silently become zero assertions. Two caveats, both minor:

* The floor is 150 against an actual 181 — a partial rename costing ≤31 strings passes silently.
* The `[^\]]*?` body restriction drops **12** quiet strings a greedy parse finds (181 vs 193).
  All 54 blocks match either way, so the comment's stated failure mode (running past the block)
  does not occur; the cost is 12 dropped strings, not corrupted ones.

### 3b. Is the must-fire corpus tautological? **No — but it is not independent either.**

The corpus is **not** generated from the module's regexes. The module exports no axis; the
proof re-declares `NEG`, `NO_LONGER`, `ABLE`, `BREATHE`, `PERSON`, `PREP`, `POSS` as its own
literal arrays, **in the spelling a person types** (`أقدر`, `قادرة`, `زرقة`) rather than the
normalized spelling the module matches — so it genuinely proves the normalizer and the pattern
agree, which is the exact bug that killed «قادرة» in the previous fix. And it is sensitive:
two independent relaxations of the module fail it (§4). It is a real proof, not a mirror.

**But it is a restatement, not an independent source.** The axis *values* are the same author's
list, so the proof can only certify that the cross product is closed over values somebody
already thought of. It provably cannot find a value missing from both lists — and §2 shows six
such values in the very family it certifies at 8,353/8,353 («اخد», «فيني», «مقفل», «مسكر»,
«يختنق», «صدري»). The claim it earns is *"the slots are filled consistently"*, which is a real
and worthwhile claim. The claim it does not earn is *"the airway family is complete."*

### 3c. **Not one of the 6,321 must-be-quiet assertions constrains this change.**

I re-ran the *new* proof against the *old* module (`scripts/proof-old.test.ts`, identical file,
import repointed at `e1791f5`'s version):

```
FAIL airway-derivation: 6936/14696 passed
   corpus totals: 8353 derived must-fire · 6321 must-be-quiet
   … must-fire sections:  596 of 8,353 fire
   … must-be-quiet:  181 quiet · 19 quiet · 6048 quiet · 63 quiet · 7 quiet · 3 quiet
```

This independently confirms both headline numbers in the commit message — **596/8,353** before,
and **6,936/14,696** overall. The diagnosis is real and the arithmetic is honest.

It also shows something the commit does not: **all 6,321 must-be-quiet assertions were already
green before a line of this change was written.** Every one of them passes on the old module and
passes on the new one. They are therefore incapable of having constrained this widening — they
can only catch a *future* regression. The sentence *"The widening cost zero false positives"* is
supported by a corpus that would have read "zero" no matter what the widening did, because it
contains nothing the widening touches. §1 is what happens when you build the quiet corpus after
the change instead of before it.

### 3d. The far more serious structural problem: **the proof enshrines false positives as must-fire.**

The must-fire cross products contain strings from §1 verbatim. Regenerated from the proof's
own source:

```
person+نفسه×tight : 162 must-fire assertions
   «ابني نفسه ضايق»   is a MUST-FIRE assertion in the proof: true
   «الطفل نفسه واقف»  is a MUST-FIRE assertion in the proof: true
swell×poss        : 450 must-fire assertions
   «عينه كبرت»        is a MUST-FIRE assertion in the proof: true
   «وجهه كبرت»        is a MUST-FIRE assertion in the proof: true
```

So the proof does not merely fail to catch families **C** and **D** (§3c explains why it could
not have caught any of them) — it **requires** them.
Narrowing the module to fix them turns the proof red. A proof that mandates the false positive
is worse than one that misses it, because it converts a bug into a specification.

This is the answer to "is the proof honest": the *machinery* is honest, and the *corpus* is
one author's judgement stamped as 14,696 assertions. The quiet side is asserted against a
6,321-string corpus that the same author wrote; my 4,081-string corpus, built by the same
method against the same module, finds 3,993 firings.

---

## 4. The two deliberate non-widenings — **both correct, both load-bearing**

Driven, by mutating the module in a sandbox copy and re-running the proof:

| mutation | result |
|---|---|
| **M1** — relax «شفة» to every person (`\|شفتي)` → `\|شفت${POSS})`) | **FAIL 14694/14696** — «الخبز شفته ينتفخ» and «العجين شفته تورم» fire |
| **M2** — drop the person anchor (`(?:${PERSON_WORDS})[^…]{0,12}?` → `(?:)[^…]{0,12}?`) | **FAIL 14694/14696** — «الطلب نفسه واقف» and «الحساب نفسه مسدود» fire |

Both calls are right and both are genuinely defended. This is the strongest part of the work.

The irony worth recording: the anchor chosen in M2 to exclude the *object* reading of «نفسه»
is what admits the *human idiom* reading (§1C). The guard is correct; the thing it guards is
half the problem.

---

## 5. Blast radius — 19 call sites

Every `fired: true` fans out as follows. Verified by reading, not inferred:

* **`lib/ai/customer-turn.ts:1226`** → `safetyEmergencyHit`, computed on **every posture**
  (ungated by any feature flag). At `:1544` it takes the `WO-EMERGENCY-OVERRIDE` branch:
  `companionEmergencyResult` (`:492`) emits a `notify_without_hold` signal, and at `:2135`
  the loop calls `recordCriticalAlert(type: "allergy_emergency_active")` — which, per the
  comment there, "writes a `system_alerts` row, calls `sendAlertEmail`, and calls
  `sendAlertWhatsApp` — which sends a real WhatsApp message to `ALERT_WHATSAPP_TO`, the
  Founder's own phone." The branch also writes a conversation allergy note
  (`writeConversationAllergyNote`, `customer_turn.emergency_override_ticket_note`) — so a
  false positive **puts an allergy note on a kitchen ticket that has no allergy.**
* **`lib/messaging/respond-and-send.ts:374`** → calm-hold path; `emergency = emergencyHit.fired
  || symptomHit.fired` sends `emergencyReply(dialect)` and inserts an
  `allergy_calm_hold_emergency` message row.
* **`lib/messaging/respond-and-send.ts:1808`** → reply dampener. An emergency hit is
  `safetyOrHuman`, which **bypasses the dampener**, so a false positive costs an extra Brain
  turn (LLM spend) on a fragment that would have been silenced.
* **`lib/ai/safety-bridge.ts:48`** → `isSafetyClassInbound` → safety ACK + **loud re-alert to a
  human operator** while the thread is `HUMAN_ACTIVE`.
* **`lib/ai/stt/safe-vocab.ts:103`** → `tripsASafetyHold(name)` runs the detector on **menu item
  names**, and a tripping name is withheld from the STT vocabulary. I drove realistic Saudi menu
  names («حلقات بصل», «حلقة بصل», «لسان عصفور», «وجه القمر», «كبدة اسكندراني», «مندي لحم»,
  «شوربة عدس», «برياني دجاج»): **none newly trips.** This surface is clean.
* **Voice budget / spend:** firing *reduces* LLM spend on the emergency path —
  `perceptionShouldRun` (`:1237`) is false when a calm emergency fires, and
  `companionEmergencyResult` returns `calls_used: 0`, `usage` all zero, `adapter: "mock"`.
  No new spend, no rate-limit pressure. But `customer-turn.ts:1513` uses `safetyEmergencyHit`
  to disable `voiceGuardOn`, so a false positive on a garbled voice note suppresses the
  "please retype" ladder and acts on the garble instead.

**Net:** the cost of a false positive here is not a wasted token. It is an emergency line
sent to a calm customer, a fabricated allergy note on a kitchen ticket, and a WhatsApp
message to a real human phone at any hour.

---

## 6. Performance — **claim verified, no regression, pre-existing O(n²) confirmed**

Driven, old vs new, 5 iterations each:

| input | OLD | NEW |
|---|---|---|
| ordinary 52-char message | 0.23 ms | 0.45 ms |
| 22 KB `«ماقدر »` × 3700 | 538.8 ms | 534.5 ms |
| 22 KB `«ما عاد اقدر »` × 1900 | 563.3 ms | 564.3 ms |
| 22 KB `«صعوبه في ال»` × 2000 | 533.5 ms | 520.7 ms |
| 22 KB `«ابني نفسنفسنفس »` | 499.0 ms | 510.2 ms |
| 22 KB English `«can't a a »` | 1.16 ms | 0.77 ms |
| 22 KB `«lips is is is …»` | 0.62 ms | 0.61 ms |

Scaling (`«ما عاد اقدر »` repeated): 1 KB 2.1 ms · 2 KB 4.9 · 4 KB 18.5 · 8 KB 72.8 ·
16 KB 281.6 · 32 KB 1117.8 — **quadratic, and identical in the old module (32 KB: OLD
1128.5 ms vs NEW 1117.8 ms).**

Isolating the cause on a 16.8 KB single-clause input:

```
ACTIVE-REACTION soft (shared)        0.0 ms
HOSPITAL soft (shared)               0.0 ms
SERVICE_NEAR_NUMBER (shared)         0.0 ms
NEW airway alternation               0.1 ms     ← the new composed regex
PAST_RE (shared)                     0.0 ms
HYPOTHETICAL_Q_RE (shared)         311.7 ms     ← the whole cost
```

The quadratic term is `HYPOTHETICAL_Q_RE`:
`/(?:ممكن|…) .*تحسس.*\؟|.*تحسس.*(?:ممكن|احتمال).*\؟/` — a leading `.*` with a required
trailing `؟` re-scans from every start position. It is **byte-identical in the pre-fix
module** (`e1791f5:lib/ai/allergen-emergency.ts:41` = `HEAD:44`), so the agent's claim that the
O(n²) scan is pre-existing is **correct**. The new axis composition adds nothing measurable
(0.1 ms on 16 KB) and the English `(?:are |is |look |…)*` star is linear (20 KB: 0.50 ms).

Not a blocker for this change. It **is** a live DoS surface on a public webhook and should be
its own work item: anchoring the second alternative or requiring `؟` before scanning would
make it linear.

---

## 7. VERDICT

# BLOCKED

The widening is real, well-diagnosed, loses nothing, adds no ReDoS, and its two deliberate
non-widenings are correct and provably load-bearing. But the commit's central safety claim —
*"The widening cost zero false positives"* — does not survive being driven against a corpus
the fix's own author did not write. **3,993 ordinary Saudi restaurant strings that were quiet
before now raise a full allergy emergency**, and on this code path an emergency means a
WhatsApp message to a real human phone and a fabricated allergy note on a kitchen ticket.

This repo spent a whole prior work item killing a safety net that fired on ordinary
conversation. Merging this re-opens that class at roughly seven times the previous scale, and
the proof would then *forbid* fixing two of the six families.

### The smallest change that flips this to APPROVED

**Two edits to `lib/ai/allergen-emergency.ts`, both verified in a sandbox copy — they kill
families A and B outright, keep every originally-reported defect firing, and leave the proof
green at 14,696/14,696:**

```diff
-const NEG =
-  "(?:ماقدرش|…|ما|مني)";
+const NEG = "(?<![ء-ي])" +
+  "(?:ماقدرش|…|ما|مني)";

-const CANNOT_TAKE_BREATH = `${NEG}${NO_LONGER}${ABLE} ?(?:[ايتن]?اخذ|اسحب) ?(?:ال)?نفس`;
+const CANNOT_TAKE_BREATH = `${NEG}${NO_LONGER}${ABLE} ?(?:[ايتن]?اخذ|اسحب) ?(?:ال)?نفس(?! ?ال[ء-ي])`;

-const BREATHING_DIFFICULTY = `(?:صعوبه|صعوبات|ضيق)${IN}(?:ت)?نفس`;
+const BREATHING_DIFFICULTY = `(?:صعوبه|صعوبات|ضيق)${IN}(?:ت)?نفس(?! ?ال[ء-ي])`;
```

`(?<![ء-ي])` is this repo's established word-boundary idiom — `lib/ai/allergen-gate.ts`'s
`termRegex()` already uses exactly it for the same purpose («لبن» must not match inside
«ا‌لبن‌دق»). The airway family was the one place it was omitted.

Driven with both applied:

```
FIRE  «ما عاد يتنفس»          FIRE  «عندي صعوبة بالتنفس»     FIRE  «ابني ما يقدر يتنفس»
FIRE  «ما عاد يقدر يتنفس»     FIRE  «عندي صعوبة في التنفس»   FIRE  «مو قادر أتنفس»
FIRE  «ما أقدر آخذ نفس»       FIRE  «ضيق نفس»

quiet «دايما ناخذ نفس الطلب»       quiet «عندي صعوبة في نفس الطلب»
quiet «كنا دايما ناخذ نفس الطلب»   quiet «عندي صعوبة بنفس الطلب»
quiet «ماخذ نفس الطلب»             quiet «المحل ضيق نفس الفرع الثاني»
quiet «ما اخذ نفس الطلب»           quiet «ما عاد اقدر اخذ نفس الطلب»

PASS airway-derivation: 14696/14696 passed
```

**And one decision that cannot be made by an auditor, because the proof currently forbids it:**
families **C** (3,528 strings) and **D** (45) are *must-fire assertions* in
`proof-airway-derivation.test.ts`. Fixing them requires changing the proof as well as the
module — either drop «ضايق/ضايقه/ضاق/ضاقت/واقف/واقفه» from the third-person branch and «كبر/كبرت»
from the third-person swelling (and remove the corresponding cross-product rows), or replace
the closed `NOT_THE_IDIOM` complement list with a general guard. That is a design call for the
author, not a patch an auditor should pick; it is what keeps this **BLOCKED** rather than
"approved with a two-line fix."

Families **E** (5) and **F** (11) are small and can ship as follow-ups.

---

### Recommended follow-up work items (not blocking)

1. Add the §2 missing values to the axes: «اخد», «فيني», «مقفل»/«مسكر», «صدر», the
   choking family («يختنق»/«مختنق»/«اختنق»/«choking»/«suffocating»), «كتمة».
2. Make `HYPOTHETICAL_Q_RE` linear (§6) — public-webhook DoS surface, pre-existing.
3. Raise the extraction floor in the proof from 150 to `>= 175`, and widen `[^\]]` to recover
   the 12 dropped quiet strings (§3a).
