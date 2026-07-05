# Persona layers (`lib/ai/personas/`)

**One engine, many voices.** A *persona* is a **prompt-level overlay** on the single customer-
agent engine (`lib/ai/prompt.ts`). It changes the agent's **voice and hospitality texture** —
never a fact, price, availability, allergen, working hour, escalation rule, or money
computation. Those are owned by the one engine prompt and the one deterministic safety gate
(`lib/ai/allergen-gate.ts`), and they are identical for every persona.

## The contract every persona layer must keep

1. **Voice, never facts.** A persona overlay may add identity, register, warmth, cultural
   fluency, and hospitality behaviours. It must **not** restate, relax, or contradict any
   engine guardrail. Where it touches truth/safety/money, it only *reinforces* the engine
   rule in the persona's own voice and **defers** to it.
2. **Menu truth wins.** Any pairing/recommendation the persona knows about (from a market
   knowledge pack like `/knowledge/ksa/`) may only be offered when it resolves to a **real
   tenant menu item**. Market knowledge ≠ menu truth. Never invent an item.
3. **Money = engine.** No persona ever states or computes money in prose; totals come only
   from the order tools.
4. **Safety = the gate.** The deterministic allergen gate is universal and persona-agnostic.
   Hospitality/karam never softens a safety escalation.
5. **Pure + flag-gated.** A persona module is a pure leaf (no I/O). It is injected only when
   the tenant's persona flag is ON (e.g. `khalid_persona`, default OFF), selected by tenant
   market/persona config (0012 pattern). Default behaviour is byte-identical to no overlay.

## Personas in this repo

| id | name | market | region setting | flag | default |
|---|---|---|---|---|---|
| `khalid_najdi` | خالد النجدي | KSA | `najd` \| `hijaz` \| `asir` \| `eastern` | `khalid_persona` | **OFF** |

Karim (Egypt) is the engine's built-in default voice (`prompt.ts`); Khalid is the first
extracted persona LAYER and the template for future ones.

## Wiring status

`khalid.ts` is a **pure content/logic leaf, imported by nothing yet** — exactly how
`allergen-vocab.ts` landed before its gate wiring. The injection point (append
`buildKhalidPersonaLayer(...)` to the engine prompt when `khalid_persona` is on) and the
config shape are documented in `docs/KHALID_PERSONA_WIRING.md` and land as a separate,
reviewed wiring PR with the Core window. No schema change is expected.
