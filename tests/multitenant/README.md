# Multi-tenant isolation & concurrency harness

Pre-launch hardening for the shared-DB, multi-tenant deployment. Verifies that
two tenants sharing one codebase + one Postgres can never read or corrupt each
other's data, and that concurrent traffic doesn't mix state, confuse creds, or
race the conversation lock.

## SAFETY (read first)

This harness performs **writes** (creates/deletes throwaway tenants, fires
concurrent edits). It is **safe-by-default** and will **refuse to run** when:

- `TEST_SUPABASE_URL` points at the production project ref (`zlighrbsjexrozrmuwpw`), or
- any tenant it would touch has a name/id matching the live tenants (Wesaya, Sweet Shop).

It only ever deletes rows for the disposable tenants it created itself (tracked
by id), under a `__ttest_` name prefix. It never issues a write whose
`restaurant_id` is not in its own created-set.

**Do NOT point this at production.** Per the team decision, run it against a
fresh / non-prod Supabase project.

## What you must provide (non-prod project)

```bash
export TEST_SUPABASE_URL="https://<your-test-ref>.supabase.co"
export TEST_SUPABASE_SERVICE_KEY="<service-role key of the TEST project>"
export TEST_SUPABASE_ANON_KEY="<anon/publishable key of the TEST project>"
# Optional — enables the HTTP suites (API-route + webhook tests). Point at an
# app instance whose env is bound to the SAME test project:
export TEST_APP_URL="http://localhost:3000"
# Optional — lets the webhook suite skip HMAC (the app must also run with
# WHATSAPP_SKIP_SIGNATURE=true and NODE_ENV!=production):
export TEST_WEBHOOK_SKIP_SIG="true"
```

The test project must already have the schema deployed (run the repo migrations
against it first: `supabase db push` or apply `supabase/migrations/*`).

## Run

```bash
node tests/multitenant/run.mjs            # all suites available for the given env
node tests/multitenant/run.mjs --keep     # don't tear down tenants (debug)
node tests/multitenant/run.mjs --only=isolation,concurrency
```

## Suites

| Suite        | Needs            | Checks |
|--------------|------------------|--------|
| `isolation`  | DB keys          | RLS: A's session cannot read/write B's orders, conversations, customers, messages, settings. |
| `cache`      | DB keys          | Interleaved `loadBrain`-shaped reads for A & B never bleed menus. |
| `lock`       | DB keys          | `conversation_locks` mutex correctness + the anon-tamper exposure. |
| `concurrency`| DB keys          | Concurrent edits to one order/conversation; concurrent menu publish → consistent state. |
| `api`        | DB keys + APP_URL| Calls deployed routes with A's auth against B's `restaurant_id` → must be denied. |
| `webhook`    | DB keys + APP_URL| Inbound for A vs B stored under correct tenant; **no-match inbound must NOT misroute** to a default tenant. |

Exit code is non-zero if any test fails.
