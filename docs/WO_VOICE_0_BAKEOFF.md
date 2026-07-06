# WO-VOICE-0 — Khalid's Voice (bake-off + eval set)

**Scope: V1 = WhatsApp voice notes (STT in, TTS out). Phone calls are V2.**
Owner: Khalid persona window · Flag: **`voice_notes` — reserved, default OFF** · No production code in this WO.
Companion machine-readable eval set (the CI seed for WO-VOICE-1/2): **`scripts/voice/khalid-voice-eval-set.json`**.

---

## 0. Honest status (what this doc decides vs. what needs a keyed run)

This deliverable is the **bake-off design + frozen eval sets + fail-closed threshold + cost model + a
capability-grounded recommendation.** Two things it deliberately does **not** contain, because they
cannot be produced truthfully in this environment (no TTS/STT API keys, and audio judgement needs a
human ear):

- **TTS naturalness / warmth / dialect scores** — require *generating* the 10 samples and *hearing*
  them. That is Mohamed's ear on a keyed generation pass. This doc gives the exact scripts, rubric,
  vendor shortlist, and run steps so that pass is turnkey; I state a **preliminary, reasoned lean**,
  not invented numbers.
- **STT accuracy numbers** — require *transcribing* real Saudi recordings. This doc gives the 20-item
  eval set (with safety annotations), the scoring method, and the fail-closed net; the numbers come
  from running the existing STT adapters against real recordings once keys are provisioned.

Everything that can be decided from documented capability, cost, and safety logic **is** decided here.

---

## 1. TTS bake-off — Khalid speaking (Najdi)

### 1.1 Candidates (shortlist for the ear test)

| Vendor / model | Arabic / dialect | Steerable? | Latency | Est. cost / reply* | Notes |
|---|---|---|---|---|---|
| **OpenAI `gpt-4o-mini-tts`** | pan-Arabic, no explicit Najdi | **Yes** — instruction-steered ("warm Najdi Saudi male host, unhurried") | low | ~**$0.003** | Cheapest steerable; MSA-leaning accent, but promptable warmth/pace. |
| OpenAI `tts-1` / `tts-1-hd` | pan-Arabic | fixed voices | low | ~$0.003 / ~$0.006 | Fixed voices; less control than 4o-mini-tts. |
| **ElevenLabs Multilingual v2** | very natural pan-Arabic; **voice-cloning** available | via voice choice / settings | med | ~**$0.03–0.05** | Best raw naturalness; a **Najdi voice clone** (consenting speaker) is the path to true dialect authenticity. ~10× the cheap path. |
| ElevenLabs Flash v2.5 | as above, faster/cheaper | as above | low | ~$0.015–0.025 | Lower latency/cost tier of the above. |
| **Azure Neural `ar-SA` (HamedNeural ♂ / ZariyahNeural ♀)** | **native ar-SA** voices | SSML prosody | low | ~**$0.003** | Only shortlist option with *named Saudi* voices out of the box; MSA register, not colloquial Najdi. Cheap baseline. |

\* Assumes an average Khalid reply ≈ **200 characters**. All prices are **~2026 published-rate estimates — confirm on the vendor dashboard at contract time.**

### 1.2 Rubric (in the eval set)

Score the **generated audio** 1–5 on: **naturalness (0.30) · dialect authenticity (0.30) · warmth/karam (0.25) · pace (0.15)**.
**Gate:** a voice must score **≥3 on dialect_authenticity AND ≥3 on pace on the allergy script (TTS-05)** — safety
read-outs must be clear and unrushed — or it is disqualified regardless of average.

The 10 Najdi scripts (`tts.scripts` in the JSON) cover: greeting/karam, signature recommendation,
dates↔gahwa pairing, upsell-once, **allergy acknowledgement (safety read-out)**, acknowledge-then-pivot,
**order recap with spelled-out numbers/total (pace test)**, closed-hours apology, complaint de-escalation,
Ramadan warmth.

### 1.3 How to run (keyed pass)

For each shortlisted voice, synthesize all 10 scripts → label files `TTS-<id>_<vendor>.mp3` → blind-shuffle →
Mohamed scores each on the 4 dimensions → weighted totals + the TTS-05 gate decide. Deliver the sample set +
the filled scoresheet back here for the final recommendation lock.

### 1.4 Preliminary recommendation (pending the ear test)

- **Default: OpenAI `gpt-4o-mini-tts`** — cheapest, steerable ("warm Najdi Saudi host, unhurried, host-like"),
  good multilingual prosody. Best cost/effort for V1 launch.
- **Premium/authenticity: ElevenLabs** — if Mohamed's ear judges the MSA-leaning accent of the cheap options
  breaks the karam illusion, escalate to ElevenLabs, and specifically to a **Najdi voice clone** (V1.5) for true
  dialect. Budget for ~10× the per-message TTS cost.
- **Cheap native baseline: Azure `ar-SA` HamedNeural** — the only out-of-the-box *Saudi-named* male voice; keep
  as the fallback if steered OpenAI underperforms on "sounds Saudi."
- **Reality flag:** none of the off-the-shelf engines speak true **Najdi**; they speak MSA/pan-Arabic. Fully
  authentic Najdi is a **voice-clone** decision. Recommend launching V1 on the best-steered off-the-shelf voice
  and treating the Najdi clone as a fast-follow if the ear test demands it.

---

## 2. STT bake-off — hearing the customer (Saudi voice notes)

### 2.1 Candidates (build on what exists)

The repo already has an **STT adapter seam** (`lib/ai/stt/`): OpenAI + Groq Whisper + a safe **mock default**,
env-selected, with real per-minute rates in `lib/ai/stt/pricing.ts`. The bake-off extends it, it does not rebuild it.

| Adapter / model | In repo? | Est. cost / 15s note* | Notes |
|---|---|---|---|
| **OpenAI `gpt-4o-transcribe`** | yes | ~$0.0015 | Best-accuracy Whisper-family; likely top safety-recall. |
| OpenAI `whisper-1` | yes | ~$0.0015 | Baseline Whisper. |
| OpenAI `gpt-4o-mini-transcribe` | yes | ~$0.00075 | Cheaper, slightly lower accuracy. |
| **Groq `whisper-large-v3`** | yes | ~$0.00046 | Cheap, fast; same model weights as OpenAI large-v3. |
| Groq `whisper-large-v3-turbo` | yes | ~**$0.00017** | Cheapest; verify safety-recall isn't sacrificed. |
| ElevenLabs Scribe | no adapter | ~$0.0017 | Would need a new adapter; only add if it wins safety-recall. |

\* Assumes an average Saudi WhatsApp voice note ≈ **15 seconds**. Rates from `lib/ai/stt/pricing.ts` (already in the repo) + published estimates.

### 2.2 Scoring — safety-term recall is the gate, not WER

The 20-item eval set (`stt.items`) includes **every safety phrasing class from the dialect review**
(`docs/KSA_ALLERGEN_DIALECT_REVIEW.md`): explicit «حساسية», the KSA gaps («حساس/ة»، «أتحسس»، «ألرجيا»،
«مو قادر آكل»، «ما يصير آكل»، «تأذيني»، «ما أتحمل اللاكتوز»), symptoms (ينتفخ/طفح/كتمة/ضيق نفس), plus
**noise cases** (restaurant babble, traffic + fast speech, child pitch), a **code-switch** («I have allergy من الفستق»),
a **phonetic trap that must flag** («حساسة»), a **benign near-homophone** («الحلا حسّاس للحرارة» — over-flag tolerated),
and **2 clean controls** that must NOT flag.

- **Primary metric = `safety_term_recall`** — of the 18 safety utterances, the fraction where the deterministic
  gate fires on the transcript **or** the fail-closed net catches it. **Target = 1.00.** A silent miss (allergy
  said, nothing fires) is **CRITICAL**, weighted 10× an ordinary word error.
- **Secondary = overall WER** (informational) and **false-positive rate** on the 2 controls + the benign trap
  (a UX cost, not a safety failure).
- **Pick the cheapest engine that hits safety_term_recall = 1.00 with the fail-closed net**, not the lowest WER.

### 2.3 Preliminary recommendation (pending the transcription pass)

- **Benchmark `gpt-4o-transcribe` (accuracy) vs `whisper-large-v3` / `-turbo` (cost) on the safety set; pick by
  safety-recall.** Whisper's Arabic is **MSA-biased and weak on Najdi colloquial + fast/noisy speech**, so expect
  misses on the gap forms and noise cases — which is exactly why the fail-closed net below is **mandatory**
  regardless of engine.
- Keep the **mock default** (no spend) until Mohamed approves a paid key + engine, mirroring the existing
  STT-adapter and payments patterns.

---

## 3. Fail-closed safety-positive rule (the safety artifact)

Voice's dangerous failure is **under-transcribing an allergy**. The rule (full spec in
`stt.failClosedThreshold` of the JSON):

1. **Text path (unchanged gate):** the transcript feeds the existing deterministic allergen gate. A lexicon
   term in the transcript → normal safety-positive. Voice adds no new "safe" path.
2. **Fail-closed net (new):** treat as a safety-positive (acknowledge + verify/escalate) if **either**
   - a segment's confidence `< SAFETY_STT_CONFIDENCE_FLOOR (0.66)` **and** it is **phonetically near** a safety
     lexicon term (Arabic-normalized Levenshtein ≤ 2 — normalize ق↔g, ظ↔ز↔ذ, ث/ص↔س, ة↔ه, ى↔ي, hamza↔ا, doubled
     letters), **or**
   - a low-confidence segment co-occurs with a confidently-heard **allergen noun** (an allergy statement may have
     been garbled *around* the noun).
3. **Whole-utterance uncertainty + food context** → ask the customer to re-send as text / confirm; **never
   fabricate an order or an "allergen-safe" claim from a low-confidence voice note** (extends the existing
   mock-STT honesty rule). Over-escalation is acceptable; under-escalation is not.

**Required WO-VOICE-1 extension:** `SttResult` (`lib/ai/stt/types.ts`) currently exposes **no confidence**. WO-VOICE-1
must add `confidence` + per-segment `avgLogprob`/`noSpeechProb` (Whisper `verbose_json` provides both) so this
threshold has a signal to read. The phonetic-near set is seeded in the JSON (`phoneticNearExamples`).

---

## 4. Cost per message (estimates — confirm at contract)

| Path | STT (voice in, ~15s) | TTS (voice out, ~200 chars) | **Per exchange** |
|---|---|---|---|
| **Cheapest** | Groq large-v3-turbo ~$0.00017 | OpenAI `gpt-4o-mini-tts` ~$0.003 | **~$0.0032** |
| Balanced | OpenAI `gpt-4o-transcribe` ~$0.0015 | Azure `ar-SA` Hamed ~$0.003 | ~$0.0045 |
| **Premium (ElevenLabs voice)** | Groq large-v3 ~$0.00046 | ElevenLabs Multilingual v2 ~$0.03–0.05 | **~$0.03–0.05** |

**Headline:** STT is nearly free (~$0.0002–0.0015); **TTS dominates**, and ElevenLabs is ~**10×** the OpenAI/Azure
path. The cost decision is essentially a **TTS-voice decision**. At even 50k voice exchanges/month: cheap path
≈ $160/mo; ElevenLabs path ≈ $1.5–2.5k/mo.

---

## 5. Chosen vendors (recommendation) + open decisions for Mohamed

**Recommendation to lock after the ear test:**
- **STT:** OpenAI `gpt-4o-transcribe` **or** Groq `whisper-large-v3` — whichever hits `safety_term_recall = 1.00`
  cheapest — **with the fail-closed net always on**. (Lean: Groq large-v3 for cost if recall holds.)
- **TTS:** **OpenAI `gpt-4o-mini-tts`** steered as the V1 default; **ElevenLabs (Najdi clone)** as the
  authenticity upgrade if the ear test rejects the steered accent.

**Decisions that need Mohamed:**
1. **TTS quality vs cost** — steered OpenAI/Azure (~$0.003) vs ElevenLabs (~$0.03–0.05, ~10×). Same karam bar?
2. **The ear test** — synthesize the 10 scripts on the shortlist; Mohamed scores TTS-05 (safety) + overall.
3. **Najdi voice clone (V1.5?)** — invest in a consenting Najdi speaker + ElevenLabs clone for true dialect, or
   launch V1 on the best steered off-the-shelf voice?
4. **STT paid key** — approve a paid STT key to run the transcription pass (env flip; mock stays default until then).

---

## 6. Handoff to WO-VOICE-1 / WO-VOICE-2

- **The eval set is frozen** (`scripts/voice/khalid-voice-eval-set.json`) and **becomes the CI suite**:
  - WO-VOICE-1 (STT wiring): a harness reads `stt.items`, transcribes each recording with the chosen adapter,
    asserts `safety_term_recall = 1.00` (gate + fail-closed), and reports WER + false-positive rate. This becomes a
    blocking `agent-eval` gate — the voice equivalent of the allergen hard-test.
  - WO-VOICE-2 (TTS wiring): the `tts.scripts` + rubric are the regression/QA set for the chosen voice.
- **`SttResult` confidence extension** (§3) is a WO-VOICE-1 prerequisite for the fail-closed rule.
- **Flag `voice_notes`** is **reserved, default OFF** (document only — no code here), gated per tenant like
  `khalid_persona` via `feature_flags`. Voice never activates until the flag is on AND a paid STT/TTS key is
  provisioned AND the safety-recall CI gate is green.
- **No production code ships in WO-VOICE-0.** The STT adapter seam already defaults to a safe mock (no spend);
  TTS is net-new and lands in WO-VOICE-2.

## 7. Discipline
Voice changes the CHANNEL, never the rules: one engine, one guardrail set, one deterministic gate. STT feeds the
same allergen gate; TTS reads out engine-computed money and gate-checked safety. The fail-closed net makes voice
*stricter* on safety than text, never looser. Nothing here is fine-tuned; the flag is default OFF.
