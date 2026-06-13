# WhatsApp Cloud API — Go-Live & Config-Flip Readiness (Sprint 9, S9-1)

MaitreAI is wired to the **WhatsApp Cloud API**. The code path is identical for
the **sandbox test number** and the **verified production number** — switching
between them is an **environment-variable change only, with zero code changes**.

## The full round-trip (what S9-1 wired)

```
Customer WhatsApp message
  → Meta delivers POST to  /api/whatsapp/webhook
  → signature verified (X-Hub-Signature-256 vs WHATSAPP_APP_SECRET)
  → normalized + persisted (idempotent on channel_message_id — redeliveries deduped)
  → phone → customer → conversation → tenant
  → respondAndSendWhatsApp():
       • if a human owns the conversation (takeover) → Brain stays out
       • else runCustomerTurn() (same path as /api/agent/respond):
           – builds the cached system prompt + order tools
           – Claude (claude-sonnet-4-6) reply, money computed by tools (never the LLM)
           – persists the AI reply, logs cost to agent_runs, flips to human on escalation
       • sends the reply via Graph API (retry/backoff, 24h-window aware)
       • send failure → marked on the message row + a system note on the timeline (never silent)
  → Operator sees it live in المحادثات (realtime)
```

Operator takeover messages leave on the **same transport** via
`POST /api/whatsapp/send` (session-authenticated). Release re-arms the Brain
with the §E7 handover note.

## Environment variables (the ONLY thing that changes sandbox → production)

| Variable | Sandbox (test number) | Production (verified number) | Notes |
|---|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | temp token from the App dashboard | **permanent** System-User token | server-only; never exposed to client |
| `WHATSAPP_PHONE_NUMBER_ID` | test number's id | the verified number's id | from API Setup → "From" |
| `WHATSAPP_VERIFY_TOKEN` | any string you pick | same string (or rotate) | echoed in the GET handshake |
| `WHATSAPP_APP_SECRET` | App → Settings → Basic | same | validates `X-Hub-Signature-256` |
| `WHATSAPP_RESTAURANT_ID` | the pilot tenant's id | the live tenant's id | maps inbound → tenant (until per-number mapping, Sprint 10+) |
| `AGENT_ROUTE_SECRET` | already set | already set | unchanged |
| `ANTHROPIC_API_KEY` | already set | already set | unchanged |

**No code change is required to flip.** Set the five `WHATSAPP_*` vars in Vercel
(Production) and redeploy. `isWhatsAppConfigured()` flips the adapter from
test-mode (skips sending) to live the moment `WHATSAPP_ACCESS_TOKEN` +
`WHATSAPP_PHONE_NUMBER_ID` are present.

## Meta dashboard wiring (one-time, done in the Meta App, not the codebase)

1. **Webhook callback URL:** `https://www.maitre.chat/api/whatsapp/webhook`
   (copyable from الإعدادات → ربط واتساب).
2. **Verify token:** the value you set in `WHATSAPP_VERIFY_TOKEN`.
3. **Subscribe** the app to the `messages` webhook field.
4. **Graph API version:** `v19.0` (see `lib/messaging/config.ts → WHATSAPP_GRAPH_VERSION`).

## Sandbox proof checklist

- [ ] GET handshake returns the challenge (verify token matches).
- [ ] A real message to the test number creates a `messages` row + a `conversations` row.
- [ ] The Brain reply is delivered back to WhatsApp and appears in المحادثات.
- [ ] `agent_runs` has a cost row (input/output tokens + `cost_usd`).
- [ ] Redelivery of the same message id does **not** duplicate (dedupe works).
- [ ] Operator takeover message is delivered over WhatsApp; release re-arms the Brain (§E7).

## Pending owner (paperwork, not code)

- Meta Business Verification (submitted after the renewed بطاقة ضريبية arrives) —
  unlocks the verified number + higher limits + template approval (S9-4).
- Until verified, the unverified cap (250 business-initiated conversations/day)
  is acceptable for the pilot. Customer-initiated replies inside the 24h window
  are unaffected.

## Templates (S9-4 — foundation; delivery pending Meta approval)

Free-form text/interactive/image messages only reach the customer **inside the
24-hour customer-service window**. To message a customer **outside** it (e.g. an
order-status update hours later), WhatsApp requires a **pre-approved template**.

The plumbing is built and ready (`lib/messaging/templates.ts` registry +
`sendWhatsAppTemplate` send-path + `sendOrderStatusUpdate` helper). It is **not
auto-fired anywhere yet** — each template must first be created and **approved in
Meta** on the verified account.

### Seed template to submit for approval

| Field | Value |
|---|---|
| Name | `order_status_update` |
| Language | `ar` |
| Category | Utility |
| Body | `تحديث طلبك {{1}}: الحالة الآن «{{2}}». شكراً لطلبك من لدينا 🙏` |
| Sample | `{{1}}` = `#1048`, `{{2}}` = `قيد التحضير` |

**Steps (one-time, in Meta, after Business Verification):** WhatsApp Manager →
Message Templates → Create → paste the body above → submit → wait for approval
(minutes–hours). Once `APPROVED`, calling `sendOrderStatusUpdate(client, orderId,
status)` delivers it; before approval Meta returns a 4xx (surfaced as a failed
send, never a fake success).

**Out of scope here:** the §T promotion engine (Sprint 11) — only the transactional
template rail is foundationed now.
