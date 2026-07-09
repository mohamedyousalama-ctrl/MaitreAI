# WO-PHONETIC-NET-TYPED-SCOPE — DRAFT (HELD for PM review; do NOT build until #396 merges)

★★ HIGH-CAUTION. Touches the fail-closed phonetic safety net (`lib/ai/phonetic-safety-net.ts`),
which runs UNCONDITIONALLY and is never flag-gated (child safety must not depend on a flag
row — WO-SAFE-2 / WO-VOICE-1). A regression that DROPS a real **voice** allergy disclosure is
dangerous. The net stays fail-safe throughout: when in doubt, it still escalates.

**Build sequencing:** one safety-path change lands at a time. Do NOT start building until
PR #396 (WO-ALLERGEN-BOUNDARY) is merged. Merge here needs PM + Mohamed dual sign-off, same
as #396.

---

## Provenance (WO-ALLERGEN-BOUNDARY / #396 PART 2)
The two MIZAN over-triggers were misattributed to the base gate. Verified culprit: the
Levenshtein near-matcher in the phonetic net. Both seeded replies (`active-packet-data.ts`
S1-03/S10-02) are byte-identical to `forcedAllergenSafetyResult`'s Saudi template with
`${t}` = «البان»/«سوداني».

| Capture (TYPED) | Token | Nearest term | Dist | Budget |
|---|---|---|---|---|
| «هلا، إيش عندكم أطباق اليوم؟» | «اطباق» (5) | «البان» (5) | **2** | maxDist(5)=2 |
| «خلص طلبي، شي ثاني؟» | «ثاني» (4) | «سوداني» (6) | **2** | maxDist(6)=2 |

## Root cause
The NEAR path (`reason:"phonetic_near"`) exists to recover garbled **STT transcripts**
(recall ~0.69). It "runs UNCONDITIONALLY on every message (typed or transcribed)." Applied
to TYPED text it has no justification — a typed word is not a garble — and the budget keys
on the **lexicon term's** length, so short common words fall in range.

## Goal
- **Transcribed/voice turns:** full length-keyed near budget (today's behaviour) — UNCHANGED.
- **Typed turns:** exact + boundary + phrase + English/Franco + harm-verb+allergen paths all
  retained; the NEAR path is TIGHTENED (see below) and the low-confidence tripwire is inert
  (already, since typed carries no confidence).

## ⚠️ Evidence 1 — maxDist-1-for-typed is NECESSARY BUT NOT SUFFICIENT
The approved refinement (typed near at maxDist 1) kills the two MIZAN cases (dist 2) but a
LARGE class of **dist-1** typed false positives survives — and these fire on the
unconditional net **TODAY**:

| Typed message | Fires today | Term | Dist |
|---|---|---|---|
| «عايز الحساب لو سمحت» (I want the **bill**) | ✅ FP | حساس | 1 |
| «عندي احساس حلو» (I have a nice **feeling**) | ✅ FP | حساس | 1 |
| «ممكن موز مع الطلب» (**banana** please) | ✅ FP | لوز | 1 |
| «يا قمر عليك» (you're **gorgeous**) | ✅ FP | قمح | 1 |
| «احنا رايحين البيت» (going **home**) | ✅ FP | البان | 2 |

«عايز الحساب» — every customer asking for the bill — is a catastrophic false handoff that
maxDist-1-typed does NOT fix (it is dist 1).

## ⚠️ Evidence 2 — dist-1 typed FPs cluster on SHORT lexicon terms
A dist-1 scan of common typed words (22 collisions found) — **every one** collides with a
lexicon term of length **3–4**:

`موز→لوز, بيت→بيض, قمر→قمح, ابن→لبن, لبس→لبن, سمح→قمح, سمع→سمك, فوز/روز/لون/لوح→لوز,`
`بير/بيع/بيضه→بيض, سمكه→سمك, توم→تورم, احساس/حسام/حساب→حساس, كاجول→كاجو`

Terms hit: لوز(3) بيض(3) قمح(3) لبن(3) سمك(3) كاجو(4) حساس(4) تورم(4). **Zero** FPs on
terms of length ≥ 5.

## ⚠️ Evidence 3 — real typed typos cluster on LONG terms
The mobile-keyboard typos we must NOT lose collide with LONG terms (≥5), or are exact:
`سودني→سوداني(6), مكسرت→مكسرات(6), جلوتن→جلوتين(6), لكتوز→لاكتوز(6), جمبر→جمبري(5)`;
exact: حساسيه, فستق, حساس, مكسرات, سوداني.

## FINAL APPROVED rule (PM-ratified 2026-07-10)
**Transcribed/voice turns:** full length-keyed near budget + low-confidence tripwire — UNCHANGED.

**Typed turns:** NEAR fires when
```
(matchedTerm.length >= 5 AND dist <= 1)
  OR (matchedTerm.length < 5 AND dist <= 1 AND turn matches the base gate's allergy-INTENT patterns)
```
where "allergy-INTENT patterns" = the base gate's `EXPLICIT_ALLERGY_RE` OR `AVOIDANCE_INTENT_RE`
(imported/shared, not re-authored). dist >= 2 never fires typed. Exact hits (dist 0) unchanged
(markers/symptoms fire; a bare exact allergen noun still needs context/garble as today).

**Rationale for the intent-exception (PM):** a typo'd SHORT allergen INSIDE a real disclosure
(«بتعبني البيظ», «ما اتحمل الحلوب») must still fire; a bill request («عايز الحساب») has no
allergy intent and stays clean. It closes the pure-length-gate's one documented cost.

### Empirical validation (zero mismatches — this is the ratified rule)
- **CLEAN (no intent):** «عايز الحساب», «عندي احساس حلو», «ممكن موز», «يا قمر عليك»,
  «احنا رايحين البيت», «عايز البيظ», «ممكن الحلوب», «عايز الموز», both MIZAN strings, «عايز اطلب بيتزا».
- **FIRES via exact / long-near:** «سودني»→سوداني, «مكسرت», «جلوتن», «لكتوز», «جمبر», «عندي حساسية».
- **FIRES via short+intent exception:** «بتعبني البيظ»→بيض, «ما اتحمل الحلوب»→حليب, «مينفعش اكل الموز ده»→لوز.
- **Documented accepted fail-safe FP:** «تعبان من الحساب» (intent «تعب» + حساب≈حساس d1) → FIRES.
  Acceptable per PM — allergy-intent language + a near-allergen token escalates by design; requires
  BOTH an intent word AND a near-allergen typo, so it is rare and safe (over-escalate, never miss).

**Residual accepted loss:** a dist-1 typo of a SHORT allergen on a TYPED turn with NO intent
language (e.g. bare «الحلوب» alone) won't trip NEAR — the exact spelling is still caught by the
exact single-term hit + base gate + symptom module; short-term dist-1 is inherently low-precision
(حليب↔حبيب/حليم, بيض↔بيت). This is the deliberate trade that removes «عايز الحساب» & co.

## Scoping mechanism (Option A plumbing)
The only voice/typed signal today is `input.sttConfidence` (undefined for typed). BUT
`proof-voice-safety-net.test.ts` calls `detectPhoneticSafetyNet(it.spoken)` with NO
confidence — so gating on `sttConfidence != null` would silently disable near-matching for
those 31 voice cases and lose true positives. Therefore:
- Add `isTranscribed?: boolean` to `PhoneticNetOptions` (or a first-class
  `input.isVoiceTranscript` threaded from the voice ingestion path — preferred over inferring
  origin from a confidence number).
- `detectPhoneticSafetyNet`: run exact/boundary/phrase/English-Franco/harm-verb for all turns;
  gate the NEAR branch by
  `isTranscribed ? (dist ≤ budgetFor(term)) : (dist ≤ 1 && (term.length ≥ 5 || intentPresent(n)))`,
  and the low-confidence tripwire by isTranscribed. `intentPresent(n)` = base gate's
  `EXPLICIT_ALLERGY_RE.test(n) || AVOIDANCE_INTENT_RE.test(n)` (export & import them — do NOT copy).
- `customer-turn.ts:364`: pass `isTranscribed`.
- `proof-voice-safety-net.test.ts` / eval harness: call the net with `isTranscribed:true` for
  spoken items so the 31 voice cases stay byte-identical.

## Proof obligations (= #396 standard)
1. RED-first: «هلا، إيش عندكم أطباق اليوم؟» and «خلص طلبي، شي ثاني؟» as TYPED turns fire today →
   clean after; add as failing-first tests. Add «عايز الحساب»/«موز»/«قمر»/«احساس»/«البيت» as typed
   FPs too (all fire today; must be clean after). Add the intent-exception TRUE-positives that MUST
   still fire on typed: «بتعبني البيظ», «ما اتحمل الحلوب», «مينفعش اكل الموز ده»; and the same short
   near-words WITHOUT intent that MUST stay clean: «عايز البيظ», «عايز الموز».
2. ZERO loss on voice: `proof-voice-safety-net` — all 31 cases byte-identical (run independently,
   before/after). Any drop → STOP and report.
3. Adversarial TRUE-positives: (a) TRANSCRIBED garbles still trip the near path (voice unchanged);
   (b) TYPED typo disclosures of LONG terms — «سودني»/«مكسرت»/«جلوتن»/«لكتوز»/«جمبر» — still fire.
4. Adversarial FALSE-positives: innocent typed words embedding near-allergens stay clean
   (the 22-word set above + the full sentences).
5. Fail-safe preserved: exact allergy/marker/symptom/phrase/English-Franco hits still fire on
   typed; when in doubt, still escalate.
6. Full `test:unit` + `tsc`/`build` + `lint`.

## Diff surface
`phonetic-safety-net.ts` + `customer-turn.ts` (+ voice ingestion for the flag) + the two
proof/eval files. Nothing else. No prompt/persona/base-gate/flag changes.

## Delivery
Non-draft PR + DO-NOT-MERGE banner. Unconditional safety path → ships to Wesaya on merge:
PM verification AND Mohamed's out-loud sign-off both required before merge.
