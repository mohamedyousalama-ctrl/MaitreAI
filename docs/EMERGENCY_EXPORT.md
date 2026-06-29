# Emergency tenant data export

A read-only, operator-run script to get one restaurant's critical data out of the
database — for disaster recovery, data portability (give a tenant their data), or a
pre-migration snapshot.

It is **a script, not an API endpoint** — there is no live export route (so no new
data-egress attack surface). It runs locally with the service-role key the operator
already controls.

## What it exports (one tenant, scoped by `restaurant_id`)

- **orders** — incl. line items (`orders.items` is a JSONB snapshot embedded per row)
- **customers** — names + phones
- **COD ledger** — `cod_collections`, `cod_settlements`
- **menu** — `menu_categories`, `menu_items`, `menu_item_variants`,
  `menu_item_choice_groups`, `menu_item_choice_options`, `modifiers`, `menu_item_modifiers`
- **conversations** + **messages**

Each table is written as both `<table>.json` and `<table>.csv`, plus a
`manifest.json` (tenant id/name, timestamp, per-table row counts).

## How to run

```bash
# 1. Load env (service-role key + Supabase URL) — same env the proof scripts use.
set -a; . ./.env.local; set +a

# 2. Run for a specific restaurant_id (UUID). Optional second arg = output dir
#    (default: ./exports).
node scripts/export-tenant-data.mjs <restaurant_id> [output_dir]
```

Output lands in `exports/export-<restaurant_id>-<timestamp>/`.

Required env (already in `.env.local` for anyone who runs the DB scripts):
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Safety properties

- **Read-only** — issues `GET` (SELECT) requests only via PostgREST. It never
  writes, updates, or deletes. Safe to run anytime, including against production.
- **Tenant-scoped** — every query is filtered `restaurant_id=eq.<id>`; it exports
  exactly one restaurant, with no cross-tenant leakage. A non-UUID id is rejected;
  an id with no matching restaurant exits non-zero and exports nothing.
- **No secrets logged** — the service-role key is read from env and never printed
  or written to the output.

## ⚠️ PII handling

The output contains **personally identifiable information** — customer names,
phone numbers, addresses, and full order/conversation history. Treat the export
directory as sensitive:

- Store it on encrypted/secure storage; don't commit it to git (the `exports/`
  directory is git-ignored) or paste it into chat/tickets.
- Share only over secure channels, with the minimum people who need it.
- **Delete it when it's no longer needed.**

## When to use

- **Disaster recovery** — pull a tenant's data out if you need a portable copy
  outside Supabase's own backups/PITR.
- **Data portability** — hand a restaurant a copy of their own data on request.
- **Pre-migration snapshot** — capture a point-in-time copy before a risky change.

For full-database point-in-time recovery, rely on Supabase's managed backups/PITR
(dashboard → Database → Backups) — this script is for targeted, per-tenant exports.
