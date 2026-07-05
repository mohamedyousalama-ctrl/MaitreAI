# `scripts/voice/` — Khalid voice eval set (WO-VOICE-0)

Frozen eval fixtures for Khalid's voice (V1 = WhatsApp voice notes). **Data only — no production code.**
The full bake-off design, rubric, cost model, fail-closed threshold, and vendor recommendation live in
**`docs/WO_VOICE_0_BAKEOFF.md`**.

## `khalid-voice-eval-set.json`

- **`tts.scripts`** — 10 scripted Khalid replies (Najdi) for the TTS bake-off + the scoring rubric
  (naturalness / dialect authenticity / warmth-karam / pace).
- **`stt.items`** — 20 scripted Saudi voice notes for the STT bake-off. Includes **every safety-vocabulary
  phrasing class** from `docs/KSA_ALLERGEN_DIALECT_REVIEW.md` (explicit «حساسية», the KSA gaps, symptoms) plus
  noise / child / code-switch / phonetic-trap / control cases. Each item carries `containsSafety`, `safetyTerms`,
  `noise`, and `mustFlag`.
- **`stt.failClosedThreshold`** — the fail-closed safety-positive rule: `SAFETY_STT_CONFIDENCE_FLOOR`, the
  Arabic phonetic-normalization for near-matching, and the seed phonetic-near set.

## How WO-VOICE-1 / WO-VOICE-2 consume it

- **WO-VOICE-1 (STT):** a harness transcribes each `stt.items` recording with the chosen adapter
  (`lib/ai/stt/`), asserts **`safety_term_recall = 1.00`** (deterministic gate + fail-closed net), and reports
  WER + false-positive rate → a **blocking `agent-eval` gate** (the voice allergen hard-test).
- **WO-VOICE-2 (TTS):** `tts.scripts` + the rubric are the QA/regression set for the chosen voice.

Prerequisite for the fail-closed rule: `SttResult` (`lib/ai/stt/types.ts`) must gain a `confidence` signal
(WO-VOICE-1). Flag **`voice_notes` is reserved, default OFF** — voice never activates until the flag is on, a paid
STT/TTS key is provisioned, and the safety-recall gate is green.
