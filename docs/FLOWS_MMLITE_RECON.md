# Recon: WhatsApp Flows + Marketing Messages Lite (MM-Lite)

**Status:** Ratified. Verdicts stand; the §3 gate-boundary rule and §6 claim-language
rules are adopted as **standing doctrine** (rules registry).
**Date:** 2026-07-06 · **Scope:** capability inventory · fit-gap vs our actual stack ·
cost implications · go/no-go per technology · the load-bearing safety question.
**No code** — this is a decision + doctrine document.

---

## 0. TL;DR / Go-No-Go

| Technology | Verdict | One-line reason |
|---|---|---|
| **MM-Lite** (campaigns rail) | **GO — conditional, low-risk, not urgent** | Marketing-only *outbound* rail; adds **no new inbound surface** and bypasses **no gate**; pricing aligned (no cost penalty), delivery upside. Adopt when we build the campaigns rail. |
| **Flows — non-food structured forms** (feedback, address, reservation slot) | **CONDITIONAL-GO — pilot first** | Safe *iff* the Flow carries **no allergen-relevant order state** and makes **no safety claim**. |
| **Flows — order / checkout ("pay in chat")** | **NO-GO until the gate boundary is solved** | A structured form bypasses `runCustomerTurn`, and the deterministic allergen **input** gate lives *only* inside `runCustomerTurn`. Shipping this without §3 opens a child-safety hole. |

---

## 1. Capability inventory (what each actually is)

### 1A. WhatsApp Flows
An official Meta framework that renders **interactive multi-screen forms inside
WhatsApp** — dropdowns, date pickers, checkboxes, text inputs, OTP. A Flow is a JSON
document (screens + components + routing). It is **delivered as an interactive message
through the normal messaging/Cloud API**, so *sending* a Flow reuses the outbound path
we already own.

The customer's submitted data returns by **one of two channels** — this distinction is
the whole document:

- **`nfm_reply`** — the completion payload arrives on the **normal inbound messages
  webhook** as `interactive.type = "nfm_reply"`, carrying `response_json` + `flow_token`.
- **Data-exchange endpoint** — for dynamic Flows, each screen POSTs to a **separate
  business-hosted HTTPS endpoint** we stand up, with an **end-to-end-encrypted body**
  (`encrypted_flow_data` / `encrypted_aes_key` / `initial_vector`, RSA key-pair we
  generate/sign). This channel is **independent of the messages webhook**.

> **Claim-discipline:** Flows *collect and validate structured input*. They do **not**
> reason and do **not** run our Brain. Anything a Flow "knows" is what its JSON was told
> or what our endpoint returns.

### 1B. Marketing Messages Lite (MM-Lite)
A **marketing-only, outbound-only** sending rail that runs **in parallel on the same
phone number** as Cloud API. Utility/auth/service and **all inbound** stay on Cloud API.
It **reuses our existing templates**; enrolling a WABA already on Cloud API needs no
re-templating. Meta's algorithm **selects recipients by predicted engagement** — it may
**not** send to every contact in a campaign. Meta's own testing claims **up to ~9% higher
delivery** for marketing.

> **Claim-discipline:** MM-Lite is a **deliverability optimizer**, not a cost reducer and
> not a guaranteed-reach channel.

---

## 2. Fit-gap against our *actual* stack

**The single Brain choke point.** Every customer turn — from the WhatsApp webhook
(`app/api/whatsapp/webhook/route.ts` → `lib/messaging/respond-and-send.ts`) **and** from
the secret-guarded eval route — passes through exactly one function: `runCustomerTurn()`
in `lib/ai/customer-turn.ts` ("one Brain path — no drift").

**Where the safety gates live, relative to that choke point:**

- **Allergen INPUT gate** — `detectAllergenAvoidance()` (`lib/ai/allergen-gate.ts`) is
  called **inside `runCustomerTurn`** and runs **unconditionally** (not flag-gated —
  *child safety must never depend on a feature-flag row being present*). On a hit it forces
  escalation and stamps a **`SYSTEM_HOLD` / `is_safety_hold`** with no LLM call.
- **Allergen OUTPUT guard** — `assertsAllergenSafety()` (`lib/ai/respond.ts`), also
  unconditional. Blocks the model from certifying an item allergen-safe on unknown data.
- Both are reachable **only through `runCustomerTurn`**. A code path that doesn't call it
  never evaluates either.

**Money-truth (already decoupled — good news for Flows).** The **only** path that flips an
order to `payment_status = 'paid'` is the Moyasar settlement webhook
(`lib/payments/moyasar-webhook.ts`, after amount + currency are verified against the
server-priced session). Pay-link minting (`app/api/payments/psp/create/route.ts`) is a
**separate operator-authenticated HTTP surface** that server-prices from `orders.total`
(never client input) and calls `checkOrderSafetyHold()` *before* creating a session. The
conversational path only ever produces `payment_status: "unpaid"`.

**Conclusions:**
- **MM-Lite → clean fit.** It only *sends business-initiated marketing templates we
  already have*. The WO-6 `template_sends` ledger + capacity chip already model exactly
  this accounting, so MM-Lite slots into the capacity math with no new safety surface.
- **Flows → split fit.** *Sending* a Flow reuses our outbound path (fine). *Receiving* a
  Flow submission lands on `nfm_reply` **or** a brand-new encrypted endpoint — **neither
  routes through `runCustomerTurn`**. That is the gap.

---

## 3. The load-bearing question — STANDING DOCTRINE

> **A structured form that bypasses the message pipeline also bypasses the gate. The gate
> is not a property of the transport — it is wired to one function (`runCustomerTurn`). How
> do the deterministic allergen gate and money-truth survive a Flow that never routes a
> customer message through the Brain?**

**Money-truth: SURVIVES — with two hard conditions.**
Because the paid-flip is already isolated to the webhook, and pay-link minting already
server-prices and already checks the safety hold, a Flow-driven checkout does **not** create
a new money-truth path **provided**:
1. the Flow's endpoint hands off to the existing `createMoyasarSession` (server-priced from
   `orders.total`) and **never accepts a client-supplied amount**; and
2. settlement stays **webhook-only**.

Under those two conditions money-truth is robust to Flows.

**Allergen gate: DOES NOT survive automatically — this is the blocker.**
The input gate keys on **conversational free-text** ("no nuts, my son is allergic"). A
structured Flow has no such turn:
- A dropdown/checkbox order carries no natural-language allergy signal for
  `detectAllergenAvoidance` to fire on.
- Even a free-text "notes" field inside a Flow returns via `nfm_reply` / the encrypted
  endpoint — **not** `runCustomerTurn` — so the detector never runs on it.
- The `checkOrderSafetyHold()` backstop only trips if a **prior conversational turn already
  armed a hold**. A Flow-native order that never sent a message through the Brain arrives at
  checkout with **no hold ever having been evaluated**.

**THE RULE (adopted doctrine).** Adopting Flows for anything carrying allergen-relevant
order state requires **the deterministic allergen gate to gain a second, unconditional call
site at the Flow-endpoint boundary** — the detector must run on every structured submission
(including any notes field), and a Flow must be **forbidden from finalizing an
allergen-safety claim**. Absent that, a Flow must be **structurally barred from carrying
menu/order items**, and the customer must be landed back in the conversational pipeline
before any allergen-relevant order is confirmed. Belt-and-suspenders: default a
`SYSTEM_HOLD` on any Flow order referencing an allergen-flagged item when no conversational
turn evaluated the customer's allergy intent.

---

## 4. Cost implications

- **Flows: no separate fee.** A Flow is priced by whatever category delivers it. Inside the
  **24h service window** (customer wrote first) a Flow is a **free service message**; a
  business-initiated Flow costs the **utility** or **marketing** rate. KSA 2026 rough rates:
  marketing **~0.17–0.21 SAR/msg** (rose Apr 1 2026), utility/auth **~0.04–0.06 SAR**,
  service **free in-window**. Billing is now **per delivered message** and moving to **SAR
  local-currency** invoicing. *Design implication:* keep Flows inbound-first to stay in the
  free service tier.
- **MM-Lite: no incremental unit cost.** Marketing pricing via MM-Lite and via Cloud API has
  been **aligned since Jan 1 2026** — MM-Lite is **not cheaper**; its value is deliverability
  (~9% claimed) and Meta-side recipient optimization. Every MM-Lite send is still a billable
  marketing message and **still counts against our capacity ledger**.

---

## 5. Go/No-Go per technology (with conditions)

**MM-Lite → GO (conditional; sequence after the campaigns rail exists).**
Conditions: (a) **marketing category only** — never route utility/auth/service/inbound
through it; (b) consent/opt-in unchanged; (c) the `template_sends` ledger counts MM-Lite
sends so the capacity chip stays honest; (d) **never rely on it for time-critical /
transactional** — recipient selection means non-guaranteed reach. Low risk: no inbound
surface, no gate touched.

**Flows → NO-GO for checkout; CONDITIONAL-GO for a non-food pilot.**
- **Pilot-safe now:** a Flow carrying **no allergen-relevant order state and no safety
  claim** — e.g., NPS/feedback capture, address collection, reservation slot pick. Route its
  `nfm_reply` into normal inbound handling for the audit trail.
- **Blocked until §3 lands:** Flow-native menu/checkout ("pay in chat"). Do **not** ship it
  until (1) the deterministic allergen gate has an unconditional call site at the
  Flow-endpoint, and (2) money stays webhook-settled + server-priced per §3.

---

## 6. Never-overclaim / claim-language rules — STANDING DOCTRINE

1. **Flows collect; they do not reason.** Never describe a Flow as "checking,"
   "confirming," or "ensuring" anything about safety or allergens. It renders a form.
2. **Never let a Flow assert allergen-safety.** No screen, label, or confirmation copy may
   state or imply an item is safe for an allergy.
3. **"Pay in chat" ≠ safety-checked.** Never present Flow checkout as carrying the
   conversational safety net; it does not, by construction.
4. **MM-Lite is "aligned," not "cheaper."** Never claim a cost saving. Frame the benefit as
   *"Meta's testing indicates up to ~9% higher marketing delivery"* — not a promise.
5. **MM-Lite does not "reach everyone."** Meta selects/throttles recipients. Never claim
   full-list reach; never use it for transactional/urgent.
6. **Capacity "remaining" stays `est.`** MM-Lite sends still count against the ledger; the
   estimate remains an estimate, never authoritative.

---

## Bottom line

MM-Lite is a low-risk, no-cost-penalty **outbound** win to adopt when the campaigns rail is
built. Flows are architecturally attractive and money-truth already survives them cleanly —
but the **checkout use case is gated on giving the deterministic allergen gate a second home
at the Flow-endpoint boundary** (§3). Until then: pilot a non-food Flow; hold the
menu/checkout Flow.
