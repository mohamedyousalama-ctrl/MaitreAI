# ADR-0001 — Backend-first truth

> **Owner:** PM + Engineering · **Status:** Accepted (ratified meta-law) · **Last reviewed:** 2026-07-10

## Context

Kivo's product is experienced through WhatsApp: a customer chats with the agent
(«كريم»/«خالد») in natural Arabic, and staff act from the operator console. It is
tempting to let the conversation itself become the system of record — to let the agent
"decide" a price, quote a delivery fee, confirm an item is available, or treat a chat
message as the authoritative edit to a setting. That path produces drift: two customers
get two different prices, the model hallucinates a zone or an allergen-safe dish, and the
dashboard and the chat disagree about what is true. For a business handling money, menus,
and safety, that is unacceptable.

## Decision

**Kivo is WhatsApp-first in experience, backend-first in truth.**

- **Canonical state lives in the backend.** Payment availability, prices, menu and
  item availability, delivery zones and fees, operating hours, and safety flags all
  resolve through canonical backend state — never from whatever the model "thinks."
- **The agent phrases, it never decides.** The agent's job is to understand the
  customer and phrase the answer that canonical state already determines. It does not
  set prices, invent availability, or certify safety.
- **Chat commands are change-requests, not direct writes.** When staff (or a customer
  flow) express a change in chat, that is a change-request against the **same canonical
  settings the dashboard edits** — validated and applied through the same path, so chat
  and dashboard can never diverge.
- **Money is engine-computed.** Order totals, fees, and tax come from the pricing/order
  engine against canonical data, not from model arithmetic in prose.
- **Safety is deterministic.** Allergen/safety holds are decided by deterministic gates
  against verified data, not by the model's phrasing (see ADR-0002).

## Consequences

- Every customer-facing number or fact must trace to a canonical backend source; if the
  backend cannot answer, the agent asks or escalates — it does not guess.
- The agent layer stays a **presentation and understanding** layer. New capabilities are
  built by extending canonical state + engine logic first, then teaching the agent to
  phrase them.
- Chat and dashboard share one validated settings path, so there is one source of truth
  and one audit trail.
- Guardrails that catch the model asserting money/availability/safety it did not get
  from a tool are load-bearing, not optional — they enforce this ADR at runtime.
- This is a **meta-law**: other decisions inherit it. When a feature blurs the line
  ("can the agent just decide X?"), the answer defaults to no — X resolves in the backend.
