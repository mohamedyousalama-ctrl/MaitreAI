# WO-PROOF-1 Tenant Isolation Inventory

Base audited: `origin/main` at `ac7880b745b0f7cc140ee7812762da7a93a78079`.

Scope: every `app/api/**/route.ts` file in this checkout. This is a code inventory plus a gated behavior proof plan. No production data was read, no migrations were applied, and no app/library/route files were modified.

## Guarded

These routes resolve a signed-in user to a tenant with `requireTenant()` or `requireManager()`, or they authenticate the user then re-validate a caller-supplied `restaurantId` against `members`. When service-role is used, the route or delegated helper scopes reads/writes to the verified tenant.

| Route | Uses service-role? | How caller tenant is determined | Is determination trustworthy? |
| --- | --- | --- | --- |
| `app/api/agent/admin/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: service-role operations use `tenant.restaurantId` filters and server-resolved role. |
| `app/api/agent/promo/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: restaurant, brain, and promo rows are scoped to `tenant.restaurantId`. |
| `app/api/alerts/dismiss/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: alert id from body is updated with `id` plus `restaurant_id = tenant.restaurantId`. |
| `app/api/alerts/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated and reads active alerts by `tenant.restaurantId`. |
| `app/api/callbacks/[id]/status/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: callback id is path-supplied, but delegated update uses `tenant.restaurantId`; member id is resolved from user and tenant. |
| `app/api/callbacks/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: board read delegates with `tenant.restaurantId`. |
| `app/api/capacity/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: restaurant capacity reads are by `tenant.restaurantId`. |
| `app/api/channels/whatsapp/status/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: returns per-tenant WhatsApp status and no secret values. |
| `app/api/cod/capture-delivered/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: body `orderId` is rechecked against `tenant.restaurantId` before COD capture or delivery sync. |
| `app/api/cod/collect/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated and delegated collection write receives `tenant.restaurantId`. |
| `app/api/cod/export/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated and COD helpers receive `tenant.restaurantId`. |
| `app/api/cod/ledger/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: COD summary helpers receive `tenant.restaurantId`. |
| `app/api/cod/settle-all/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated and settlement helper receives `tenant.restaurantId`. |
| `app/api/cod/settle/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated and driver settlement helper receives `tenant.restaurantId`. |
| `app/api/cod/settlement/[id]/image/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: path settlement id is loaded via helper with `tenant.restaurantId`. |
| `app/api/console/command/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: command execution receives server-resolved tenant/member context. |
| `app/api/console/media/[messageId]/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path message id is checked through a tenant-scoped conversation/message lookup before signed media access. |
| `app/api/console/onboarding/test-drive/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated and test-drive audit/brain work is scoped to `tenant.restaurantId`. |
| `app/api/conversations/[id]/assignee/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path conversation id is always paired with `tenant.restaurantId`; acting member id is server-resolved. |
| `app/api/conversations/[id]/close/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path conversation id is tenant-scoped before close; delegated ownership helper is reached only after that check. |
| `app/api/conversations/[id]/notes/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path conversation id update includes `restaurant_id = tenant.restaurantId`. |
| `app/api/conversations/[id]/release-hold/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path conversation id is read, compared to `tenant.restaurantId`, then updated with both id and tenant. |
| `app/api/conversations/[id]/resume/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path conversation id is loaded with `tenant.restaurantId` before any auto-resume. |
| `app/api/conversations/[id]/stage/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: stage read/write pairs path id with `tenant.restaurantId`. |
| `app/api/customer-memory/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: query `customerId` is filtered by `tenant.restaurantId`; feature flag is tenant-scoped. |
| `app/api/customers/[id]/consent/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated and consent helper receives `tenant.restaurantId` plus path customer id. |
| `app/api/customers/aggregates/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: all aggregate reads are filtered by `tenant.restaurantId`. |
| `app/api/deliveries/[id]/assign/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path delivery id and body driver id are validated in helper with `tenant.restaurantId`. |
| `app/api/deliveries/assign-run/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: run assignment helper receives `tenant.restaurantId` and validates all delivery ids within it. |
| `app/api/deliveries/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: pending delivery repair and list helpers are scoped to `tenant.restaurantId`. |
| `app/api/deliveries/runs-board/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: board helper receives `tenant.restaurantId`. |
| `app/api/deliveries/suggest-runs/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: suggestions read tenant feature flags and tenant delivery data through the session client. |
| `app/api/drivers/[id]/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: path driver id writes call helpers with `tenant.restaurantId`. |
| `app/api/drivers/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: driver list/create helpers receive `tenant.restaurantId`. |
| `app/api/handoff/board/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: admin query is filtered by `tenant.restaurantId`. |
| `app/api/insights/order-sources/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: session-client reads are tenant-filtered. |
| `app/api/knowledge/change-requests/[id]/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated and change-request row is loaded with id plus `tenant.restaurantId`. |
| `app/api/knowledge/change-requests/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET uses session tenant; POST creates under `tenant.restaurantId`. |
| `app/api/knowledge/counts/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: all counts are filtered by `tenant.restaurantId`. |
| `app/api/members/[id]/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated and target member path id is constrained to `tenant.restaurantId`; last-manager guard is server-side. |
| `app/api/members/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: roster query filters members by `tenant.restaurantId`; auth display names are resolved only for that roster. |
| `app/api/menu/[id]/allergens-review/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated and path item id update includes `tenant.restaurantId`. |
| `app/api/menu/[id]/allergy-data/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated writes and GET read are path item id plus `tenant.restaurantId`. |
| `app/api/menu/availability/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: body item id is passed to helper with `tenant.restaurantId`. |
| `app/api/onboarding/allergy-coverage/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: coverage read is tenant-scoped. |
| `app/api/onboarding/config/branches/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: branch reads use session tenant. |
| `app/api/onboarding/config/hours/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and PUT use `tenant.restaurantId`; PUT manager-gated. |
| `app/api/onboarding/config/persona/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and PUT use `tenant.restaurantId`; PUT manager-gated. |
| `app/api/onboarding/config/zones/[id]/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: path zone id writes/deletes are paired with `tenant.restaurantId`; manager-gated. |
| `app/api/onboarding/config/zones/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: zone list/create use `tenant.restaurantId`; POST manager-gated. |
| `app/api/onboarding/embedded-signup/route.ts` | Yes | Authenticated user, then body `restaurantId` is revalidated against `members` as manager. | Trustworthy: caller-supplied tenant is checked by user membership before service-role credential writes. |
| `app/api/onboarding/go-live/route.ts` | Yes | Authenticated user, then query/body `restaurantId` is revalidated against `members` as manager. | Trustworthy: caller-supplied tenant is checked before readiness reads or activation write. |
| `app/api/onboarding/menu/draft/route.ts` | Yes | Authenticated user, then query `restaurantId` is revalidated against `members`. | Trustworthy: caller-supplied tenant is checked before draft read. |
| `app/api/onboarding/menu/ingest/route.ts` | Yes | Authenticated user, then body `restaurantId` is revalidated against `members` as manager. | Trustworthy: caller-supplied tenant is checked before draft insert. |
| `app/api/onboarding/menu/publish/route.ts` | Yes | Authenticated user, then body `restaurantId` is revalidated against `members` as manager. | Trustworthy: draft id is also checked against that restaurant before RPC. |
| `app/api/onboarding/provision-tenant/route.ts` | Yes | Authenticated user creates a new tenant and gets manager membership. | Trustworthy for isolation: no existing tenant is selected by caller; new restaurant id is server-created. |
| `app/api/orders/[id]/cancel/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated; path order id is read and written with `tenant.restaurantId`. |
| `app/api/orders/[id]/driver-override/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Mostly trustworthy: alert is stamped to `tenant.restaurantId`; body `conversationId` is not verified against the order. No cross-tenant data read was found. |
| `app/api/orders/[id]/payment/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated; payment-state write and refund helper use `tenant.restaurantId`. |
| `app/api/orders/[id]/pos/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path order id is read and updated with `tenant.restaurantId`. |
| `app/api/orders/[id]/print-audit/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path order id is verified with `tenant.restaurantId` before audit event. |
| `app/api/orders/[id]/status/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path order id is read and updated with `tenant.restaurantId`; status transition is server-validated. |
| `app/api/orders/[id]/test/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated; path order id update includes `tenant.restaurantId`. |
| `app/api/orders/[id]/ticket-print/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: path order id is verified with `tenant.restaurantId` before order event insert. |
| `app/api/payments/psp/create/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: body order id goes to `createMoyasarSession`, which rejects `order_tenant_mismatch`. |
| `app/api/search/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: every search group is filtered by `tenant.restaurantId`; user input is bound query data. |
| `app/api/session/memberships/route.ts` | Yes | Authenticated user before active tenant selection. | Trustworthy: returns only memberships where `user_id = auth user id`; no caller tenant is trusted. |
| `app/api/session/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: tenant comes from server resolver, including cookie revalidation through membership. |
| `app/api/settings/alerts/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and POST use `tenant.restaurantId`; POST manager-gated. |
| `app/api/settings/capacity/route.ts` | Yes | Derived from authenticated session via `requireManager()`. | Trustworthy: manager-gated and write targets `tenant.restaurantId`. |
| `app/api/settings/capacity/sync/route.ts` | Yes | Derived from authenticated session via `requireManager()`. | Trustworthy: per-tenant WhatsApp creds are resolved by `tenant.restaurantId`; no global credential fallback. |
| `app/api/settings/flags/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and POST use `tenant.restaurantId`; POST manager-gated and allowlisted. |
| `app/api/settings/hours/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and POST use `tenant.restaurantId`; POST manager-gated. |
| `app/api/settings/identity/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and POST use `tenant.restaurantId`; POST manager-gated. |
| `app/api/settings/ops/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and POST use `tenant.restaurantId`; POST manager-gated. |
| `app/api/settings/payment/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and POST use `tenant.restaurantId`; POST manager-gated. |
| `app/api/settings/print/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and POST use `tenant.restaurantId`; POST manager-gated. |
| `app/api/settings/printer/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and POST use `tenant.restaurantId`; POST manager-gated and flag-aware. |
| `app/api/settings/psp/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated; PSP secret fields are write-only and scoped to `tenant.restaurantId`. |
| `app/api/settings/ramadan/route.ts` | Yes | Derived from authenticated session via `requireManager()`. | Trustworthy: manager-gated and write targets `tenant.restaurantId`. |
| `app/api/settings/standing-instructions/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated writes use `tenant.restaurantId` and server-resolved member id. |
| `app/api/settings/tax/route.ts` | No | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and POST use `tenant.restaurantId`; POST manager-gated. |
| `app/api/settings/templates/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET and POST use `tenant.restaurantId`; POST manager-gated. |
| `app/api/settings/templates/sync/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated; sync uses this tenant's WABA credentials only, no global fallback. |
| `app/api/settings/tonight-notes/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: GET, POST, and DELETE use `tenant.restaurantId`; mutation paths manager-gated. |
| `app/api/settings/whatsapp-health/roundtrip/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated; send path uses per-tenant WhatsApp creds for `tenant.restaurantId`. |
| `app/api/settings/whatsapp-health/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: health reads are by `tenant.restaurantId`; no credential value is returned. |
| `app/api/settings/whatsapp/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: manager-gated; credential fields are write-only and scoped to `tenant.restaurantId`. |
| `app/api/team/invite/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: invitee joins inviter's `tenant.restaurantId`; no body restaurant id is accepted. |
| `app/api/whatsapp/send/route.ts` | Yes | Derived from authenticated session via `requireTenant()`. | Trustworthy: body conversation id is checked with `tenant.restaurantId`; message send uses tenant creds. |

## Guarded By Non Obvious Means

These are not ordinary member-session routes. They rely on platform secrets, signed provider payloads, unguessable opaque ids, or RLS through the session client. None was confirmed as a cross-tenant leak in code review, but these are the surfaces the behavior harness must attack in staging.

| Route | Uses service-role? | How caller tenant is determined | Is determination trustworthy? |
| --- | --- | --- | --- |
| `app/api/admin/voice/ab-golden-set/route.ts` | Yes | Platform `CRON_SECRET`; tenant is inferred from each golden conversation's stored `restaurant_id`. | Trustworthy only for platform-admin use. A caller with `CRON_SECRET` can operate across tenants by design. |
| `app/api/admin/voice/archive-golden-set/route.ts` | Yes | Platform `CRON_SECRET`; optional body conversation ids are not tied to a tenant session. | Trustworthy only for platform-admin use. Broad if `CRON_SECRET` is leaked. |
| `app/api/agent/respond/route.ts` | Yes | `AGENT_ROUTE_SECRET` is parsed as `restaurantId:token`; body `restaurantId` must match the bound id. | Trustworthy for the single bound tenant; not a member-session route. Conversation id is also checked with that restaurant. |
| `app/api/agent/suggest/route.ts` | No | Derived from authenticated session via `requireTenant()`, but body `conversationId` message reads rely on RLS rather than explicit tenant filters. | Needs live RLS behavior proof. No service-role bypass was found, but this is RLS-only for the body id. |
| `app/api/cron/retry-jobs/route.ts` | Yes | Platform `CRON_SECRET`; jobs carry their own payload tenant context. | Trustworthy only as platform cron. Not tenant-member callable when secret is absent or wrong. |
| `app/api/monitor/sweep/route.ts` | Yes | Platform `CRON_SECRET`; sweep iterates tenant health internally. | Trustworthy only as platform monitor. Not tenant-member scoped. |
| `app/api/orders/[id]/image/route.ts` | No | Derived from authenticated session via `requireTenant()`, then order id is loaded through the session client. | Needs live RLS behavior proof. No service-role bypass was found, but route does not add an explicit tenant filter around `params.id`. |
| `app/api/orders/[id]/send-receipt/route.ts` | Yes | Derived from authenticated session via `requireTenant()`, then receipt data is loaded through the session client. | Needs live RLS behavior proof. Admin is used for member/credential support; order data depends on session-client RLS. |

## Unguarded

No route was classified as unguarded for ordinary tenant-member access in this code inventory.

The inventory did find platform/public routes that are intentionally not member-session guarded. Those are listed under `Guarded By Non Obvious Means` or `Public By Design`, with blast-radius notes.

## Public By Design

These routes are intentionally reachable without an operator session. Their tenant boundary is an opaque token, signed webhook secret, phone-number configuration, storefront slug, or minimal public health response.

| Route | Uses service-role? | How caller tenant is determined | Is determination trustworthy? |
| --- | --- | --- | --- |
| `app/api/brain/ingress/whatsapp/route.ts` | No | Verified WhatsApp phone-number configuration, plus `X-Hub-Signature-256` against the tenant app secret. | Trustworthy if tenant phone/app-secret config is correct. Blast radius is one signed webhook envelope. |
| `app/api/channels/whatsapp/webhook/route.ts` | Yes via re-export | Thin re-export of canonical WhatsApp webhook route. | Same trust and blast radius as `app/api/whatsapp/webhook/route.ts`. |
| `app/api/delivery/[token]/cod-collected/route.ts` | Yes | Opaque driver token in path. | Trustworthy for a single delivery stop; rate limited and writes only token-owned delivery COD UI flag. |
| `app/api/delivery/[token]/location/route.ts` | Yes | Opaque driver token in path. | Trustworthy for a single delivery; rate limited and refuses expired/completed tokens. |
| `app/api/delivery/[token]/status/route.ts` | Yes | Opaque driver token in path. | Trustworthy for a single delivery; rate limited, forward-only status, expired/completed token refusal. |
| `app/api/demo/voice/route.ts` | Yes | **Not determined from the caller at all.** Same pinned synthetic demo tenant as `demo/turn`; never read from the request. | Trustworthy: nothing for a caller to influence. Public and unauthenticated **by design**. Same controls as `demo/turn` (in-handler host gate, durable spend guard that fails closed, five-field response allowlist, `demoRun` so no visitor audio or transcript is persisted) plus four specific to audio: a **512 KB** size ceiling checked on the declared length — which is now REQUIRED and must parse, so an absent, duplicated or chunked Content-Length cannot bypass it — and again on what actually arrived; a client-side 60-second auto-stop, since STT bills per MINUTE and the cheapest place to bound a clip is before it is uploaded; a refusal of the mock STT adapter **made in this route itself**, because `assertMockSttAllowed` permits the mock whenever `NODE_ENV !== "production"` and `localhost` is an allowlisted demo host, so delegating that check rendered a FIXED invented sentence as the visitor's own words under `npm run dev`; and STT cost accounting through `mustWrite({exactRows:1})` that fails closed, because `lib/monitoring/sweep.ts` sums `agent_runs.cost_usd` and STT is the dominant cost of a voice turn. |
| `app/api/demo/speak/route.ts` | Yes | **Not determined from the caller at all.** No tenant is read from the request; the route synthesizes one already-approved sentence and touches no tenant data. | Trustworthy: the caller supplies **no text**. This endpoint exists because progressive audio playback on iOS has exactly one shape — an `<audio>` element pointed at a URL — and an `<audio>` element can only issue a plain `GET`, so the naive version (`/speak?text=…`) would be a free, unauthenticated text-to-speech oracle in our registered voice, routing around every control that lives on the POST path. Instead `/api/demo/voice` mints an HMAC-signed **speech ticket** that CONTAINS the approved text, and this route speaks that and nothing else. Controls: in-handler host gate; per-IP rate limit bounding replay inside the ticket's 60-second life to strictly less than the same IP can already spend through the POST route; signature, expiry and session binding all re-checked; the text-only refusals re-read from the text itself, so a valid signature is never treated as a permission slip; the voice taken from the ticket and built from the registry, never from the query string; the FIRST synthesis booked by the TURN that minted the ticket, so the durable cap runs ahead of the money rather than behind it (the cap counts turns, and a replay consumes no turn — which is why the repeat fetch is ledgered separately); and every refusal answers `204` with no audio, never a substitute voice — the caller is already looking at the full reply as text. |
| `app/api/demo/capabilities/route.ts` | Yes | **No tenant is involved at all.** Reads no request field beyond the Host header and touches no tenant data. | Trustworthy: there is nothing for a caller to influence. Public and unauthenticated **by design**, behind the same in-handler host gate as `demo/turn` and `demo/voice`. It answers ONE boolean — can this surface both hear and speak — so the demo's call screen never offers a voice conversation the server cannot hold; a screen that listens, thinks and then answers with silence reads as a dropped call rather than an unconfigured feature. It discloses no provider, no voice id, no key state and no reason, and a visitor learns the same boolean by pressing the button, so it reveals nothing they could not already observe. `no-store`, because the value flips with a deployment's configuration and a cached `true` is exactly the silent call screen above. No database client is constructed and no write of any kind occurs. |
| `app/api/demo/greeting/route.ts` | No | **No tenant is involved at all.** Reads no request field beyond the Host header and an opaque session id from the query string, and touches no tenant data. | Trustworthy: the caller supplies **no text**. Public and unauthenticated **by design**, behind the same in-handler host gate as every other demo route. It answers ONE thing — a signed speech ticket for a FIXED opening sentence that lives in `lib/demo/call-greeting.ts` — so a call screen greets the visitor instead of opening onto a silent line. Controls: the greeting text is a server constant, never anything a caller sent, so this cannot be steered into a text-to-speech oracle; the ticket is minted through the same shared voice gate as a turn, so a greeting a turn would refuse to speak is refused here too; it is minted **only when the voice is actually audible**, so a visitor whose voice is off never books a synthesis for a screen about to say "unavailable"; the session id is echoed from the query string and **never trusted** — it binds the ticket to the session that will redeem it, so a wrong value makes the greeting unplayable and nothing else; and the per-IP allowance is the **turn cap**, not the capability probe's 4× allowance, because every hit here books a paid synthesis. `no-store`: a signed, one-minute, session-bound ticket has no business in any cache. **It writes exactly one row, and it must**: the ticket it mints is redeemed at `/api/demo/speak`, which treats a first fetch as already paid for by whoever minted it — so this route buys a real synthesis, and an earlier version of this row recorded "no write of any kind occurs" as a virtue while that charge reached no ledger and `lib/monitoring/sweep.ts` (which sums `agent_runs.cost_usd` for the daily spend alert) could not see it. The write is a single `agent_runs` row with the mint's own cost, model and adapter, through `mustWrite({exactRows:1})`, and it is deliberately **not** fail-closed — a ledger outage must not take the greeting down. No tenant data is read or written; the row is cost accounting against the synthetic demo tenant. **Deliberately not part of `demo/capabilities`**, which promises one boolean and no voice id: a ticket payload carries the registered voice id, and the probe's wider allowance is granted on the stated grounds that it does no I/O. |
| `app/api/demo/turn/route.ts` | Yes | **Not determined from the caller at all.** The tenant is a hard-coded synthetic demo restaurant (`lib/demo/config.ts`), never read from the request body, path or headers. | Trustworthy: there is nothing for a caller to influence. Public and unauthenticated **by design** (Founder-authorised public demo link). Blast radius is one synthetic tenant with no real customers, orders or menu. Hardened against the risks that replace the missing session: input is length-capped per message AND per history entry (bounds LLM spend on an endpoint anyone can call), the host is checked in-handler (middleware alone is bypassable by file-extension suffix), and the response is a five-field allowlist so tenant feature flags, cost and usage never leave the handler. Not a spend cap: `lib/rate-limit` is process-local and resets on cold start. |
| `app/api/health/route.ts` | Yes only in deep DB probe | Public readiness probe returns only `{ ready }`; authenticated sessions get detail. | Trustworthy blast radius: unauthenticated callers see only readiness boolean. `?deep=1` does a tiny admin DB reachability read. |
| `app/api/mizan/[token]/recording/route.ts` | Yes | Opaque reviewer token hashed into private storage path. | Trustworthy for one reviewer token; feature-gated, rate-limited, no tenant customer/order data. |
| `app/api/mizan/[token]/route.ts` | Yes | Opaque reviewer token hash. | Trustworthy for one reviewer token; feature-gated and rate-limited, no tenant customer/order data. |
| `app/api/payments/[sessionId]/route.ts` | Yes | Opaque payment session id in path. | Public checkout link by design. Blast radius is one payment session/order summary; mock mutations are disabled unless explicitly enabled. |
| `app/api/payments/moyasar/webhook/route.ts` | Yes | Moyasar webhook handler verifies provider payload secret and resolves tenant from the payment session. | Trustworthy if PSP webhook secret/session binding holds; no operator cookie expected. |
| `app/api/storefront/orders/route.ts` | Yes | Public storefront `slug` resolves an active restaurant. | Public ordering by design. Blast radius is placing an order against a public restaurant slug; server recomputes price and scopes all rows to slug tenant. |
| `app/api/track/[token]/route.ts` | Yes | Opaque customer tracking token in path. | Trustworthy for one delivery tracking view; rate limited. It returns only the token-owned delivery summary. |
| `app/api/whatsapp/webhook/route.ts` | Yes | WhatsApp phone-number id maps tenant; POST signature must match tenant or global app secret, with env fallback for legacy configured PNID. | Trustworthy if phone-number mapping and secrets are correct. Unmapped PNIDs are dropped; wrong signatures return 401. |

## Findings

CRITICAL: none confirmed by code inventory. No route was found where an ordinary tenant member can directly read another tenant's orders/customers/conversations through service-role code without a tenant check.

HIGH: none confirmed by code inventory.

MEDIUM: `app/api/agent/suggest/route.ts`, `app/api/orders/[id]/image/route.ts`, and `app/api/orders/[id]/send-receipt/route.ts` rely on session-client RLS for caller-supplied `conversationId` or `orderId` ownership instead of adding explicit route-level `restaurant_id = tenant.restaurantId` checks. This is not a confirmed leak because they do not use service-role for those data reads, but it is a defense-in-depth gap that must be attacked in staging.

LOW: `app/api/admin/voice/archive-golden-set/route.ts` and `app/api/admin/voice/ab-golden-set/route.ts` are platform-secret routes that can operate across tenant conversations by design. This is acceptable only if `CRON_SECRET` is treated as platform-admin power, not tenant-admin power.

LOW: `app/api/orders/[id]/driver-override/route.ts` writes a tenant-scoped alert but accepts `conversationId` and `orderNumber` from the body without proving they belong to the path order. I did not find a cross-tenant data read, but forged metadata could contaminate an alert.

LOW: public opaque-token routes such as `app/api/payments/[sessionId]/route.ts`, `app/api/track/[token]/route.ts`, and `app/api/delivery/[token]/*` depend on token secrecy and rate limits. That is expected for customer/driver links, but staging should verify expired/consumed token refusal and same-shape errors.

## Proof Results

Local proof file added: `scripts/proof-tenant-isolation.test.ts`.

Default local run proves:

- The report inventory exists.
- The inventory covers exactly every current `app/api/**/route.ts` file.
- The report contains all required grouping and findings sections.
- Route attack cases are explicitly skipped unless `RUN_TENANT_ISOLATION_ROUTE_BEHAVIOR=1` is provided with staging A/B HTTP cases.
- BRAIN behavior tests are explicitly skipped unless `RUN_BRAIN_TENANT_ISOLATION=1` is provided with staging Supabase A/B tenants and member JWTs.

Gated route-behavior matrix includes these required attack keys:

- `orders.cross_tenant_read`
- `conversations.cross_tenant_read`
- `customers.cross_tenant_read`
- `messages.cross_tenant_read`
- `menu_items.cross_tenant_read`
- `delivery_zones.cross_tenant_read`
- `members.cross_tenant_read`
- `alerts.cross_tenant_read`
- `payment_sessions.cross_tenant_read`
- `forge.body.restaurant_id`
- `forge.body.order_id`
- `forge.body.conversation_id`
- `forge.body.customer_id`
- `forge.query.restaurant_id`
- `forge.query.order_id`
- `forge.query.conversation_id`
- `forge.query.customer_id`
- `forge.path.order_id`
- `forge.path.conversation_id`
- `forge.path.customer_id`
- `cookie.active_restaurant_tamper`
- `token.driver_cross_tenant_data`
- `token.tracking_cross_tenant_data`
- `token.expired_or_consumed`
- `webhook.whatsapp_wrong_tenant_secret`
- `webhook.payment_wrong_tenant_secret`
- `enumeration.order_id`
- `enumeration.conversation_id`
- `enumeration.customer_id`
- `member.removed_loses_access`

Gated BRAIN behavior matrix covers the 0100-0103 BRAIN tables:

- 0100 foundation: `channel_inbox`, `conversation_threads`, `order_episodes`, `episode_turn_events`, `pending_prompts`, `safety_disclosures`, `order_quotes`, `outbox_messages`, `customer_memories`, `brain_runs`
- 0102 ingress: `webhook_envelopes`, `channel_events`, `ingress_safety_scans`
- 0103 execution: `brain_execution_effects`, `brain_execution_dead_letters`, `brain_execution_throttle_events`

BRAIN behavior assertions in gated mode:

- Member A can read own-tenant rows and cannot read tenant B rows in every BRAIN table.
- Member B can read own-tenant rows and cannot read tenant A rows in every BRAIN table.
- Authenticated members cannot insert, update, or delete own-tenant BRAIN rows.
- Cross-tenant composite FK attempts are rejected for representative relationships including inbox duplicate, thread/episode, event/envelope, scan/event, execution/event, dead-letter/inbox, and throttle/event.
- `order_episodes.current_quote_id` cannot point at a quote from another tenant.

## Skipped Or Gated Proofs

Skipped locally: live route attacks. Reason: no staging base URL, tenant A/B authenticated cookies, cross-tenant fixture ids, driver/tracking/payment tokens, or webhook signatures were provided in this work order.

Skipped locally: live BRAIN Supabase behavior. Reason: no staging Supabase URL/anon key/service-role key, tenant A/B ids, or member JWTs were provided. The harness is fail-closed when enabled and creates/cleans only its own fixture rows.

Not applied: migrations. This window is forbidden from applying database migrations.
