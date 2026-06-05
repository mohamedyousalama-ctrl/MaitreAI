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
