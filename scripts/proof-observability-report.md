# WO-PROOF-2 Observability Proof Report

Scope: read-only trace of the alerting and monitoring pipeline, plus the executable proof in `scripts/proof-observability.test.ts`. No production code, config, routes, migrations, or shared components were changed.

## Evidence Sources

- `lib/alerts/record.ts` - central `recordCriticalAlert` writer and channel fanout.
- `lib/alerts/whatsapp.ts` - in-app WhatsApp-to-admin channel.
- `lib/alerts/email.ts` - email channel scaffold.
- `lib/alerts/guidance.ts` - plain-Arabic guidance used by WhatsApp/email payloads when present.
- `app/api/alerts/route.ts`, `app/api/alerts/dismiss/route.ts`, `components/console/AlertBanner.tsx` - console banner read/dismiss path.
- `lib/monitoring/sweep.ts`, `lib/monitoring/checks.ts`, `lib/monitoring/webhook-events.ts`, `app/api/monitor/sweep/route.ts`.
- `.github/workflows/uptime-monitor.yml` and `vercel.json`.
- Alert call sites in `app/api/whatsapp/webhook/route.ts`, `app/api/whatsapp/send/route.ts`, `lib/messaging/respond-and-send.ts`, `lib/payments/moyasar-webhook.ts`, `lib/db/orders-create.ts`, `lib/db/delivery.ts`, `lib/db/allergy-companion-effects.ts`, `lib/ai/customer-turn.ts`, `lib/intelligence/conversation-outcomes.ts`, and `app/api/orders/[id]/driver-override/route.ts`.

## Alert Pipeline Trace

| Channel | Where alerts enter | What must be true to reach a human | If that is false | Is alert-path failure visible? |
| --- | --- | --- | --- | --- |
| Console banner (`system_alerts`) | `recordCriticalAlert(admin, input)` inserts `system_alerts`; managers poll `/api/alerts`; `AlertBanner` renders active rows. | `system_alerts` migration applied; service-role admin client configured in the failing request and `/api/alerts`; alert not an active duplicate; manager console is open or checked soon. | If `admin` is null, no row is inserted. If insert throws, request path still completes and only `console.error` records it. If no one watches the console, the row does not reach a human. | Write failure: console log only. Read failure: `/api/alerts` returns `503` with `alertSystemStatus:"degraded"`, and the banner shows a degraded alerting-state message. |
| In-app WhatsApp alert | `recordCriticalAlert` calls `sendAlertWhatsApp`; it sends a concise admin message through the platform/env WhatsApp sender. | `ALERT_WHATSAPP_TO` set; platform/env WhatsApp sender has `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`; Meta accepts the free-form message or an open service window exists; `NEXT_PUBLIC_APP_URL` is set if deep links matter. | If `ALERT_WHATSAPP_TO` is unset, `sendAlertWhatsApp` returns `{sent:false, reason:"no_recipient"}`. `recordCriticalAlert` treats that as a clean no-op and does not log it. If recipient exists but sender creds are absent, it logs a WhatsApp alert-send failure. | Unset recipient is not loud today. Other non-recipient failures are logged via `console.error("[alerts] WhatsApp alert send failed", ...)`; thrown errors are swallowed and logged. |
| Email | `recordCriticalAlert` calls `sendAlertEmail`. | `ALERT_EMAILS` set and an email provider implementation/API key exists. | With no recipients, returns `no_recipients`. With recipients but no provider, returns `provider_not_configured`. Both are intentionally not logged as failures by `recordCriticalAlert`. | No-provider/no-recipient is not loud today. Unexpected email reasons or thrown errors are logged, but there is no real email provider. |
| External uptime WhatsApp | GitHub Actions workflow `.github/workflows/uptime-monitor.yml` deep-checks `/api/health?deep=1` and, after 3 failures, calls Meta Graph API directly. | Scheduled GitHub Actions enabled on default branch; secrets `MONITOR_BASE_URL`, `ALERT_WHATSAPP_TOKEN`, `ALERT_WHATSAPP_PHONE_NUMBER_ID`, and `ALERT_WHATSAPP_TO` set; Meta accepts the message. | If `MONITOR_BASE_URL` is unset, health check is skipped. If any `ALERT_WHATSAPP_*` secret is unset during an outage, the workflow cannot send WhatsApp and only the workflow failure remains. | Failed health check marks the workflow run failed, so GitHub can notify repo admins. Direct WhatsApp-send failure is printed in workflow logs. |
| Monitor sweep | GitHub Actions posts `x-cron-secret` to `/api/monitor/sweep`; the route calls `runMonitorSweep`, which raises synthetic `recordCriticalAlert` alerts. | GitHub scheduled workflow active; `MONITOR_BASE_URL` and `CRON_SECRET` secrets configured; Vercel env has matching `CRON_SECRET`; service-role admin configured; `ALERT_PLATFORM_RESTAURANT_ID` set in production for platform-wide alerts. | If secrets are missing, the workflow step exits 0 after printing a skip. If `CRON_SECRET` is missing/wrong, route returns 401. If platform restaurant id is missing in production, platform-wide sweep alerts cannot attach to `system_alerts`. | Non-200 sweep is printed but does not fail the workflow; sweep check failures appear in the returned summary/errors, not as a guaranteed human alert unless the external health check fails. |

## Direct Answers

1. **Email provider wired?** No. `lib/alerts/email.ts` explicitly returns `provider_not_configured` when recipients exist, and `package.json` has no Resend/SendGrid/Postmark/SES/Nodemailer dependency.

2. **Is `ALERT_WHATSAPP_TO` proven configured in production?** No. Code references it in `lib/alerts/whatsapp.ts` and the GitHub workflow references an Actions secret of the same name. This repo cannot prove production env/secrets are set. PM/founder must check Vercel production env for `ALERT_WHATSAPP_TO`, and GitHub Actions secrets for `ALERT_WHATSAPP_TO`, `ALERT_WHATSAPP_TOKEN`, and `ALERT_WHATSAPP_PHONE_NUMBER_ID`, then run a manual alert drill.

3. **Is `lib/monitoring/sweep.ts` invoked by anything?** Yes, but not by Vercel Cron. `vercel.json` schedules only `/api/cron/retry-jobs`. The sweep is exposed through `app/api/monitor/sweep/route.ts` and invoked by `.github/workflows/uptime-monitor.yml` every 5 minutes if Actions and required secrets are configured. That external configuration is not proven from repo contents.

## Alert-Type Table

Channel shorthand: `Banner` = `system_alerts` console banner; `WA?` = in-app WhatsApp if env recipient and sender are configured; `Email no` = email scaffold, no provider; `GH WA?` = GitHub direct WhatsApp if Actions secrets are configured.

| Alert type | Trigger/source | Severity | Channels under code-known config |
| --- | --- | --- | --- |
| `agent_error` | Brain/customer-turn, typed-action, typed-quantity, unknown-interactive, or LLM failure hands the thread to human. | Critical | Banner, WA?, Email no |
| `whatsapp_send_failed` | AI reply send failure, outbound status callback failure, or STT fallback send failure. | Critical | Banner, WA?, Email no |
| `inbound_persist_failed` | WhatsApp inbound text/location/image persist failed. | Critical | Banner, WA?, Email no |
| `order_persist_failed` | WhatsApp AI finalized draft failed to persist before confirmation is sent. | Critical | Banner, WA?, Email no |
| `receipt_send_failed` | Receipt auto-send/resend failure. | High | Banner, WA?, Email no |
| `cod_capture_failed` | Delivered COD order failed cash-ledger capture. | Critical | Banner, WA?, Email no |
| `operator_send_failed` | Human operator WhatsApp reply failed to leave the system. | Critical | Banner, WA?, Email no |
| `delivered_without_driver_override` | Manager explicitly overrides delivery without a verified driver. | Critical | Banner, WA?, Email no |
| `payment_unspecified` | Created order lacks a chosen payment method and falls back to stored COD. | High | Banner, WA?, Email no |
| `outcome_classify_failed` | Terminal conversation outcome classifier exhausted retries. | High | Banner, WA?, Email no |
| `payment_amount_mismatch` | Moyasar paid webhook amount/currency mismatches payment session; payment held. | Critical | Banner, WA?, Email no |
| `payment_stamp_failed` | Moyasar paid webhook could not stamp the order paid. | Critical | Banner, WA?, Email no |
| `paid_after_expiry` | Moyasar settles an expired payment session. | High | Banner, WA?, Email no |
| `paid_while_safety_held` | Payment settles while linked conversation is in an active safety hold. | Critical | Banner, WA?, Email no |
| `paid_on_cancelled_order` | Payment settles on an already-cancelled order; recorded paid (money truth), refund owed. | Critical | Banner, WA?, Email no |
| `voice_tts_fallback` | ElevenLabs TTS failed and voice note fell back to OpenAI. | High | Banner, WA?, Email no |
| `voice_stt_unavailable` | Production inbound voice STT unavailable; customer gets retry fallback. | Critical | Banner, WA?, Email no |
| `delivery_silence` | Monitor sweep sees no inbound messages for an open/live non-dormant tenant beyond threshold. | Critical | Banner, WA?, Email no, requires sweep |
| `webhook_signature_spike` | Monitor sweep sees invalid WhatsApp signature spike. | Critical | Banner, WA?, Email no, requires sweep |
| `webhook_unresolved_spike` | Monitor sweep sees unresolved WhatsApp phone-number-id spike. | Critical | Banner, WA?, Email no, requires sweep |
| `webhook_tenant_resolution_failed` | Production webhook env fallback lacks explicit tenant/alert restaurant. | Critical | Banner if `ALERT_PLATFORM_RESTAURANT_ID` exists, WA?, Email no; otherwise console log only |
| `agent_error_rate` | Monitor sweep sees high customer-agent error ratio in `agent_runs`. | Critical | Banner, WA?, Email no, requires sweep and platform alert restaurant |
| `daily_spend` | Monitor sweep sees Anthropic spend above `MONITOR_DAILY_BUDGET_USD`. | High | Banner, WA?, Email no, requires budget env and sweep |
| `uptime_down` | External GitHub workflow deep health check fails 3 consecutive times. | Critical | GH WA?, GitHub failed-run email; no `system_alerts` row |
| `allergy_added_post_commit` | New allergy note added after a committed order, or commit-status query failed. | Critical | Banner, WA?, Email no |
| `safety_notify_no_hold` | Safety notification without ownership freeze; staff should inspect. | Critical | Banner, WA?, Email no |
| `allergy_emergency_active` | Allergy/medical emergency path remains active and staff is notified. | Critical | Banner, WA?, Email no |
| `allergy_calm_hold` | Calm-allergy hold entered `SYSTEM_HOLD`; alert is staff visibility. | Critical | Banner, WA?, Email no |
| `safety_unattended_handoff` | Customer sends safety-class text while human owns the thread and is quiet beyond the bridge window. | Critical | Banner, WA?, Email no |

Finding: `components/console/AlertBanner.tsx` has friendly labels for only the older subset through `payment_unspecified`; newer types still render as raw type strings in that component. The alert is visible, but less operator-friendly. `lib/alerts/guidance.ts` likewise has dedicated what/action guidance for monitoring plus the first three inline types, not all 28 types.

## Failure-Mode Gap Ranking

| Failure mode | Ranking | Evidence |
| --- | --- | --- |
| WhatsApp webhook stops receiving inbound messages for N minutes | Partial | `delivery_silence` exists in `runMonitorSweep`, but only runs if the GitHub workflow and secrets are configured. No Vercel cron schedules it. |
| Outbound WhatsApp sends failing repeatedly | Partial | Individual failed sends create `whatsapp_send_failed` / `operator_send_failed` and active-alert dedupe prevents banner storms. There is no aggregate repeated-send-failure monitor. |
| Order creation failing | Partial | WhatsApp AI order persist failure raises `order_persist_failed` before confirmation is sent. Storefront order creation failures return HTTP errors and log some paths but do not call `recordCriticalAlert`. |
| Allergen gate erroring | Partial | Correct allergy hold/emergency/post-commit paths raise alerts. Some companion side-effect failures are best-effort console logs, and no separate “allergen gate dependency failed” alert type exists. |
| STT unavailable in production | Covered | `voice_stt_unavailable` is called from the WhatsApp webhook STT failure path; existing `scripts/proof-stt-guard.test.ts` confirms this fires. |
| Database unreachable | Partial | External `/api/health?deep=1` workflow can detect DB unreachable and direct-WhatsApp an `uptime_down` message. In-app `system_alerts` cannot be written while DB is unreachable, and the external secrets/run status are unverified. |
| Order confirmed with a customer but never persisted | Covered for WhatsApp AI path | `respond-and-send` persists the order before transmitting the confirmation. On persist failure it marks the reply failed, hands to human, and raises `order_persist_failed`. |
| Conversation held for human review that nobody claims for a long time | Partial | `checkAndNotifyStuck` exists and is called when a human-owned thread is touched; it writes a timeline `stuck_alert`, not `recordCriticalAlert`, and no scheduled stuck sweep was found. |
| Anthropic/LLM provider failing or rate-limited | Covered/partial | Per-turn failures raise `agent_error`; aggregate `agent_error_rate` exists in monitor sweep if scheduler and `agent_runs.error` data are working. |
| Payment webhook signature failures | Silent from human-alert standpoint | Moyasar invalid signature returns `401 invalid_signature` and has tests proving no mutation, but there is no `recordCriticalAlert` or monitor ledger for payment signature spikes. |

## Proof Harness Coverage

`scripts/proof-observability.test.ts` covers:

- Runtime behavior of `recordCriticalAlert` insert shape.
- Request-path non-breakage when `system_alerts` insert throws.
- Console-error visibility for insert failure.
- WhatsApp no-recipient no-op behavior.
- Current finding that unset `ALERT_WHATSAPP_TO` is not loud.
- Logged failure when a recipient is set but WhatsApp sender credentials are absent.
- Email `no_recipients` and `provider_not_configured` behavior.
- Active-alert dedupe and recurrence bump.
- Monitor cooldown suppression.
- AST extraction of `CriticalAlertType` union and static alert-call type consistency.
- Code-level scheduler trace: Vercel does not schedule sweep; GitHub workflow does if configured.

Skipped/gated by design:

- Production `ALERT_WHATSAPP_TO` and WhatsApp alert sender secrets: require Vercel/GitHub settings access.
- GitHub Actions production run status: requires Actions settings/run history.
- Production `system_alerts` table presence: requires database verification; builder windows must not apply migrations.

## Minimum Viable Alerting For Wesaya Pilot

Before real Wesaya orders, the minimum credible setup is one proven out-of-band channel plus the console banner:

1. Configure and verify the in-app WhatsApp alert path: `ALERT_WHATSAPP_TO`, platform/env sender credentials, `NEXT_PUBLIC_APP_URL`, and a live manual `recordCriticalAlert` drill in staging/production that Mohamed actually receives.
2. Confirm `system_alerts` exists in production and `/api/alerts` returns `alertSystemStatus:"ok"` for a manager session.
3. Enable the GitHub `uptime-monitor` workflow on default branch and configure `MONITOR_BASE_URL` plus matching `CRON_SECRET`; run `workflow_dispatch` and verify it posts to `/api/monitor/sweep`.
4. Configure the external outage WhatsApp secrets (`ALERT_WHATSAPP_TOKEN`, `ALERT_WHATSAPP_PHONE_NUMBER_ID`, `ALERT_WHATSAPP_TO`) and test the failure branch or a controlled synthetic equivalent.
5. Do not rely on email for the pilot until a real provider is wired and tested.

Follow-up fixes worth separating from this proof: make unset `ALERT_WHATSAPP_TO` loud in production readiness/monitor output, add payment-webhook signature spike alerting, add a scheduled stuck-hold sweep, and decide whether storefront order failures should raise `order_persist_failed`.
