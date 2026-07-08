# MIZAN — native-panel results — Khalid — 2026-07-08

> ## 🧪 SAMPLE — NOT REAL REVIEWER DATA
> These scores are DUMMY inputs to demonstrate the aggregate→gate flow. They do **not** resolve the real launch gate. The dialect gate stays PENDING-HUMAN until ≥3 real Saudi reviewers score the live packet.

- **Benchmark:** MIZAN v0.1-phase1 · human-hook suites: 1, 9, 10, 11, 12
- **Reviewers found:** 3 (SAMPLE-reviewer-1, SAMPLE-reviewer-2, SAMPLE-reviewer-3) · min per item required: 3 (and every rubric dimension needs ≥3 scores)
- **Packet:** `mizan-panel-SAMPLE` (reviewer files for other packets are rejected)
- **Reviews dir:** `scripts/mizan/sample/reviewers`
- **Variance flag:** an item whose reviewers span ≥ 4 points on a dimension is flagged HIGH-VARIANCE (adjudicate, don't average).

## ⚠️ Honest limits — read BEFORE any score

- MIZAN pass ≠ safe. Safety is the deterministic allergen gate + engine; MIZAN is a dialect/quality gate only.
- Automated scores are PROXIES. Dialect authenticity needs ≥3 native reviewers (Step 5) — never a machine number.
- Phase-1 sample size (target 100–200/suite) is NOT regression-grade; needs 5–10× before it gates releases.
- Coverage is Najdi + Hijazi only; Eastern/Southern are Phase 2.
- Offline scores drift — re-measure on live traffic periodically.
- This panel step aggregates HUMAN scores only — it never machine-scores authenticity. Under-reviewed items stay PENDING-HUMAN.

## Launch gates (human slots resolved by this panel)

| Gate | Metric | Threshold | Result | Value |
|---|---|---|---|---|
| Dialect authenticity ≥ 7.5/10 (HUMAN — Step 5) | human | >= 7.5 | PASS ⚠️ HIGH-VARIANCE (adjudicate) | 7.72 |
| Order accuracy ≥ 97% | order_accuracy | >= 0.97 | — (from mizan-eval machine/safety run) | — |
| Price hallucination = 0 | invented_prices | == 0 | — (from mizan-eval machine/safety run) | — |
| Escalation ≥ 95% (per engine criteria) | escalation_rate | >= 0.95 | — (from mizan-eval machine/safety run) | — |
| PDPL/privacy = 100% | privacy_pass_rate | == 1 | — (from mizan-eval machine/safety run) | — |
| Allergy/safety pass (deterministic gate — by construction) | safety_pass_rate | == 1 | — (from mizan-eval machine/safety run) | — |

**Overall release readiness:** PENDING (awaiting native-panel scores — Step 5)


## Human suites — per-item aggregate

### Suite 1 — Dialect authenticity  ·  status: **HIGH-VARIANCE** ⚠️ HIGH-VARIANCE
Rubric: authenticity · warmth_karam · register_fit (1–10, pass ≥ 7.5) · min reviewers seen: 3
- `S1-01` — reviewers: 3 · status: SCORED
  - Khalid: وعليكم السلام، هلا وغلا 🌟 إي والله عندنا كبسة دجاج وكبسة لحم، وش تحب أجهّز لك؟
  - authenticity: mean 8.33 · range 1 · votes [8, 8, 9]
  - warmth_karam: mean 7.67 · range 1 · votes [8, 7, 8]
  - register_fit: mean 8.33 · range 1 · votes [9, 8, 8]
  - **item mean: 8.11**
  - note (SAMPLE-reviewer-1): طبيعي ومريح
- `S1-02` — reviewers: 3 · status: HIGH-VARIANCE ⚠️
  - Khalid: أنصحك بالكبسة، إنها من أكثر الأطباق التي يقع عليها الطلب لدى ضيوفنا الكرام.
  - authenticity: mean 6.00 · range 6 ⚠️ high-variance · votes [3, 6, 9]
  - warmth_karam: mean 7.33 · range 1 · votes [7, 7, 8]
  - register_fit: mean 7.33 · range 1 · votes [8, 7, 7]
  - **item mean: 6.89**
  - note (SAMPLE-reviewer-1): حسيته يميل للفصحى بزيادة، مو مثل كلام الناس
  - note (SAMPLE-reviewer-2): عادي، مو سيّئ بس مو أصيل تماماً
  - note (SAMPLE-reviewer-3): أنا حبيته، واضح ومؤدب
- `S1-03` — reviewers: 3 · status: SCORED
  - Khalid: هلا فيك 🌟 اليوم عندنا مندي لحم طري وسمك مشوي طازة، تحب أوصف لك أي واحد؟
  - authenticity: mean 8.33 · range 1 · votes [8, 9, 8]
  - warmth_karam: mean 8.33 · range 1 · votes [8, 8, 9]
  - register_fit: mean 8.33 · range 1 · votes [9, 8, 8]
  - **item mean: 8.33**
- `S1-04` — reviewers: 3 · status: SCORED
  - Khalid: أبشر، عليك بالمندي اللحم — دسم ويشبع، ومعاه رز على أصوله. أجهّزه لك؟
  - authenticity: mean 7.67 · range 1 · votes [7, 8, 8]
  - warmth_karam: mean 7.67 · range 1 · votes [8, 7, 8]
  - register_fit: mean 7.33 · range 1 · votes [8, 7, 7]
  - **item mean: 7.56**

### Suite 9 — Tone modulation  ·  status: **PENDING-HUMAN**
Rubric: tone_fit · warmth · brevity (1–10, pass ≥ 7.5) · min reviewers seen: 0
- `S9-01` — reviewers: 2 · status: PENDING-HUMAN
  - Khalid: يسعدنا هذا والله 🌟 تسلم وتستاهل كل خير، ننتظرك دايم.
  - tone_fit: mean 7.50 · range 1 · votes [8, 7]
  - warmth: mean 8.00 · range 0 · votes [8, 8]
  - brevity: mean 7.50 · range 1 · votes [7, 8]
  - **item mean: 7.67**
- `S9-02` — reviewers: 2 · status: PENDING-HUMAN
  - Khalid: عذراً على التأخير، طلبك بالطريق ويوصلك قريب إن شاء الله. أشكر صبرك.
  - tone_fit: mean 7.50 · range 1 · votes [7, 8]
  - warmth: mean 7.50 · range 1 · votes [7, 8]
  - brevity: mean 7.50 · range 1 · votes [8, 7]
  - **item mean: 7.50**
- `S9-03` — reviewers: 0 · status: PENDING-HUMAN
  - tone_fit: mean — · range 0 · votes []
  - warmth: mean — · range 0 · votes []
  - brevity: mean — · range 0 · votes []

### Suite 10 — Upsell register  ·  status: **PENDING-HUMAN**
Rubric: natural_offer · not_pushy · menu_truth (1–10, pass ≥ 7.5) · min reviewers seen: 0
- `S10-01` — reviewers: 0 · status: PENDING-HUMAN
  - natural_offer: mean — · range 0 · votes []
  - not_pushy: mean — · range 0 · votes []
  - menu_truth: mean — · range 0 · votes []
- `S10-02` — reviewers: 0 · status: PENDING-HUMAN
  - natural_offer: mean — · range 0 · votes []
  - not_pushy: mean — · range 0 · votes []
  - menu_truth: mean — · range 0 · votes []

### Suite 11 — Complaint-recovery register  ·  status: **PENDING-HUMAN**
Rubric: ownership · no_defensiveness · face_saving (1–10, pass ≥ 7.5) · min reviewers seen: 0
- `S11-01` — reviewers: 0 · status: PENDING-HUMAN
  - ownership: mean — · range 0 · votes []
  - no_defensiveness: mean — · range 0 · votes []
  - face_saving: mean — · range 0 · votes []
- `S11-02` — reviewers: 0 · status: PENDING-HUMAN
  - ownership: mean — · range 0 · votes []
  - no_defensiveness: mean — · range 0 · votes []
  - face_saving: mean — · range 0 · votes []

### Suite 12 — Hospitality / karam register  ·  status: **PENDING-HUMAN**
Rubric: karam_warmth · not_theatrical · one_person (1–10, pass ≥ 7.5) · min reviewers seen: 0
- `S12-01` — reviewers: 0 · status: PENDING-HUMAN
  - karam_warmth: mean — · range 0 · votes []
  - not_theatrical: mean — · range 0 · votes []
  - one_person: mean — · range 0 · votes []
- `S12-02` — reviewers: 0 · status: PENDING-HUMAN
  - karam_warmth: mean — · range 0 · votes []
  - not_theatrical: mean — · range 0 · votes []
  - one_person: mean — · range 0 · votes []

---
_Human-hook suites 1,9,10,11,12 · aggregated from 3 reviewer file(s) · ≥3/item required, else PENDING-HUMAN._
_Nothing in lib/ai/* runtime was touched — this reads human scores and re-runs the existing MIZAN gate. Authenticity is NEVER machine-scored._
