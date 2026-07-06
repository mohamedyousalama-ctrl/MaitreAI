# WO-PAY-PLAYBOOK — payment conversation layer (contract + Core wiring)

**Status:** overlay leaf + evals, flag `pay_playbook` **default OFF**, imported by nothing until a Core wiring PR. Persona-agnostic (Karim + Khalid). **No engine/schema change; no fine-tuning.**

## What this is

The JUDGMENT layer for the money moment — *when* to ask for payment, *how* to offer methods, how to survive a false "I paid" claim, how to acknowledge a real payment, and the voice/callback rules. It sits **above** the engine's hard floor and never touches it.

- `lib/ai/pay-playbook.ts` — `buildPayPlaybook(ctx)` overlay + pure helpers.
- `scripts/test-pay-playbook.test.ts` — 57 pure cases → `test:unit` + `agent-eval` gate 13.
- `scripts/eval-scenarios.mjs` · `EVAL_MODE=pay` — 4 behaviour scenarios × both dialects, inheriting the cross-cutting forbidden-claims gate.
- `lib/ai/personas/khalid-forbidden-claims.mjs` — two new testable classes (below).

## Division of labour (the hard floor is the engine's, not this layer's)

| Concern | Owner |
|---|---|
| The money total (with VAT) | **Engine** (computed from tools; this layer only reads it back) |
| Payment status (`payment_status`) | **Engine** — webhook + DB truth. This layer never marks an order paid. |
| The payment link / cash flow | **Engine** — this layer never authors a charge, never collects card data. |
| The deterministic allergen gate | **Engine** — untouched; payment never relaxes it. |
| *When* to ask, *how* to offer, claimed-paid handling, callback capture, voice rules | **This layer** (judgment) |

## The rules (contract)

1. **Ask-timing** — payment is asked for ONLY after (1) items confirmed, (2) fulfillment confirmed, (3) total **with VAT** read back. One ask; one gentle reminder if a link sits unpaid; never before read-back, never nagging. Pure gate: `canAskForPayment({itemsConfirmed, fulfillmentConfirmed, totalReadBack})`.
2. **Method offer** — cash vs link per the tenant's **enabled** methods (engine truth); never invent a method. Pure: `offerableMethods(enabled)` (drops unknowns, de-dupes, order-stable).
3. **Claimed-paid (anti-fraud)** — customer says «دفعت» / sends a screenshot while the DB is not `paid` → warm + honest «لسه ما وصلني تأكيد الدفع — أول ما يوصل بأكد لك فورًا». A screenshot is never proof; the word is never proof. Never mark/imply paid. Second claim or dispute → escalate `risk_type=payment_issue`. Pure: `isUnverifiedPaidClaim(claim, dbStatus)`.
4. **Paid acknowledgment** — ONLY after the webhook marks the order paid: warm confirmation + receipt. Wording never runs ahead of DB truth. Pure: `mayAcknowledgePaid(dbStatus)` (true iff `dbStatus === "paid"`).
5. **Voice rules** — links and money figures ALWAYS text; a voice note may *announce*, never *carry*, a link or figure.
6. **Forbidden-claims additions** (the testable constant):
   - `card_data_request` (**evalAssert: true** → live gate) — never solicit a card number / OTP / CVV / PIN. Fires on a solicitation verb + credential token; stays quiet on "the bank sends you an OTP" (description) and on prohibition statements.
   - `payment_status_claim` (**evalAssert: false** → strict/overlay + unit) — never state a payment status the DB does not hold. Excluded from the live cross-cutting gate on purpose (so the honest post-webhook paid-ack is not flagged); the fraud-critical direction is enforced at the **scenario** level (`PAY-CLAIMED-PAID` runs the strict detector) and by the engine's DB truth.
7. **Callback capture (WO-CALLBACK addendum)** — offer a callback only at the right moment; capture a **window** (`now` / `hour` / `evening`), not a clock time; confirm via the engine's `buildCallbackConfirm` honest pattern; never promise an exact minute, never claim a call already happened. Constants: `CALLBACK_WINDOWS`, `isCallbackWindow`.

## Core wiring (when the flag turns on)

- Append `buildPayPlaybook({ dialect, enabledMethods, callbackEnabled })` to the customer system prompt behind `isFeatureExplicitlyEnabled("pay_playbook", …)` — same shape as `menu_playbook` / the persona overlay; **flag-OFF must stay byte-identical** (extend the snapshot gate).
- Supply `enabledMethods` from the tenant's real payment config and `callbackEnabled` from the WO-CALLBACK flag; the overlay renders only what the engine reports.
- The overlay is JUDGMENT; the engine keeps enforcing the hard floor (money, `payment_status`, the link/cash flow, the allergen gate). The overlay must never be able to move an order to paid.

## Discipline

One engine, one guardrail set, one deterministic gate. Payment changes never relax the safety rules; the persona changes the *voice*, never the *money truth*. No schema change, no fine-tuning, flag default OFF.
