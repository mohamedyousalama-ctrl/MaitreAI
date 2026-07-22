# BRAIN Safety Triage Classes

This document extends `SAFETY_POLICY_MATRIX.md`. It does not weaken that matrix: the model may add evidence and natural language, but it may never authorize safety, use forbidden reassurance, or override deterministic positive safety detection.

## Global Invariant

A deterministic safety signal can never be silently suppressed by the LLM. It must enter the triage policy. Different classes may produce different responses, notes, and holds, but none may disappear because a model labeled the message as harmless.

## Policy Hierarchy

Safety policy is layered:

1. Global Kivo minimum safety floor.
2. Country legal and operational policy.
3. Restaurant policy.

Restaurant policy may only become stricter. It may never weaken the global floor or country requirement. If policies conflict, choose the stricter customer-safety outcome and record the conflict for PM/legal review.

## Ingress Safety Scanner Ordering

Safety scanning runs on every raw inbound message before burst coalescing.

Reason: the system cannot know a message is safety-critical until it scans it. Coalescing may hide a short disclosure such as "peanuts" or "I am allergic" inside later ordering text. The raw-message scanner records safety candidates, confidence, transcript/ASR evidence, and message id before any coalesced turn is interpreted.

## Triage Classes

| class | deterministic detection | forced response | hold applied | kitchen-note behavior | escalation |
|---|---|---|---|---|---|
| `SAFETY_INFORMATION_QUERY` | Customer asks what is inside an item, asks whether an ingredient is present, or asks for dietary/ingredient facts without stating an allergy, medical restriction, or third-party risk. | Answer only from `PUBLISHED` catalog facts. State uncertainty when facts are missing. Ask whether there is an allergy or dietary constraint if the answer could affect safety. | No hold by default. | No kitchen safety note unless customer later discloses risk. | Escalate if the requested fact is missing and the answer could affect safety or compliance. |
| `EXPLICIT_CUSTOMER_DISCLOSURE` | Customer says they personally have an allergy, sensitivity, celiac/gluten issue, medical restriction, severe reaction, pregnancy-related restriction, medication restriction, or similar safety constraint. | Acknowledge the disclosure; do not say the item is safe; ask clarifying questions or offer human confirmation; block commit until structured safety evidence exists. | Safety hold when item/prep/cross-contact status is unknown, customer asks for assurance, or restaurant policy requires staff review. | Create/update `safety_disclosures`; committed order requires kitchen-visible note. | Human required when any relevant catalog safety axis is `UNKNOWN`, conflicting, stale, or customer wants to proceed with risk. |
| `THIRD_PARTY_DISCLOSURE` | Customer orders for, mentions, or asks about another person's allergy/medical/dietary safety constraint. | Treat as safety-relevant; ask customer to confirm the constraint and affected diner; do not provide safety reassurance. | Hold when the order may include the relevant item or when facts are unknown. | Kitchen note identifies third-party nature where useful without excess personal data. | Escalate under same conditions as explicit customer disclosure. |
| `PROBABLE_DISCLOSURE` | Deterministic detector sees safety terms with ordering intent but phrasing is incomplete, misspelled, dialectal, or low-confidence, for example "no nuts allergy?" or possible ASR confusion. | Ask a direct clarification before mutating or committing risky items. | Temporary safety-possible hold for the episode until clarified or dismissed. | No final kitchen note until confirmed; retain trace as safety evidence. | Escalate after repeated ambiguity, low-confidence voice repeats, or attempted confirm without clarification. |
| `UNCERTAIN_SAFETY_SIGNAL` | Raw message has low confidence, incomplete text, media/voice uncertainty, symptom terms, medical words, or mixed language that might be safety-relevant but is not classifiable. | Clarify in customer language if possible; otherwise route to human. | Hold when the current order contains or may contain the referenced item/risk. | No kitchen note unless disclosure becomes explicit; keep evidence trail. | Human required if clarification fails or customer attempts to proceed. |
| `CROSS_CONTAMINATION_QUERY` | Customer asks about cross-contact, shared fryer/oil, prep surfaces, utensils, packaging, kitchen separation, traces, "may contain", or similar preparation risk. | Answer only from `PUBLISHED` cross-contact axis facts. If unknown, state that the system cannot confirm and route to human. | Hold when tied to a disclosed or probable allergy/medical risk. | Kitchen note required if order proceeds after human handling. | Human required when cross-contact axis is `UNKNOWN`, stale, branch-specific missing, or disputed. |
| `NON_MEDICAL_PREFERENCE` | Customer states a preference or non-medical diet without safety wording, for example "I do not like onions" or "vegetarian preference", and no allergy/health terms are present. | Respect preference deterministically when catalog/modifiers support it; do not treat as allergy; avoid medical safety claims. | No safety hold by default. | Ordinary order note only if useful to kitchen; not a safety note. | Escalate if preference cannot be represented and the customer asks staff to guarantee preparation. |

## Detection Requirements

Detectors must be deterministic and evidence-preserving:

- Lexicon hits for allergy, ingredient, symptom, medical, cross-contact, and dietary terms.
- Dialect and spelling variants.
- ASR confidence and alternative transcripts.
- Raw message id before coalescing.
- Channel and tenant.
- Catalog item references if present.
- Whether customer is ordering, asking information, confirming, or discussing a third party.

The LLM may propose a class only as untrusted evidence. Deterministic policy owns the final triage class.

## Response Requirements

All safety triage responses must:

- Avoid saying "safe" or "آمن" as authorization for a disclosed safety concern.
- Avoid reassuring that an item is suitable unless deterministic policy explicitly allows a non-safety preference answer.
- Use catalog facts only when `PUBLISHED`, current, branch-valid, and safety axes are answered.
- Route `UNKNOWN` safety axes to human.
- Keep internal policy and diagnostic text out of customer output.

## Measurement

Safety detectors are measured on both recall and operational burden.

Required metrics:

- Recall on explicit disclosure, third-party disclosure, probable disclosure, cross-contact query, and low-confidence voice safety cases.
- False-positive rate by class.
- Escalation burden: percentage of harmless ingredient or preference questions routed to staff.
- Staff resolution time for escalated safety cases.
- Missed kitchen-note rate.
- Customer abandon rate after safety clarification.

A detector that routes 30% of harmless ingredient questions to staff damages operations even if recall is high. The acceptable threshold is set by PM and safety review, but no threshold may weaken the global safety floor.

## Relationship To Existing Matrix

`SAFETY_POLICY_MATRIX.md` remains the minimum scenario matrix:

- Ingredient info request maps primarily to `SAFETY_INFORMATION_QUERY`.
- Explicit allergy while ordering maps to `EXPLICIT_CUSTOMER_DISCLOSURE`.
- Unknown ingredient or cross-contamination maps to `CROSS_CONTAMINATION_QUERY` or `UNCERTAIN_SAFETY_SIGNAL`.
- Low-confidence voice plus possible allergy maps to `PROBABLE_DISCLOSURE` or `UNCERTAIN_SAFETY_SIGNAL`.
- Historical allergy memory remains explicit-only and requires reconfirmation before kitchen note behavior.

If this file and the matrix appear to disagree, choose the stricter safety outcome and file a governance contradiction for PM adjudication.
