# Analytics SQL

This folder holds checked-in, repeatable analytics queries for Kivo/MaitreAI. They are read-only artifacts for measuring behavior from existing production tables.

## Deflection Metrics

Use `deflection-metrics.sql` to measure the Week-1/Week-2 orchestration roadmap numbers from existing `agent_runs`, `conversation_signals`, and `orders` rows.

How to run:

1. Open the file in the Supabase SQL editor, or run it through `psql`.
2. In the `params` CTE at the top of the query you want, replace:
   - `restaurant_id` with the tenant UUID.
   - `start_at` with the inclusive window start.
   - `end_at` with the exclusive window end.
3. Run one metric block at a time.

The queries are intentionally tenant-parameterized. They should not be hardcoded to Wesaya or any other restaurant.

## How To Read The Numbers

Deflection rate:
This is `agent_runs.model = 'deterministic_goal_interpreter'` divided by all `trigger = 'customer'` turns in the window. `voice` and `image_perception` triggers are separate rails and are intentionally excluded from this denominator.

Deflection breakdown:
This joins the short-circuited run to the nearby `conversation_signals.detail` row where `detail->>'reason' = 'goal_clarify'`, then groups by `detail->>'kind'`. The important Week-2 bucket is `unclear`, because that is where weak perception reads have been creating needless deflections.

Turn-tax / recovery:
This uses `lead()` over each conversation's customer turns. A short-circuit followed by a real model turn means the customer rephrased and got through anyway. A short-circuit followed by another short-circuit is a double-deflection loop. No next turn in the window is reported as possible abandonment.

Cost per completed order:
This divides total `agent_runs.cost_usd` by orders that reached the restaurant system in the same window. For the current launch stage, the editable completed-order predicate includes `pending_confirmation` because those are placed orders awaiting restaurant action. Tighten that predicate later if the business question changes to delivered-only economics.

Cost caveat:
`agent_runs.cost_usd` does not currently price `cache_creation_tokens`, so cost-per-order is a lower bound when prompt-cache writes are active. The query surfaces `cache_creation_tokens_unpriced` so the understatement is visible.

Latency:
The p50/p95 latency query reports `agent_runs.latency_ms` for `trigger = 'customer'` turns only. Use it to verify orchestration changes do not buy lower deflection at an unacceptable speed cost.
