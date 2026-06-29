# Allergen SYMPTOM detector — human review (REQUIRED)

**Status: ⏳ PENDING HUMAN/MEDICAL REVIEW.** The `allergen_symptom_detection`
feature flag is **ON in production for Wesaya** (`feature_flags.allergen_symptom_detection = true`),
but the Arabic symptom/condition term list below has **not** had a documented
review by a native Egyptian-Arabic speaker familiar with food-allergy terminology.
This document surfaces exactly what needs reviewing so a qualified person can do it
and sign off.

> The code itself is **not** the review. A medical/linguistic review is a **human**
> task — this doc lists the terms; a qualified reviewer validates them and signs below.

---

## What this detector does (so you know what you're reviewing)

- It's an **additive safety layer** (`lib/ai/allergen-symptoms.ts`), evaluated **only
  when the base allergen gate did NOT already fire** (`lib/ai/customer-turn.ts:271-279`).
- The base allergen gate (`lib/ai/allergen-gate.ts`) is a **separate, already-reviewed**
  layer and is **unchanged** by this work. It stays fully ON.
- **A match does ONE thing: escalate to a human.** It returns a fixed reply telling
  the customer the kitchen must confirm safe items, sets `escalate: true`, calls
  `escalate_to_human`, and **confirms no order / auto-clears nothing**
  (`forcedAllergenSafetyResult`, `customer-turn.ts:91-118`).

## Fail-safe contract (verified in code — this is WHY it's safe to run pending review)

- **A match → escalation only.** There is no path where a symptom match makes the
  agent *less* cautious, marks anything "safe", or auto-confirms an order.
- **A miss (term not in the list) → falls back to the base gate + the never-say-safe
  LLM output guard** — i.e. **never worse than the flag being OFF**.
- **Net:** ON is strictly ≥ OFF on safety. The review improves *recall* (catch more
  real signals) and reduces *over-escalation* (false positives) — it does not guard
  against a safety regression, because the layer can only ever *add* escalations.
- Design goal (per the module): **recall first — over-escalation is safe,
  under-escalation is dangerous.**

## ⚠️ The review does NOT make the system "safe to promise allergen-free"

Kivo/Karim must **never** assert a dish is allergen-safe. This detector only routes
a customer's allergy signal to a human. Reviewing it improves routing; it does not
authorize any "this is safe" claim — the kitchen confirms safety, person to person.

---

## Terms to review (grouped as in the code)

For each: confirm it's a real Egyptian-Arabic allergy signal, and flag any
**dangerous omissions** (phrases a customer would really use that aren't caught).
Do **not** worry about over-broad entries unless they'd fire on totally unrelated,
common messages — over-escalation is acceptable.

### SET 1 — Physical symptom / anaphylaxis language → triggers: escalate to human
Plain-language signals the patterns intend to catch (label in parentheses):
- Throat/airway tightening or closing — «زوري بيضيق»، «حلقي اتقفل»، «صعوبة في البلع/التنفس»، «مش عارف اتنفس» (ضيق في الحلق / التنفس)
- Choking / wheeze / asthma-like — «بختنق»، «اتخنقت»، «نفسي بيقف»، «صفير في النفس»، «ربو»، «كتمة في صدري» (ضيق في التنفس)
- Swelling — «وشي/شفايفي/لساني بينتفخ / ورمت / بتورم» (تورم)
- Skin reaction — «طفح جلدي»، «حكة»، «هرش»، «احمرار»، «ارتيكاريا»، «بقع حمرا» (طفح جلدي)
- Severe/emergency — «epipen / إبينفرين / أدرينالين»، «حساسية شديدة/حادة/خطيرة»، «ودوني المستشفى / الطوارئ بسبب أكل/مكسرات/فول سوداني…»، «إغماء/فقدان وعي»، «قيء بعد ما أكلت» (حساسية شديدة / رد فعل تحسسي)
- Lactose triggers — «اللبن/اللاكتوز بيتعبني/بيوجعني/بيضرني» (عدم تحمل اللاكتوز)

### SET 2 — Named medical conditions → triggers: escalate to human
- Celiac / gluten — «سيلياك»، «مرض الزراعية»، «حساسية الجلوتين/القمح/الدقيق» (مرض السيلياك / حساسية الجلوتين)
- Lactose intolerance — «عدم تحمل اللاكتوز»، «حساسية الحليب/اللبن/منتجات الألبان» (عدم تحمل اللاكتوز)
- Favism / G6PD — «فيفازم/فافيسم/G6PD»، «نقص إنزيم/خميرة»، «تفول»، «أنيميا الفول»، «الفول بيمرضني/ممنوع عليا»، «تكسير الدم» (مرض الفول)
- Tree-nut / peanut allergy (explicit English) — "nut/peanut/tree-nut allergy" (حساسية المكسرات)

### SET 3 — English + Franco-Arabic → triggers: escalate to human
- English allergy/symptom words — allergic/allergy/sensitivity/intolerant, "can't breathe", "shortness of breath", "wheeze", "throat closing", "lips/face swelling", "went to the ER after…"
- Franco-Arabic — `7asas`, `hasaseya`, `7saseya`, `3andi 7asas`, `weshy byewram`, `nafasy bye2af`, `betkhane2`, `mesh ba3raf atnafas`

### SET 4 — Child + strict-avoidance + allergen (all three required) → triggers: escalate
- Child marker (ابني/بنتي/طفلي/رضيع…) **AND** an allergen term **AND** either strict
  avoidance (ممنوع/بلاش/خالص/مايقربش…) **or** a doctor restriction (الدكتور مانع/منع/حذر).
- Does **not** fire on a plain preference like «بنتي عايزة من غير جوز».

> Exact regex patterns live in `lib/ai/allergen-gate-symptoms.ts` (`SYMPTOM_TERMS`,
> `CONDITION_TERMS`, `ENGLISH_FRANCO_RE`, `FRANCO_AR_RE`, SET-4 helpers). A reviewer
> who reads regex can check those directly; the plain-language list above is the
> reviewable summary.

---

## Reviewer sign-off checklist

- [ ] Every listed term/phrase is a plausible real Egyptian-Arabic allergy signal.
- [ ] No **dangerous omissions** — common phrases a customer would use to report an
      allergy/symptom that are **not** caught (list any to add).
- [ ] Over-escalation entries (fire too readily) are acceptable, or flagged if they'd
      fire on clearly-unrelated everyday messages.
- [ ] Confirmed the action on a match is **escalation to a human only** (no "safe"
      promise, no auto-confirm) — matches the fail-safe contract above.
- [ ] Confirmed leaving the flag **ON** pending term additions is acceptable (ON ≥ OFF
      on safety, per the contract), **or** request it be turned **OFF** until specific
      additions are made.

**Reviewer:** ____________________   **Qualification:** ____________________
**Date:** ____________________   **Decision:** ☐ approve as-is  ☐ approve with the additions listed  ☐ turn flag OFF until revised

Additions / changes requested (free text):

```
(reviewer notes)
```

---

## How to act on the review (engineering)

- **Approve / approve-with-additions:** make the term-list edits the reviewer
  specifies (a separate, reviewed change), then update the status banner at the top
  of `lib/ai/allergen-gate-symptoms.ts` to "REVIEWED <date> by <name>".
- **Turn OFF until revised:** set `feature_flags.allergen_symptom_detection = false`
  for the tenant (DB change — requires Mohamed's approval, per the migration/flag
  governance). The base allergen gate stays ON regardless.
