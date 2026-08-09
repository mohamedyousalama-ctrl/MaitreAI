# Kivo Unit-Economics Evidence Register — Saudi Interview and Egypt Collection Standard

**Status:** PROVISIONAL EVIDENCE — USER-REPORTED / UNVERIFIED<br>
**Record date:** 9 August 2026<br>
**Owner:** Mohamed Salama<br>
**Business-development collector:** Bahaa<br>
**Product boundary:** Karim V1 — Egyptian-Arabic WhatsApp conversation, grounded order, explicit customer confirmation, restaurant acceptance/rejection and one correct-branch printed ticket<br>

This register preserves one restaurant-owner interview and the calculations, KPI definitions and evidence-collection rules derived from it. It is not an approved price, financial forecast, implementation instruction, production result, pilot result or claim that Kivo replaces any number of employees.

## 1. Evidence rules

1. Interview statements remain **USER-REPORTED / UNVERIFIED** until matched to source records for the same period.
2. Calculated values are arithmetic consequences of stated inputs and assumptions; they do not verify the inputs.
3. One restaurant is evidence that the operating pattern may exist, not a market benchmark.
4. Calls and WhatsApp must be measured separately. Karim V1 addresses WhatsApp order conversations, not telephone calls.
5. Recovered revenue must be valued using contribution profit, not gross order value.
6. A salary is not the complete labor cost. Employer contributions, benefits, overtime, management, telecom, software and facilities must be collected separately.
7. No customer personal data or message contents are required. Bahaa collects aggregated operational and financial data only.
8. Any discrepancy between sources is recorded; the more attractive number must not be selected silently.

## 2. Saudi restaurant interview — raw inputs

| Field | Reported value | Evidence state | Missing proof |
|---|---:|---|---|
| Call-center agents | 9 | USER-REPORTED / UNVERIFIED | Staffing roster and shifts |
| Average base salary | SAR 5,500 per agent/month | USER-REPORTED / UNVERIFIED | Payroll summary; fully loaded cost |
| Average daily orders received by the team | About 80 | USER-REPORTED / UNVERIFIED | POS/order export; channel split; date range |
| Average order value | SAR 200 | USER-REPORTED / UNVERIFIED | POS/order export for the same period |
| Operating days represented | Not stated | ABSENT | Calendar and opening days |
| Telephone-versus-WhatsApp order share | Not stated | ABSENT | PBX and WhatsApp/BSP reports |
| Non-order workload | Not stated | ABSENT | Inquiry, complaint and support workload |
| Orders missed before capture | Not stated | ABSENT | PBX abandon data and WhatsApp response data |

## 3. Derived baseline — arithmetic only

### 3.1 Thirty-day planning assumption

| Measure | Formula | Result |
|---|---|---:|
| Monthly base-salary bill | 9 × SAR 5,500 | SAR 49,500 |
| Orders/month | 80 × 30 | 2,400 |
| Gross order value/day | 80 × SAR 200 | SAR 16,000 |
| Gross order value/month | 2,400 × SAR 200 | SAR 480,000 |
| Base salary/order | SAR 49,500 ÷ 2,400 | SAR 20.63 |
| Base salary/gross order value | SAR 49,500 ÷ SAR 480,000 | 10.31% |
| Orders/agent/day | 80 ÷ 9 | 8.89 |

### 3.2 Twenty-six-operating-day sensitivity

| Measure | Formula | Result |
|---|---|---:|
| Orders/month | 80 × 26 | 2,080 |
| Gross order value/month | 2,080 × SAR 200 | SAR 416,000 |
| Base salary/order | SAR 49,500 ÷ 2,080 | SAR 23.80 |
| Base salary/gross order value | SAR 49,500 ÷ SAR 416,000 | 11.90% |

These two views show why the interview period and operating-day count are mandatory. Neither view is accepted restaurant performance.

## 4. Kivo-addressable boundary

The reported 80 orders/day cannot be used directly as Kivo volume until it is split by channel and intent.

```text
Kivo-addressable volume
= unique eligible WhatsApp order-intent conversations
- test/spam/duplicate conversations
- support, complaint, job and non-order conversations
```

The nine employees may handle calls, inquiries, complaints, shift coverage and management tasks. Therefore this register does not claim Kivo can remove nine roles. Value must be evidenced as hours or full-time-equivalent capacity avoided, redeployed or made available, plus contribution profit from genuinely recovered orders and verified error savings.

## 5. Merchant-value model

```text
Monthly merchant value
= verified labor cost avoided or redeployed
+ contribution profit from recovered orders
+ verified error, cancellation and refund savings
- added operating burden caused by Kivo
```

```text
Gross value multiple = monthly merchant value ÷ monthly Kivo fee
Net ROI = (monthly merchant value - monthly Kivo fee) ÷ monthly Kivo fee
```

Do not multiply recovered orders by average order value. Use:

```text
Recovered-order value = recovered correctly accepted orders × contribution profit per fulfilled order
```

### 5.1 Provisional SAR 1,900/month scenario — not a price decision

This scenario preserves an earlier planning hypothesis only. It neither approves SAR 1,900 nor commits Kivo to a package.

| Scenario | Gross labor benefit | Gross value multiple | Net monthly benefit | Maximum fee at 3× gross value |
|---|---:|---:|---:|---:|
| One SAR 5,500 FTE equivalent | SAR 5,500 | 2.89× | SAR 3,600 | SAR 1,833.33 |
| Two FTE equivalents | SAR 11,000 | 5.79× | SAR 9,100 | SAR 3,666.67 |
| Three FTE equivalents | SAR 16,500 | 8.68× | SAR 14,600 | SAR 5,500.00 |

At 2,400 correctly accepted orders/month, SAR 1,900 is SAR 0.79/order and 0.40% of the reported gross order value. These ratios are scenarios, not evidence that all 2,400 orders are WhatsApp-addressable or correctly accepted by Kivo.

## 6. Kivo unit economics and cost-per-order

### 6.1 Required denominator

```text
AI cost per correctly accepted order
= total AI spend for all eligible order-intent conversations,
   including conversations that did not convert,
÷ correctly accepted orders
```

```text
Total variable platform cost per correctly accepted order
= AI + WhatsApp/BSP + hosting + monitoring + variable support
÷ correctly accepted orders
```

Counting only successful conversations understates cost and is forbidden.

### 6.2 Current source truth

At repository baseline `fadfb844c0d02e9dcbb929ffc73931d441f3427e`, the real customer-agent adapter defaults to Claude Sonnet 4.6 when an Anthropic key is configured and otherwise uses the mock adapter. The model remains environment-overridable. The repository price registry records Sonnet 4.6 at USD 3/million input tokens and USD 15/million output tokens, with prompt-cache read and write prices recorded separately. Conversation-intelligence, perception and image defaults use Haiku 4.5 pricing in that registry.

Evidence: [`lib/ai/llm/models.ts`](https://github.com/mohamedyousalama-ctrl/MaitreAI/blob/fadfb844c0d02e9dcbb929ffc73931d441f3427e/lib/ai/llm/models.ts) and [Anthropic pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing).

The repository already calculates token-category cost, but no accepted production ledger currently proves Kivo's average AI cost per eligible conversation or correctly accepted order. `FIN-UNIT-001` must obtain that distribution, including non-converters, retries, tool loops, failures, cache usage and model overrides.

### 6.3 WhatsApp cost boundary

Meta's current published model charges per delivered template message. Service messages within the customer-service window and utility messages sent in response to the user are described as free, while BSP markup and outside-window template costs may still apply. The prior SAR 0.25/order assumption is therefore a hypothesis requiring the actual BSP contract, rate card, conversation mix and delivered-message evidence.

Evidence: [WhatsApp Business Platform pricing](https://whatsappbusiness.com/products/platform-pricing/).

### 6.4 Gross-margin sensitivity — provisional only

Using the unapproved SAR 1,900/month scenario, 2,400 correctly accepted orders and a provisional SAR 120/month support allocation, before BSP, hosting and other omitted costs:

| AI cost/order | Monthly modeled COGS | Modeled gross margin |
|---:|---:|---:|
| SAR 0.10 | SAR 360 | 81.05% |
| SAR 0.20 | SAR 600 | 68.42% |
| SAR 0.30 | SAR 840 | 55.79% |
| SAR 0.40 | SAR 1,080 | 43.16% |

A 70% gross-margin target at SAR 1,900 allows total variable COGS of at most SAR 570/month, or SAR 0.2375 per correctly accepted order at 2,400 orders. This is a constraint test, not a forecast.

## 7. KPI dictionary

### 7.1 Primary commercial conversion KPI

**Correctly Accepted Order Conversion Rate (CAOCR)**

```text
CAOCR
= correctly accepted orders
÷ unique eligible order-intent conversations
× 100
```

The denominator excludes support, complaints, jobs, spam, tests and duplicate conversations. It does not include every inbound conversation.

A correctly accepted order requires all of the following:

- correct items, quantities and modifiers;
- deterministic server-owned price;
- explicit customer confirmation of the current order version;
- restaurant acceptance;
- no duplicate customer effect;
- exactly one correct-branch printed ticket;
- no immediate material correction.

### 7.2 Primary efficiency KPI

**Correctly accepted orders per operator-attention hour** measures whether Karim increases real operator capacity without hiding errors.

### 7.3 Supporting order funnel

- meaningful first-response rate;
- draft creation rate;
- current-version customer confirmation rate;
- restaurant acceptance rate;
- correct print success rate;
- post-confirmation material correction rate;
- duplicate customer-effect rate;
- cancellation rate and reason.

### 7.4 Missed telephone demand

**Call abandonment rate**

```text
eligible callers disconnecting before answer
÷ eligible calls offered
× 100
```

The report must state whether repeat calls and calls below a declared short-abandon threshold are excluded. The same rule must be used across periods.

### 7.5 Missed WhatsApp demand

**First-response SLA breach rate**

```text
eligible inbound conversations without a meaningful reply inside the declared SLA
÷ eligible inbound conversations
× 100
```

Collect the number receiving no meaningful response within 1, 5 and 15 minutes and within 24 hours, plus customers who sent a second message before any meaningful response. An automated acknowledgement is not a meaningful response. Calls and WhatsApp must never be combined into one missed-contact rate.

## 8. Bahaa's simple interview and evidence checklist

Use one complete 30-day period where possible. Use exactly the same dates across every source.

### A. Restaurant and period

- [ ] Restaurant and branch names
- [ ] Exact start/end dates and number of operating days
- [ ] Opening hours, call-center hours and peak periods
- [ ] Order channels: telephone, WhatsApp, aggregators, website, walk-in
- [ ] Which channels are included in the reported order count

### B. People and fully loaded cost

- [ ] Agents scheduled per shift and total unique agents
- [ ] Base salary per agent
- [ ] Manager/supervisor cost
- [ ] Overtime, bonuses, benefits and employer costs
- [ ] Total staffed hours
- [ ] Estimated time split: orders, support, complaints and other tasks
- [ ] Current vacancies or planned hiring

### C. Demand and missed contacts

- [ ] Calls offered, answered and abandoned
- [ ] Average/median answer time and declared short-abandon rule
- [ ] Unique WhatsApp conversations
- [ ] Unique eligible WhatsApp order-intent conversations
- [ ] Conversations with no meaningful reply within 1, 5 and 15 minutes and 24 hours
- [ ] Customers sending a second message before the first meaningful reply
- [ ] Demand arriving outside staffed hours

### D. Order funnel and quality

- [ ] Eligible order intents
- [ ] Order drafts created
- [ ] Customer-confirmed orders
- [ ] Restaurant-accepted orders
- [ ] Fulfilled orders
- [ ] Cancelled orders and reasons
- [ ] Duplicate orders/customer effects
- [ ] Material corrections after confirmation
- [ ] Printer failures, duplicate tickets and wrong-branch tickets

### E. Financial inputs

- [ ] Average order value from the same export
- [ ] Direct-order gross value
- [ ] Food and packaging cost or contribution profit per fulfilled order
- [ ] Discounts, refunds and cancellations
- [ ] Delivery, channel and payment commissions
- [ ] Call-center, telephony, inbox/BSP and order-software costs

### F. Required source evidence

- [ ] POS/order export
- [ ] PBX/call-center report
- [ ] WhatsApp inbox or BSP export
- [ ] Payroll/staffing summary
- [ ] Manager interview notes
- [ ] Source owner, export time and date range recorded

**Acceptance rule:** use at least two independent sources for each merchant, preferably three. Begin with at least two restaurants for corroboration and extend collection across the five target merchants. Record discrepancies openly.

## 9. Evidence gates and living commercial backlog

| ID | Work | Exit evidence | State |
|---|---|---|---|
| `COM-EVID-001` | Corroborate the Saudi interview | Same-period staffing/payroll, POS/order and channel evidence; discrepancies resolved or retained explicitly | OPEN |
| `COM-EVID-002` | Collect comparable Egyptian merchant baselines | At least two restaurants with two independent sources each; then all five pilot targets | OPEN |
| `FIN-UNIT-001` | Measure actual Kivo AI usage | Token/cost distribution per eligible conversation and correctly accepted order, including non-converters and failures | BLOCKED pending live evidence path |
| `FIN-BSP-001` | Verify WhatsApp/BSP cost | Signed rate card/contract, markup and measured message-category mix | OPEN |
| `FIN-MARGIN-001` | Measure merchant contribution profit/order | Same-period order revenue, direct variable costs, discounts, refunds and cancellations | OPEN |
| `FIN-PRICE-001` | Decide Kivo price/package | Founder-approved price after merchant value, platform cost, ROI and sensitivity evidence | BLOCKED by the four evidence items above |

Commercial evidence collection may run in parallel with the governed technical sequence. It does not close or bypass any technical blocker and does not authorize product implementation.

## 10. Governance boundary

This record authorizes documentation and aggregated evidence collection only. It authorizes no price, contract term, code, model change, SQL, migration, database or production access, deployment, Meta/WhatsApp configuration, printer mechanism, customer contact, pilot launch or claim of savings. The authoritative technical ordering in `docs/KIVO_AGENT_ROADMAP.md` remains unchanged. Pilot remains **NO-GO**.
