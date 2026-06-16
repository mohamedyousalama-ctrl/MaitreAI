# Conventions

The patterns to follow when changing MaitreAI. (Guardrails are in `AGENTS.md`;
this is the "how we build" companion.)

## Money & safety (the invariants)

- **Money/facts are computed by code, never the model.** Prices/line totals/fees/
  VAT/order totals are produced by the executor in `lib/ai/tools.ts` and the
  order-session/order-create helpers. If you add an order action, compute its money
  in the executor (reuse `recompute()`), not in a prompt or the model's output.
- **Unknown → ask or escalate, never invent.** Off-menu item / unknown zone returns
  an `is_error` tool result so the agent clarifies or hands off.
- **Confirm-before-write.** Agent actions that mutate tenant data (the admin agent's
  menu/zone/policy/tax edits) return a preview/diff and only write on an explicit
  confirm. Manager-only writes are enforced **server-side** (check the `members`
  role), not just in the UI.
- **Keep the Egyptian T1 safety eval green** for any change to prices/money/menu/
  agent behavior/prompt: `node scripts/eval-scenarios.mjs`, then restore the pilot
  `dialect` to `egyptian`.

## Adapter seams

New providers go behind the existing seams, selected by env, with a mock fallback:

- **LLM:** add to `lib/ai/llm/` and `getAdapter()`; register models/prices in
  `models.ts`. Never call a provider SDK directly from feature code — go through the
  adapter so the mock path keeps working with no keys.
- **STT:** add to `lib/ai/stt/` and the `mock | openai | groq` selector.
- **Payments:** keep provider specifics behind the checkout/`lib/db/payments` seam.

## Per-tenant config (no hardcoding)

Read tenant-specific behavior from the `restaurants` row, never hardcode:
`dialect` (egyptian|saudi), `currency` (defaults via `dialectProfile()` → ج.م / ر.س),
`agent_persona_name` (defaults كريم/خالد), `tax_mode`/`tax_rate`, `agent_mode`,
`is_open`. New tenants default Egypt-first (egyptian / ج.م).

## Truth-driven UI

Surface only what's real. No fake counts, fake "connected" badges, or fake live
dots — if data isn't present, show the honest empty/neutral state. (E.g. status
chips reflect the actual conversation owner/state; a location dot shows only when a
fresh point exists.)

## Migrations

- Plain SQL in `supabase/migrations/NNNN_short_name.sql`, **additive only**:
  `create table if not exists`, `add column if not exists` — never destructive drops/
  alters in a way that breaks existing rows.
- Enable RLS on new tables; members read/write their tenant via `is_member_of`;
  server writes go through the service-role client (bypasses RLS).
- End DDL with `notify pgrst, 'reload schema';` so PostgREST picks it up.
- Apply with `node scripts/db-apply.mjs supabase/migrations/00NN_name.sql`
  (Management API — direct Postgres pooler is blocked). Money columns stored as a
  tool-computed snapshot; the model never writes them.

## Feature-flag pattern

- Define flags in `lib/feature-flags.ts` as `process.env.NEXT_PUBLIC_* === "true"`,
  **default OFF**, readable on client + server.
- Gate the flag at every surface (nav entry, route guard/redirect, API 404, and any
  hook) so the feature is fully inert when off — existing flows must not change.
- Keep the code in the tree (hide, don't delete); flipping the env var (+ redeploy)
  re-enables it in one change. Examples: `ENABLE_ADMIN_CHAT_CONSOLE`,
  `ENABLE_DELIVERY_TRACKING` (delivery PR).

## Naming & structure

- Server-only modules start with `import "server-only";`. Route handlers set
  `export const runtime = "nodejs"`; polled GET routes add
  `export const dynamic = "force-dynamic"`.
- Shared orchestration lives in `lib/*` so HTTP routes and the WhatsApp bridge run
  the **same** path (no drift) — e.g. `runCustomerTurn` is the single Brain turn.
- Arabic UI copy follows the project's terminology (warm-hospitality, RTL).

## Branch / PR workflow

- `main` = production (maitre.chat, Vercel). **Never push to `main`**, never
  force-push it. Develop on a feature branch; open a **draft PR**; stack dependent
  work (PR base = the branch it builds on) and rebase to keep the stack current.
- Verify before commit: `npx tsc --noEmit` and `npm run build` clean; for
  agent/money changes, the eval. State what you couldn't verify.
- Commits/PRs carry the Co-Authored-By + session trailer; **no secret values** in
  commits, code, or docs.

## Work-order style

Larger tasks arrive as structured work orders (ground rules → what to build →
acceptance). Treat the **acceptance list as the definition of done** and prove each
item (the `scripts/proof-*.mjs` harnesses are the pattern — drive the real path,
assert, then clean up test rows so production data is left as found).
