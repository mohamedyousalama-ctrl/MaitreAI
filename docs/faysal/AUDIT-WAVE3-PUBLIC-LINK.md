# Faysal — Wave 3 audit: making the demo link short, clean and permanent

**Scope.** Everything needed to put a permanent URL in front of a clinic manager
instead of a preview URL with a ~23-hour `_vercel_share` token.

**Verdicts.** Reviewer: **approve** (after one reject and seven findings, all closed
in `66db923`). Auditor: **reject the Vercel settings change; approve the code.**

---

## 1. What shipped

`133d4de` + `66db923`. Two hostnames — `faysal.maitre.chat`, `faysal.getkivo.io` —
map to `{kind: "faysal"}` in `lib/domains.ts`. On those hosts the deployment serves:

| path | behaviour |
|---|---|
| `/` | rewrite → `/faysal`, with `x-robots-tag: noindex, nofollow, nocache` |
| `/faysal` | 307 → `/`, query string dropped |
| `/api/faysal/turn`, `/api/faysal/reset` | pass through |
| `/robots.txt` | `Disallow: /` |
| everything else | hard 404, noindex, no-store |

`scripts/proof-faysal-host.test.ts` — 829 assertions, ten mutations caught. The
forbidden-path list is derived by walking `app/**`, so it cannot drift.

---

## 2. The decision NOT taken, and why

The plan was to disable Vercel Authentication project-wide, because a custom
domain attached to a **git branch** lives in the Preview environment and Vercel's
Standard Protection exempts only **production** domains.

The auditor rejected that, and found two facts that were not in evidence when the
plan was written:

1. **The GitHub repository is public.** Two unauthenticated API calls
   (`/repos/.../deployments/<id>/statuses`) enumerate every preview deployment
   this project has ever made. Preview URLs are not obscure.
2. **Preview and production share one Supabase project** (`zlighrbsjexrozrmuwpw`).
   The auditor proved it: a POST to the preview's `/api/faysal/turn` moved
   `demo_usage_counters` bucket `faysal:2026-09-10` from 76 → 77 in the same
   database holding the live restaurants, orders and conversations. Preview
   therefore holds the real service-role key, `CRON_SECRET`, and model keys.

Vercel also warns that disabling authentication "renders all existing deployments
unprotected", and that on re-enabling, previously-logged-in users keep access
without re-authenticating. So the change is not cleanly reversible.

Deployments are immutable and never re-audited. Any commit that ever shipped a
half-finished guard would become a permanently public endpoint. The risk is
historical and credential-shaped, not current-route-shaped.

**On the current build the auditor found no route protected only by deployment
protection**: `/api/cron/retry-jobs` 401s, `/api/admin/voice/ab-golden-set` 401s,
`/api/session` 401s, source maps 403, `/styleguide` and `/settings/messaging-test`
`notFound()` under `NODE_ENV === "production"` (true on Vercel previews). That is
what makes the finding about history rather than today.

### The correct order, which is what we are doing

The setting is literally named `all_except_custom_domains` — not
`all_except_production_domains` — and Vercel's own docs point both ways. The
question costs nothing to settle empirically:

1. Attach `faysal.maitre.chat` to the branch. *(founder, Vercel dashboard)*
2. `curl -I https://faysal.maitre.chat/`.
3. `200` → done, and the settings change never happens.
   `401` → choose between the proxy project below and the paid Exceptions add-on.

### If it 401s

- **Proxy project** *(auditor's recommendation)*. A second Vercel project whose
  production domain is `faysal.maitre.chat` — production custom domains are exempt
  under every reading — forwarding to the pinned preview with a
  **Protection Bypass for Automation** secret attached server-side. Free on all
  plans, never expires, and the secret never reaches the client. Needs exactly one
  env var. Caveats: it must forward POST bodies and headers for `/api/faysal/*`,
  and it must carry its own path allowlist, because the `Host` reaching the
  deployment will be the `*.vercel.app` one and the `faysal` branch in
  `middleware.ts` will not fire.
- **Deployment Protection Exceptions.** Exactly the right feature. **$150/mo**
  Advanced Deployment Protection add-on on Pro, 30-day minimum.
- **Disabling project-wide SSO** stays last, and only after making the repository
  private or accepting the exposure above in writing.

Rejected outright: promoting the branch build to production (`vercel promote`) —
it would put unrelated parked work in front of live Wesaya customers.

---

## 3. Open, not fixed — both need the founder

### 3.1 `/` and `/api/faysal/reset` are an uncapped **compute** bill (MEDIUM)

The token ceiling is real and was verified end to end: `consumeSpendGuard` →
`kv_demo_try_consume`, durable in Postgres, fail-closed on DB error, and **not**
IP-spoofable (the auditor sent `x-forwarded-for: 203.0.113.77` plus `x-real-ip`;
Vercel's edge overwrites both and no such bucket appeared).

Money is a different quantity. `app/api/faysal/reset/route.ts` spends no tokens and
so never touches the durable ceiling — its only limit is `lib/rate-limit.ts`, which
its own header calls "explicitly NOT a distributed rate limiter". It is
`runtime = "nodejs"` + `force-dynamic`, so every POST is a serverless invocation;
`app/faysal/page.tsx` is `force-dynamic` too, so every page load is one as well,
plus an Edge Middleware invocation, with no CDN caching.

The layer that can actually bound this is not application code — an attacker
rotates IPs and a durable per-IP counter bounds nothing:

- **Vercel Spend Management** — a hard cap on the account.
- **Vercel Firewall rate-limit rule scoped to the demo host.**

Both are dashboard settings; neither is reachable from the tooling in this session.

### 3.2 The kill switch is shared with the Kivo demo (MEDIUM)

`app/api/faysal/_engine/guard.ts:6-7` says the two products "must not share a daily
budget or a kill switch". The **counters** are correctly namespaced (`faysal:<day>`
vs `global:<day>`; `<ip>:<hour>` vs `ip:<ip>:<hour>` — verified, no collision). The
**switch** is not: `demo_controls` is a single-row table
(`supabase/migrations/0119_demo_spend_guard.sql:52-53`) read inside
`kv_demo_try_consume` (`0120:45`). Setting `enabled = false` to pull Faysal also
pulls the Kivo restaurant demo, and vice versa — the wrong failure mode on the day
one demo has to come down mid-sales-cycle, which is exactly the day a public link
creates.

Proposed fix, additive and backward-compatible so the parked Khalid path is
untouched: a `demo_product_controls (product text primary key, enabled, reason,
updated_at)` table, and `kv_demo_try_consume` gains `p_product text default null`
that ANDs the product row with the existing global switch when supplied. The global
switch stays the big red button.

---

## 4. Middleware correctness — what the auditor tried and could not break

- **The page does not break on the locked-down host.** Every `src`/`href` in the
  rendered HTML: 8 chunks + 2 CSS under `/_next/static/`, 2 preloaded `.ttf` under
  `/_next/static/media/`, `/favicon.svg`, `/logo-mark.svg`. All matcher-excluded.
  **Zero `/_next/` paths outside `/_next/static`.**
- **No RSC or server-action surface.** `FaysalChat.tsx` makes exactly two network
  calls, both allowlisted; no `next/link`, no `useRouter`, no server actions.
- **No open redirect.** `x-forwarded-host: evil.example.com` against the same
  `nextUrl.clone()` + `redirect` path returned a relative `location: /login`.
- **Host spoofing gains nothing.** Vercel routes on `Host` at the edge, so an
  unassigned hostname never reaches the deployment.
- **Sessions are sealed.** HMAC-SHA256 with `timingSafeEqual`; a bad tag yields a
  *fresh* session, so `triageHold` is not forgeable and the safety rail survives a
  public URL.
