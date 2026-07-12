# ADR-0003 — One brain, two skins (persona architecture)

> **Owner:** PM + Engineering · **Status:** Accepted (standing law) · **Ratified:** 2026-07-12 (owner)

## Context

Kivo serves more than one market from one codebase: **Karim** (Egypt) today, **Khalid**
(Saudi Arabia) next, and per-tenant personalities on top of each. The risk is drift — two
parallel agents whose safety, ordering, delivery, payment, and honesty logic slowly
diverge, so a fix proven for one market silently fails to reach the other (or, worse, a
safety guarantee holds for Karim but not Khalid). Equally, a careless "shared everything"
approach would smuggle market-specific dialect, currency, or regulatory assumptions into
the core where they don't belong.

## Decision

**One shared behavioral core, thin per-market skins, a per-tenant personality layer on
top.**

- **The core (shared by every persona):** safety (the allergen gate + companion
  contract), ordering, delivery, payments, honesty, hospitality, and media disposal.
  These behave the same for everyone. A change here is a change for *all* personas.
- **The market layer (thin, per-persona):** only what genuinely differs by market.
  - **Karim — Egypt:** Egyptian dialect · `ج.م` · Arabic-Indic numerals · EG food
    vocabulary · COD / Vodafone Cash / Instapay · ETA e-invoicing (later).
  - **Khalid — Saudi Arabia:** Saudi dialect + voice · `ر.س` · the KSA encyclopedia ·
    mada / Moyasar · ZATCA e-invoicing (later).
- **The personality layer (per-tenant):** tone/persona overlays applied on top, tenant by
  tenant, without touching either the core or the market layer.

## Consequences

- **Core changes ship to both personas by default.** They are not opt-in per market; the
  default is universal reach, so a safety or correctness fix cannot land for one market
  and miss the other.
- **The Khalid golden snapshot updates VISIBLY and intentionally — never silently.** When
  a core change legitimately alters Khalid's prompt, the snapshot diff is reviewed and
  updated as a deliberate, reviewed act. A silent snapshot drift is a defect, not a pass.
- **Persona / dialect changes are their own WOs.** Market-layer work (a dialect fix, a
  currency detail, a KSA-specific rule) is scoped and reviewed as persona work — **never
  smuggled into a core-work WO**, and never the reverse.
- This is a **standing law**: it governs every current and future persona, market layer,
  and per-tenant overlay, alongside ADR-0001 (backend-first truth) and ADR-0002
  (verified-data discipline).
