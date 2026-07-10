# ADR-0002 — Verified-data discipline

> **Owner:** PM + Engineering · **Status:** Accepted (standing law) · **Last reviewed:** 2026-07-10

## Context

Kivo uses AI to extract and infer data all over the product: reading a menu from a photo
or PDF during onboarding, extracting a restaurant's details, inferring allergens or
ingredients, classifying intent, summarizing a conversation. AI extraction is fast and
useful — but it is also fallible, and some of this data is safety- or money-critical. If
AI-produced data silently becomes operational truth, a hallucinated allergen, a
mis-read price, or an invented menu item can reach a real customer. That is exactly the
failure mode Kivo cannot ship.

## Decision

**AI-extracted or AI-inferred data NEVER becomes operational truth without human
confirmation.**

- Anything a model extracts or infers enters the system as a **proposal / draft**, not as
  live canonical state.
- A human must confirm it before it can drive a customer-facing decision. This applies to
  (non-exhaustively): **allergy/allergen data**, **menu imports** (photo/PDF/text →
  items, prices, modifiers), and **onboarding extraction** (restaurant profile, hours,
  zones).
- Until confirmed, the agent must not present the unverified data as fact. Where safety is
  involved, the deterministic gate holds and escalates rather than asserting safety from
  unverified data (this ADR is the data-side companion to ADR-0001's "safety is
  deterministic").

## Consequences

- Onboarding and menu-import flows are **review-then-publish**: extraction produces a
  draft a human edits and approves; approval is the moment it becomes truth.
- Allergen/safety data is never trusted just because a model produced it; an unverified
  claim triggers a hold + human confirmation, never a confident answer.
- New AI-extraction features must ship with a human-confirmation step by design — "the
  model filled it in" is not an accepted source of operational truth.
- This is a **standing law**: it applies to every current and future extraction/inference
  path, not only the ones listed above.
