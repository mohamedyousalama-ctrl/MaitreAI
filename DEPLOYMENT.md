# MaitreAI — Vercel Deployment Guide

Deploys the current Sprint 6 app (mock AI, mock payment, WhatsApp **test mode**).
No database, no real WhatsApp/payment/AI. This is a deployment + smoke-test only.

## Why no `vercel.json`?
This is a standard **Next.js 14 (App Router)** app. Vercel auto-detects the
framework, build command (`next build`), and output. A `vercel.json` is **not
needed** and is intentionally omitted to avoid misconfiguration.

## 1. Connect the repo to Vercel
1. Go to https://vercel.com/new
2. Import the GitHub repo `mohamedyousalama-ctrl/MaitreAI`.
3. Framework preset: **Next.js** (auto-detected). Leave build/output defaults.
4. Set the **Production Branch** to the branch you want to deploy
   (the merged default, e.g. `claude/busy-dijkstra-htxxM`, or `main` after you
   merge). Make sure the deployment-prep commit from this sprint is included.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)
Add these for the initial deploy. **Use safe test values only.**

| Name | Value | Notes |
|------|-------|-------|
| `WHATSAPP_VERIFY_TOKEN` | `test` | Enables the webhook GET handshake to echo the challenge. |
| `NEXT_PUBLIC_APP_ENV` | `development` | App environment label (safe, public). |

Do **NOT** set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, or
`WHATSAPP_APP_SECRET` yet. Leaving them unset keeps the app in **test mode** —
no real WhatsApp message is ever sent.

## 3. Deploy
Click **Deploy**. Vercel installs deps, runs `next build`, and serves the app.
Every push to the production branch will auto-redeploy.

## 4. Production smoke test
Replace `<URL>` with your deployment URL.

Pages (expect HTTP 200, Arabic RTL):
- `<URL>/dashboard`
- `<URL>/conversations`
- `<URL>/orders`
- `<URL>/kitchen`
- `<URL>/menu`
- `<URL>/restaurant-brain`
- `<URL>/settings`
- `<URL>/settings/messaging-test`

API:
- `<URL>/api/channels/whatsapp/status`
  → `{"channel":"whatsapp","configured":false,"mode":"test"|"not_configured","checks":{...}}`
  (booleans only — never the token)
- Webhook GET verification:
  `<URL>/api/channels/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test&hub.challenge=12345`
  → responds with exactly `12345` (text/plain) when `WHATSAPP_VERIFY_TOKEN=test`.

Checkout (renders full-screen, no app shell): create a payment link from a
conversation in the app, then open the generated `/checkout/<sessionId>` URL.

## 5. What is still local/mock after this deploy
- AI engine: local rule-based mock (no real AI API)
- Payments: mock checkout (no real provider)
- WhatsApp: **test mode** (adapter prepared; no real send)
- Data: browser localStorage / Zustand (no database)

Real WhatsApp + database (Supabase) are **Sprint 7**, not part of this deploy.

---

# Sprint 7 — Supabase, Auth, Multi-tenant (Pass 1)

> **Env-gated.** With no Supabase env vars the app stays in **DEMO MODE**
> (localStorage, no login) and everything above still works. Setting the vars
> activates auth + multi-tenant. **Pass 1 delivers: schema + RLS + seed, auth,
> login, middleware, sign-out.** Pass 2 moves the stores onto Supabase and
> persists the webhook.

## A. Create the project
1. Create a project at https://supabase.com.
2. Project Settings → API: copy the **Project URL**, **anon public key**, and
   **service_role key** (the service role is secret).

## B. Migrations

**This document does not apply migrations, and following it never will.**
Applying a migration to any Kivo database is a founder-approved ceremony, not a
deployment step. The only approved procedure is the governed migration ceremony
in [`docs/KIVO_AGENT_ROADMAP.md`](docs/KIVO_AGENT_ROADMAP.md) §12.3. See also
[`supabase/migrations/README.md`](supabase/migrations/README.md).

### Prohibited

- **Never** run `supabase db push` from this project repository.
- **Never** use `supabase db push` as a broad replay, or against unmatched
  historical files.
- **Never** replay a historical migration file, or any historical subset of
  `supabase/migrations/`.
- **Never** paste the historical migration set into the Supabase SQL Editor.
- **Never** use migration repair.
- **Never** re-apply a migration that is already applied.

### The only permitted use of `supabase db push`

Inside the founder-approved §12.3 **isolated CLI workspace**, and only after all
of the following hold:

1. the remote timestamped history has been fetched;
2. the dry run proves **exactly one** approved migration is pending;
3. its bytes and hash match the founder-approved artefact; and
4. the founder authorises application.

Migration `0104_safety_ingress_evidence` was applied through exactly this
governed procedure.

### Application is not historical replay

Applying exactly one new, approved execution file through §12.3 is an
**application**. It is not a replay. The replay prohibition above covers
historical migration files and historical subsets of the directory — never the
single new approved execution file that the ceremony produces.

### Repository files versus the production ledger

The repository holds migration files under `supabase/migrations/`, named with
four-digit **logical labels**. The production database holds rows in
`supabase_migrations.schema_migrations`, versioned by **14-digit execution
versions**. The two sets are not in one-to-one correspondence, and the counts
differ.

The production ledger uses 14-digit execution versions. Its names are
historically inconsistent: some retain a four-digit logical prefix
(`0104_safety_ingress_evidence`), some do not (`brain_execution_substrate`), and
some carry the label as a suffix (`cod_settlement_atomic_0092`). Therefore ledger
names cannot reliably be derived from repository filenames. **The four-digit
repository label is not the execution version.**

A repository file records approved DDL. A ledger row records application. The
ledger is the only authority on what has been applied. The absence of an
`.APPLIED.md` companion carries **no** information about whether a migration is
applied — most applied migrations predate that convention.

### Editing an applied migration

Applied migrations are immutable **unless a separate signed re-baseline records
the old hash, the new hash and the reason**. This matches
`supabase/migrations/README.md`; neither document permits a silent edit.

Migration `0104_safety_ingress_evidence` is additionally **byte-frozen**: it may
not be edited or re-applied. It is applied at ledger version `20260724034339`,
and its source is frozen to SHA-256
`560e060351c793990daa8f61bbdad95e998d508977e1610478881d7582c38b80`. Editing it —
even its stale `PREPARE-ONLY` header — would destroy the approved byte identity.
Re-running it would drop and recreate a foreign key (lines 163-170, revalidating
the table), rewrite seven function definitions, replace three triggers, reissue
the full privilege block, and request a PostgREST schema reload. Those are real
DDL operations, not a harmless no-op.

### A brand-new environment

No fresh-environment bootstrap procedure is approved. Standing up a brand-new
Kivo database requires a **separate founder-approved bootstrap plan** and a
**verified schema manifest**, produced and reviewed before any SQL is executed.
Until such a plan exists and is approved, there is no supported way to create a
new environment from this repository, and none of the prohibited actions above
may be used as a substitute.

## C. Configure auth
- **Email OTP** works out of the box. In Auth → Email templates, ensure the
  template includes the 6-digit token (`{{ .Token }}`) for the code flow on
  `/login`. Add `<URL>/auth/callback` to Auth → URL Configuration → Redirect URLs
  if you also use magic links.
- **Phone OTP** (preferred for MENA) requires an SMS provider (Twilio / MessageBird)
  configured in Auth → Providers → Phone. **Deferred (owner decision):** email OTP
  is sufficient for now; configuring the SMS provider is an explicit **prerequisite
  for the onboarding sprint** (self-serve signup). Until then, use email to sign in.

## D. Set env vars (local `.env.local` and Vercel)
| Name | Value | Scope |
|------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **server only — secret** |

Redeploy after setting them on Vercel.

## E. Seed a demo tenant (dev)
After you've signed in once (so an `auth.users` row exists), run in SQL Editor:
```sql
select public.seed_demo_restaurant('<your-auth-user-uuid>');
```
This provisions مطعم الذواقة owned by your user, with branches/menu/zones/policies/FAQ.

## F. Verifying Pass 1 acceptance
- Sign in at `<URL>/login` (email OTP) → redirected into the app; signing out
  (topbar) returns to `/login`.
- A signed-in user with **no** membership is sent to `/onboarding` (stub).
- Two different accounts only see their own `restaurant_id` rows (RLS) — verify
  in SQL Editor with `set role` / separate sessions, or once Pass 2 wires reads.
- `npm run build` is clean; demo mode (no env) still loads all pages.

## Pass 2 (next) — not in this change
- Replace localStorage stores with a Supabase data layer (`lib/db/*`) + realtime.
- Persist inbound WhatsApp messages in the webhook (idempotent on
  `channel_message_id`), upserting customer + conversation via the service role.
- Wire "استعادة الافتراضي" to the server-side re-seed.
