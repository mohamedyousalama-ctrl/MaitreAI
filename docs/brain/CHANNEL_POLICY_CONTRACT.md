# BRAIN Channel Policy Contract

Outbound WhatsApp messages must be legal under channel rules at dispatch time, not merely when they were composed. This contract defines the authorization boundary for future BRAIN outbox work.

Meta documentation relied on:

- Meta WhatsApp Cloud API Send Messages: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
- Meta WhatsApp Message Templates: https://developers.facebook.com/docs/whatsapp/message-templates
- Meta WhatsApp Cloud API Messages reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
- Meta WhatsApp pricing and conversation policy: https://developers.facebook.com/docs/whatsapp/pricing

## Channel Policy Decision

Every outbound candidate must be evaluated before an outbox row is authorized and revalidated immediately before send.

```ts
type ChannelPolicyDecision = {
  service_window_open: boolean;
  last_customer_message_at: string | null;
  freeform_allowed: boolean;
  template_required: boolean;
  approved_template_id?: string;
  message_type_allowed: boolean;
};
```

The decision input includes tenant, channel, destination, current time, last inbound customer message time, message category, message type, template id if any, ownership state, ownership generation, and outbox send policy.

The decision output is stored with the outbox authorization evidence. The dispatcher must recompute it immediately before calling the single outbound gateway. If the recomputed decision no longer permits the message, the dispatcher must not send it.

## 24-Hour Customer-Service Window

For WhatsApp, free-form service content is allowed only while the customer-service window is open. The window is derived from the latest customer inbound message according to Meta WhatsApp Business Platform rules. Outside that window, free-form service content is not permitted; only an approved template may be sent.

Rules:

- `service_window_open = true` when the destination has a valid customer-service window for this tenant and channel at the evaluation instant.
- `freeform_allowed = true` only when `service_window_open = true` and the message type is allowed for the channel.
- `template_required = true` when `service_window_open = false` or when the chosen WhatsApp message type requires a template under Meta rules.
- `approved_template_id` is required whenever `template_required = true`.
- A message composed inside the window but dispatched outside it must be revalidated. If no longer permitted, it is converted to an approved template only when a deterministic approved template mapping exists; otherwise it is cancelled with a recorded reason.

Recorded cancellation reasons include `SERVICE_WINDOW_EXPIRED`, `TEMPLATE_NOT_APPROVED`, `MESSAGE_TYPE_NOT_ALLOWED`, `OWNER_CHANGED`, `PROMPT_INVALIDATED`, and `SUPERSEDED`.

## Outbox Send Policies

Each outbox row carries exactly one send policy.

| policy | choose when | dispatcher behavior | example |
|---|---|---|---|
| `MUST_SEND_TRANSACTIONAL` | The message records a completed business fact the customer must receive unless the channel forbids it. | Revalidate channel policy. If free-form is not allowed, use approved transactional template if available; otherwise hold for human/operator alert instead of silently dropping. | Final order confirmation after a committed order. |
| `CANCEL_IF_SUPERSEDED` | A newer state makes the old message unhelpful or wrong. | Cancel when a newer quote, cart revision, or response bundle supersedes it. | Quote summary after customer changed quantity. |
| `CANCEL_IF_OWNER_CHANGED` | AI-authored content is valid only under the ownership generation captured at enqueue. | Re-read current owner and generation immediately before send; cancel if they differ. | AI answer queued before human takeover. |
| `CANCEL_IF_PROMPT_INVALIDATED` | Message contains a prompt, button, list, or token tied to a specific episode revision or required field. | Cancel if prompt token, episode revision, quote, or required field no longer matches. | Stale modifier buttons after customer selected a different item. |
| `TEMPLATE_REVALIDATE_AT_SEND` | Message may cross the WhatsApp service-window boundary or must use a specific template. | Recompute channel policy and template approval at dispatch; cancel or convert only through an approved deterministic mapping. | Follow-up after the 24-hour window may expire. |

Rule for choosing:

- Committed business facts use `MUST_SEND_TRANSACTIONAL`.
- AI-generated conversational responses use `CANCEL_IF_OWNER_CHANGED`.
- Revision-bound prompts and interactive affordances use `CANCEL_IF_PROMPT_INVALIDATED`.
- State summaries that can become stale use `CANCEL_IF_SUPERSEDED`.
- Any message likely to sit in queue near the service-window boundary also carries `TEMPLATE_REVALIDATE_AT_SEND` semantics through its authorization evidence; if only one enum may be stored, choose the business-effect policy and store template revalidation as a required dispatch check.

## Multi-Message Responses

The preferred BRAIN output is one customer message. External WhatsApp delivery cannot make multiple messages atomic, so multi-message responses are exceptional.

When multiple outbound rows are unavoidable, each row carries:

- `response_bundle_id`: stable id for the logical response bundle.
- `ordinal`: one-based order inside the bundle.
- `depends_on_ordinal`: optional ordinal that must be successfully sent before this row may send.

Dispatcher rules:

- Never send ordinal N when a required prior ordinal failed, was cancelled, or became illegal under channel policy.
- Every ordinal is independently channel-policy revalidated at send time.
- Avoid placing business-critical meaning across several WhatsApp messages. If splitting would make partial delivery unsafe, combine into one message or route to human.

## Single-Use Interactive Tokens

Interactive action tokens are business-effect capabilities. They are single-use.

Every token records:

- Token hash, tenant, thread, episode, prompt kind, token generation, episode revision, expiry, status.
- `consumed_at`.
- `consumed_by_message_id`.
- Optional `consumed_by_turn_event_id` when the consumer is an inbound action rather than outbound confirmation.

Token consumption and the state transition it authorizes occur in the same database transaction. A replayed token produces no business effect. The invariant is:

> An action token may produce a business effect at most once.

If token consumption succeeds but the business transition fails, the transaction rolls back and the token remains unconsumed. If the token is expired, revoked, already consumed, wrong generation, wrong episode revision, wrong tenant, or wrong thread, the BRAIN records a no-op turn event and performs no mutation.

## Single Outbound Gateway

No module outside the outbound boundary may call Meta directly. There must be no generic `sendMessage(string)` escape hatch.

The only allowed path is:

1. Deterministic decision creates a typed customer response plan.
2. Commit transaction authorizes an outbox row with ownership, channel policy evidence, idempotency key, and send policy.
3. Dispatcher revalidates ownership, prompt state, channel policy, and template approval.
4. Single outbound gateway renders the approved typed message shape and calls Meta.
5. Provider result is recorded back on the outbox row.

The gateway accepts typed message structures, not arbitrary strings. Free text from prompts or internal diagnostics is never an outbound payload.
