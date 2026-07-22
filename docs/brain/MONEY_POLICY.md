# BRAIN Money Policy

## Integer Minor Units

All BRAIN money fields use integer minor units, stored as `bigint` in Postgres and represented by trusted money types in TypeScript. The BRAIN never stores committed money as float, decimal-with-scale, localized strings, or LLM-authored arithmetic.

Examples:

- SAR 10.50 is stored as `1050`.
- EGP 25.00 is stored as `2500`.
- Customer-visible formatting is a renderer concern after validation.

## Immutable Order Quote

`order_quote` is the only source allowed to bridge a draft order to a committed order. A quote captures line items, catalog/availability snapshot, currency, total minor units, expiry, and the episode revision that produced it.

Quotes are append-only by concept. If cart, catalog, availability, fees, discounts, tax, fulfillment, delivery zone, or episode revision changes, code creates a new quote rather than mutating the old quote.

## Confirm To Commit Revalidation

Before commit, code must revalidate all of the following inside the transaction:

- The customer confirmed the exact quote id.
- The quote is not expired.
- The quote total and line totals still match deterministic pricing.
- The catalog and availability snapshot is still valid.
- The fulfillment, delivery fee, tax, and discount assumptions still apply.
- The episode revision has not changed since the quote was created.
- The episode is still AI-owned or otherwise authorized for BRAIN commit.

Any mismatch blocks commit and forces a refreshed quote or human handoff.

## No Math In Prompts

Prompts may request interpretation of customer language, but they may not ask the LLM to compute subtotals, delivery fees, discounts, tax, or totals. Customer-facing money text must come from trusted renderer inputs, never from model free text.
