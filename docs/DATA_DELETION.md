# Customer data-deletion runbook (internal)

**Audience:** an authorized admin with production database access (Supabase SQL
editor / service-role). **Purpose:** fulfill a customer's request to delete their
personal data, honestly and completely, while preserving the financial records we
are required to retain (stripped of personal identifiers).

> This is a **manual, reviewed procedure** — there is no self-serve deletion
> endpoint by design (deletion is irreversible and must be authorized). Read the
> whole document, then run the steps inside a single transaction.

---

## 0. Principles

- **Delete what we don't need to keep; anonymize what we must keep.** Conversation
  content and derived profiles are deleted. Financial/transaction records (order
  totals, COD ledger, tax-relevant data) are **retained but stripped of PII**
  (name, phone, address, free-text notes) — the money facts stay, the person
  becomes unidentifiable.
- **A bare `DELETE FROM customers` is NOT enough.** Deleting the `customers` row
  only `SET NULL`s the foreign keys (see the FK map below); it leaves the message
  **text**, order **address**, and PII inside `jsonb` columns behind. You must
  scrub those explicitly.
- **Scope to one tenant.** All customer data is tenant-scoped by `restaurant_id`.
  Always filter by the restaurant the request concerns.
- **Snapshot first.** Before deleting, run the read-only export
  (`scripts/export-tenant-data.mjs`, S8) or a `SELECT` to confirm exactly what
  exists for this customer — both as a sanity check and a record of fulfillment.

---

## 1. Data inventory — where a customer's data lives

| Table | PII / customer-linked columns | On `customers` delete | Action |
|---|---|---|---|
| `customers` | `phone`, `name`, `notes`, `tags`, `language`, `ltv`, `opt_in_*` | (the row itself) | **Delete or anonymize** (root) |
| `customer_memory` | derived facts/labels, `customer_id` | **CASCADE** (auto-deleted) | Deleted automatically |
| `conversations` | `customer_id` (link only) | `SET NULL` | **Delete** (removes the thread; cascades messages) |
| `messages` | `text` (message **content**), `channel_message_id` | via conversation `CASCADE` | **Delete** (by deleting the conversation) |
| `conversation_reports` | `customer_id`, narrative text | `SET NULL` | **Delete** (rows for this customer) |
| `conversation_signals` | conversation-linked | via conversation | Deleted with the conversation |
| `agent_runs` | `input`/`output` may hold message text, `conversation_id` | — | **Delete** (rows for the customer's conversations) |
| `orders` | `customer_id`, `address`, `notes`, `items`/meta | `SET NULL` | **Anonymize** (retain totals; strip PII) |
| `order_events` | `meta` jsonb may hold address/phone | via order `CASCADE` | Scrub/clear `meta` PII |
| `deliveries` | `customer_token` (tracking link), order-linked | via order `CASCADE` | Anonymize/expire (cascades if order deleted) |
| `delivery_locations` | driver GPS (not customer PII) | via delivery | No customer PII — leave |
| `cod_collections` / `cod_settlements` / `cod_cash_events` | `driver_name` (not customer); order-linked, **financial** | `order_id` is `CASCADE` from orders | **Retain** (no direct customer PII; do NOT delete the order) |
| `promotion_redemptions` | `customer_id`, `order_id` | `SET NULL` | Retain amount; `customer_id` → null |
| `audit_events` | `metadata` jsonb may hold `from`/`to` phone | — | Scrub matching `metadata` |
| `system_alerts` | `context` jsonb may hold `{from: <phone>}` (inbound_persist_failed) | — | Scrub/delete matching `context` |

**Key FK behaviors to remember**
- `orders.customer_id`, `conversations.customer_id`, `conversation_reports.customer_id`,
  `promotion_redemptions.customer_id` → `ON DELETE SET NULL`.
- `customer_memory.customer_id` → `ON DELETE CASCADE`.
- `messages.conversation_id` → `ON DELETE CASCADE` (deleting a conversation deletes its messages).
- `deliveries.order_id` and `cod_collections.order_id` → `ON DELETE CASCADE` from `orders`
  — **this is exactly why we anonymize orders instead of deleting them**: deleting an
  order would destroy its COD/delivery financial records.

---

## 2. Identify the customer

```sql
-- :restaurant_id and :phone identify the request. Phone is unique per tenant.
select id as customer_id, phone, name
from public.customers
where restaurant_id = :restaurant_id
  and phone = :phone;          -- store as the canonical/normalized form used at write time
```

Capture `:customer_id`. Then enumerate the linked records you'll act on:

```sql
select id from public.conversations where restaurant_id = :restaurant_id and customer_id = :customer_id;  -- :conversation_ids
select id from public.orders        where restaurant_id = :restaurant_id and customer_id = :customer_id;  -- :order_ids
```

Also note the raw `:phone` value — it's needed to scrub the `jsonb` PII stores
(`audit_events.metadata`, `system_alerts.context`) that key on the phone, not the id.

---

## 3. Execute (run inside ONE transaction; review before commit)

```sql
begin;

-- 3a. DELETE conversation content (cascades messages + signals) and AI runs.
delete from public.agent_runs
  where restaurant_id = :restaurant_id
    and conversation_id in (select id from public.conversations
                            where restaurant_id = :restaurant_id and customer_id = :customer_id);

delete from public.conversation_reports
  where restaurant_id = :restaurant_id and customer_id = :customer_id;

delete from public.conversations            -- CASCADE deletes messages + conversation_signals
  where restaurant_id = :restaurant_id and customer_id = :customer_id;

-- 3b. ANONYMIZE orders — retain financial facts (totals, order_number, dates,
--     COD ledger via cascade-protected order rows); strip personal identifiers.
update public.orders
   set customer_id = null,
       address     = null,
       notes       = null
 where restaurant_id = :restaurant_id and customer_id = :customer_id;

-- 3c. Scrub order_events PII (clear any address/phone left in meta for these orders).
update public.order_events
   set meta = '{}'::jsonb
 where restaurant_id = :restaurant_id
   and order_id in (:order_ids)
   and meta ? 'address';        -- adjust to whichever PII keys your events carry

-- 3d. Expire/blank delivery tracking tokens for the customer's orders.
update public.deliveries
   set customer_token = null
 where order_id in (:order_ids);

-- 3e. Promotion redemptions: keep the amount, drop the customer link.
update public.promotion_redemptions
   set customer_id = null
 where restaurant_id = :restaurant_id and customer_id = :customer_id;

-- 3f. Scrub jsonb PII stores keyed on the phone.
update public.system_alerts
   set context = context - 'from'
 where restaurant_id = :restaurant_id and context->>'from' = :phone;

update public.audit_events
   set metadata = (metadata - 'from') - 'to'
 where restaurant_id = :restaurant_id
   and (metadata->>'from' = :phone or metadata->>'to' = :phone);

-- 3g. The customer root. Choose ONE:
--   (i) DELETE — also CASCADE-deletes customer_memory; FKs above are already
--       null/handled. Use when no anonymized history needs to stay linked.
delete from public.customers
 where restaurant_id = :restaurant_id and id = :customer_id;

--   (ii) ANONYMIZE in place — keep one tombstone identity that retained order
--        rows can still reference. Use instead of (i) if you prefer linked history.
-- update public.customers
--    set phone = 'deleted:' || id, name = '', notes = '', tags = '{}',
--        marketing_opt_in = false, opt_in_source = null, opt_in_at = null
--  where restaurant_id = :restaurant_id and id = :customer_id;

-- Review the row counts above, then:
commit;   -- or rollback; if anything looks wrong.
```

> `customer_memory` is not listed explicitly: option (i) cascades it; with option
> (ii) delete it manually (`delete from public.customer_memory where customer_id = :customer_id;`).

---

## 4. Verify

```sql
-- No customer row / no PII left anywhere that keys on this person.
select count(*) from public.customers       where restaurant_id = :restaurant_id and phone = :phone;            -- expect 0 (or tombstone only)
select count(*) from public.conversations   where restaurant_id = :restaurant_id and customer_id = :customer_id; -- 0
select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id
  where c.customer_id = :customer_id;                                                                            -- 0
select count(*) from public.orders          where restaurant_id = :restaurant_id and customer_id = :customer_id; -- 0 (now null)
select count(*) from public.system_alerts   where context->>'from' = :phone;                                     -- 0
select count(*) from public.audit_events    where metadata->>'from' = :phone or metadata->>'to' = :phone;        -- 0
```

Confirm the retained financial rows still reconcile (order totals + COD ledger
unchanged) — only the personal identifiers were removed.

---

## 5. What we can fully delete vs only anonymize (honesty)

- **Fully deleted:** conversations + their messages, AI runs, conversation reports,
  derived `customer_memory`, the `customers` record (or tombstoned), and the
  customer link on promotions/orders.
- **Retained but stripped of PII:** order **transaction records** (totals, dates,
  order numbers) and the **COD ledger** (`cod_collections`/`cod_settlements`/
  `cod_cash_events`) — these may be needed for accounting/tax integrity and driver
  cash reconciliation. They carry no direct customer PII once the order is
  anonymized (no name/phone/address); they reference the order by id only.

---

## 6. Record the fulfillment (without re-introducing PII)

Log that a deletion request was completed — **store the `customer_id`/request id,
the date, and who actioned it; do NOT write the customer's phone/name into the
fulfillment log** (that would re-create the PII you just removed).
