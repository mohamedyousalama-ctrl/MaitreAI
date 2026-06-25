# Wesaya V1 Launch Checklist

> **Milestone:** Launch Wesaya Fried Chicken with V1 Kivo  
> **Purpose:** Prove that Kivo can operate a real restaurant-owned WhatsApp ordering flow safely end-to-end.  
> **Tenant:** `5acbc72f-def3-46cd-ad6c-bf0ff4a23642`  
> **WhatsApp phone_number_id:** `1204305262760496`

---

## 1. Environment readiness

- [ ] `NEXT_PUBLIC_SUPABASE_URL` set in Vercel (Production)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in Vercel
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in Vercel
- [ ] `ANTHROPIC_API_KEY` set in Vercel
- [ ] `AGENT_ROUTE_SECRET` set to `5acbc72f-def3-46cd-ad6c-bf0ff4a23642:<token>` (new per-tenant format)
- [ ] `WHATSAPP_ACCESS_TOKEN` set (permanent System-User token for Wesaya's WABA)
- [ ] `WHATSAPP_PHONE_NUMBER_ID` set to `1204305262760496`
- [ ] `WHATSAPP_VERIFY_TOKEN` set (matches Meta App webhook config)
- [ ] `WHATSAPP_APP_SECRET` set (for X-Hub-Signature-256 verification)
- [ ] `WHATSAPP_RESTAURANT_ID` set to `5acbc72f-def3-46cd-ad6c-bf0ff4a23642`
- [ ] `NEXT_PUBLIC_APP_URL` set to `https://getkivo.io`
- [ ] All vars confirmed present in Vercel Production (not just Preview)

---

## 2. Supabase migrations

- [ ] All migrations 0001–0039 applied to production
- [ ] `npx supabase db diff` shows no pending migrations
- [ ] RLS policies active on all tenant-scoped tables
- [ ] `conversation_locks` table exists (migration 0034)
- [ ] `ownership_state` column exists on `conversations` (migration 0032)
- [ ] `is_safety_hold` column exists on `conversations` (migration 0028)
- [ ] `cod_collections` and `cod_settlements` tables exist (migration 0029)

---

## 3. Wesaya tenant configuration

- [ ] Restaurant row exists: `id = 5acbc72f-def3-46cd-ad6c-bf0ff4a23642`
- [ ] `agent_mode = 'live'` (or `'test'` for soft launch)
- [ ] `is_open = true`
- [ ] `active = true`
- [ ] `tier = 'pro'` (or appropriate tier for feature access)
- [ ] `wa_phone_number_id` = `1204305262760496` (or per-tenant WhatsApp config row exists)
- [ ] WhatsApp access token stored encrypted in `whatsapp_credentials` table
- [ ] At least one manager `members` row for the Wesaya operator account

---

## 4. Menu loaded and verified

- [ ] All Wesaya menu items are in `menu_items` with `restaurant_id = 5acbc72f...`
- [ ] All items have correct names (in Arabic), prices, and categories
- [ ] All items have `available = true` (or correctly set if 86'd)
- [ ] Modifiers attached where relevant (extra sauce, size, etc.) with correct prices
- [ ] No test/demo items from other tenants
- [ ] Agent proof: send "عايز أشوف المنيو" → Karim lists real Wesaya items only
- [ ] Agent proof: order specific item → Karim quotes the correct price

---

## 5. Hours / zones / persona configured

- [ ] `restaurant_hours` rows exist for all operating days (migration 0039)
- [ ] Delivery zones configured in `delivery_areas` with correct area names and minimum orders
- [ ] Persona/tone set: `agent_persona_name`, `dialect = 'egyptian'`, `ai_tone` configured
- [ ] Agent proof: message outside hours → Karim responds appropriately
- [ ] Agent proof: request delivery to zone → Karim confirms or rejects correctly

---

## 6. WhatsApp webhook verified

- [ ] Meta App webhook URL set to `https://getkivo.io/api/whatsapp/webhook`
- [ ] Webhook verify token matches `WHATSAPP_VERIFY_TOKEN`
- [ ] Webhook subscription active for `messages` field
- [ ] GET handshake proof: curl the verify URL → returns challenge correctly
- [ ] Meta App has `whatsapp_business_management` permission (or test mode active)

---

## 7. Inbound / outbound round-trip proof

- [ ] Send a real WhatsApp message to the Wesaya number
- [ ] Message appears in `messages` table with correct `restaurant_id`
- [ ] A `conversations` row is created or found
- [ ] `respondAndSendWhatsApp()` runs (check `agent_runs` for a cost row)
- [ ] Karim reply is sent via WhatsApp Cloud API (check `messages.status = 'sent'`)
- [ ] Reply appears in WhatsApp on the test device
- [ ] Redelivery of same `channel_message_id` → no duplicate conversation or reply (dedup works)
- [ ] Check logs: no signature errors, no 4xx/5xx from Meta

---

## 8. Order creation proof

- [ ] Send a complete order: item + quantity + delivery address
- [ ] Karim builds draft (check `messages.meta.draft`)
- [ ] Karim asks for recap confirmation
- [ ] Customer confirms → `orders` row created in DB
- [ ] Order appears in Kivo console (Orders page)
- [ ] `payment_status = 'unpaid'` (COD) or correct status
- [ ] `fulfillment = 'delivery'` or `'pickup'` matches what was ordered
- [ ] Agent proof: order total matches menu prices (no invented amounts)

---

## 9. Safety / allergen proof

- [ ] Send: "عندي حساسية من البندق" during an order flow
- [ ] Karim fires the allergen gate (check `conversations.is_safety_hold = true`)
- [ ] Conversation ownership flips to `SYSTEM_HOLD` (not AI_ACTIVE)
- [ ] Karim does NOT confirm the order while the safety hold is active
- [ ] Operator sees the safety hold alert in the console
- [ ] Agent proof: Karim does NOT assert "الأكل خالي من البندق" — never safety-asserts
- [ ] Safety hold requires deliberate operator action to release (not auto-returned)

---

## 10. Human takeover / return-to-AI proof

- [ ] Operator clicks takeover in console → `owner = 'human'`, `ownership_state = HUMAN_ACTIVE`
- [ ] Customer sends another message → Karim does NOT reply (human owns the thread)
- [ ] Operator replies as human → reply sent via WhatsApp
- [ ] Operator clicks return-to-AI → `owner = 'ai'`, `ownership_state = AI_ACTIVE`
- [ ] Next customer message → Karim resumes reply

---

## 11. COD / payment proof

- [ ] Finalized delivery order → `cod_collections` row created
- [ ] Operator can record cash collected via `/api/cod/collect` (manager-only)
- [ ] Operator can settle driver cash via `/api/cod/settle` (manager-only)
- [ ] Non-manager member → 403 on both routes (confirmed)

---

## 12. Receipt / order status proof

- [ ] Order finalized → receipt message sent to customer via WhatsApp
- [ ] Receipt shows correct items, quantities, total, and order number
- [ ] Customer sends "فين الايصال؟" → Karim resends receipt (resend_receipt tool)
- [ ] Order status update visible in console

---

## 13. Tenant isolation proof

- [ ] Query from another tenant's credentials → cannot see Wesaya orders or conversations
- [ ] Direct API call with wrong `restaurant_id` but valid auth → returns 403 or empty (no cross-tenant data)

---

## 14. Operator console walkthrough

- [ ] Wesaya manager can log in at getkivo.io
- [ ] Dashboard shows Wesaya data (not demo/other tenant data)
- [ ] Conversations page shows live conversations
- [ ] Orders page shows real orders
- [ ] Operator can manually change order status
- [ ] Settings page shows Wesaya WhatsApp config (last inbound/outbound timestamps)

---

## 15. Soft launch gate

Before opening to real customers:

- [ ] Internal test: 10 full order flows completed without errors
- [ ] Allergy test: 3 allergy-mention scenarios escalate correctly
- [ ] Price test: 5 different items ordered — all quoted at correct menu prices
- [ ] Human takeover: tested and confirmed working
- [ ] Staff walkthrough: Wesaya team has seen the console and knows the workflow
- [ ] Backup process documented: what to do if Karim fails (manual WhatsApp reply)

---

## Day 1 launch monitoring

Track from the first real conversation:

- [ ] All inbound messages processed (no silent drops)
- [ ] All Karim replies delivered (no `status = 'failed'` messages unaddressed)
- [ ] No `agent_error` escalations in the first hour
- [ ] No wrong prices reported by customers
- [ ] Safety holds handled promptly by operators
- [ ] First 10 orders reviewed manually

---

## Notes

- **Delivery tracking:** `ENABLE_DELIVERY_TRACKING=false` for V1 launch. Manual delivery coordination. Enable only after V2 dispatch UI is polished.
- **`escalation_timeout_minutes`:** Not wired to stuck-detection (deferred). Stuck detection uses hardcoded 10-minute threshold.
- **Meta verification:** Business verification and template approval are async (Meta-side). The product works before templates are approved (customer-initiated 24h window is sufficient for V1).
- **Allergen symptom detection:** Merged (flag OFF). Do NOT enable for V1 — awaiting human Arabic term-list review.
