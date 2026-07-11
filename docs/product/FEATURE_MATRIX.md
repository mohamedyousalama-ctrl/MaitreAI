# Kivo — Feature Matrix (Capability Inventory)

> **Owner:** Product / PM · **Status:** Draft for PM review · **Last reviewed:** 2026-07-10
> **Source of truth:** derived from the repository (code, migrations, specs) — not memory. Every row is code-anchored; where the code was ambiguous or docs conflict it is marked **UNVERIFIED**.
> **Scope:** one paragraph + module-by-module inventory (B), version/tier truth (C), a market-packaging **PROPOSAL** (D, the only opinion section), and a settings appendix (E).
> **Not in this doc:** secrets, credentials, tenant data, or customer examples.

## Status legend (code-verified)
| Status | Meaning |
|---|---|
| **LIVE** | Runs in production today — unconditional, or behind a default-ON gate. |
| **BUILT-FLAG-OFF** | Code complete and tested, behind a default-OFF per-tenant flag (byte-identical when off). |
| **IN-BUILD** | Partially built / half-wired — some real, some placeholder. |
| **SPEC'D** | Written spec exists; not yet built. |
| **PLANNED** | Roadmap/backlog only. |
| **UNVERIFIED** | Could not be confirmed from code/docs in this pass. |

**Gate** = the switch that controls it: an `explicit` per-tenant flag (`isFeatureExplicitlyEnabled` — NOT implied by `tier=pro`), a `pro-auto` flag (`isFeatureEnabled` — on for any `tier=pro`), a `SAFETY` flag (cannot be flipped off in console), an `env` deploy flag, or `always` (unconditional). **Market:** EG (Egypt / Wesaya / كريم-Karim), SA (Saudi / Kivo / خالد-Khalid), or both.

---

## A. Executive map

**Kivo** (Egypt brand: **MaitreAI / Wesaya**) is a WhatsApp-native AI ordering and operations platform for restaurants: a single multi-tenant engine runs one **Customer Agent** — a real-sounding host with a swappable dialect persona (**كريم / Karim**, Egyptian; **خالد / Khalid**, Saudi) — that takes the full order in-thread (menu → cart → fulfillment → payment → receipt), enforces a code-level **allergy-safety stack** no competitor packages, and hands off to a human on any genuine need. Around that agent sit an operator **console** (conversations, live shift, knowledge, approvals, insights, team), **payments** (COD + Vodafone Cash/InstaPay in EG, Moyasar card/mada in SA), a **delivery** module (zones, drivers, customer tracking), **kitchen tickets** (with an allergy banner), a public **storefront**, **monitoring/alerts**, and an emerging **intelligence** layer (conversation reports, outcomes, customer memory). First live client: **Wesaya Fried Chicken (Cairo)**; the Saudi market is an activation of the same core, not a fork.

**Modules (B):** 1) Customer Agent (persona/dialect) · 2) Ordering & Menu · 3) Payments · 4) Delivery & Dispatch · 5) Kitchen & Tickets/Print · 6) Channels (WhatsApp) & Storefront · 7) Console / Operations · 8) Onboarding & Go-Live · 9) Safety & Allergy stack · 10) Voice · 11) Monitoring & Alerts · 12) Insights / Outcomes / Intelligence · 13) Campaigns / Growth · 14) Customer Memory / Personalization · 15) Multi-branch & Zones · 16) Staff Command Channel & Team/Roles · 17) Quality & Eval (MIZAN, dialect linter).

---

## B. Module-by-module inventory

### 1. Customer Agent — persona & dialect engine
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| المحرك الواحد · One-engine agent | One Brain turn (`customer-turn`→`respond`) with centrally-owned truth/money/safety; personas are voice overlays only | LIVE | always | both | customer |
| شخصية كريم · Karim (Egyptian) | Default Egyptian host voice + canonical Masri spellings, Franco/slang decoding | LIVE | dialect=egyptian | EG | customer |
| شخصية خالد · Khalid (Saudi) | Saudi host overlay: karam register, region voice (Najd/Hijaz/Asir/Eastern), curated purity-scanned exemplars | BUILT-FLAG-OFF | `khalid_persona` | SA | customer |
| موسوعة السعودية · KSA encyclopedia | Injects a curated, byte-capped culture block (gahwa/dates spine; region+cuisine tiers), culture-only never menu | BUILT-FLAG-OFF | `ksa_encyclopedia` (needs khalid_persona) | SA | customer |
| كتيّبات خالد · Khalid playbooks | Appends Saudi playbooks + a terminal forbidden-claims banlist | BUILT-FLAG-OFF | `khalid_persona` | SA | customer |
| لهجة/أرقام/إيموجي · Dialect & tone knobs | Host name, digit style (Arabic-Indic vs Western), emoji/length from tenant tone config | LIVE | config-driven | both | customer |
| التقاط الإدراك · Perception read | One cheap Haiku read → intent/confidence/sentiment/risk (labeled inference, never a fact); skipped when a safety gate fired | BUILT-FLAG-OFF | `perception` | both | owner (obs.) |
| توجيه التعافي · Recovery directive | Low-confidence/unknown read → per-turn "clarify from real data, don't dead-end" directive | BUILT-FLAG-OFF | `perception` | both | customer |
| إيقاع الرد · Cadence | Length/tone track the turn; pace-mirroring; facts stay atomic | BUILT-FLAG-OFF | `cadence` | both | customer |
| تعليمات دائمة · Standing instructions | Injects operator durable rules + tonight notes as an escaped, safety-framed subordinate section | BUILT-FLAG-OFF | `standing_instructions` | both | owner |
| منيو بلاي-بوك · Menu playbook | Intent-router overlay (browse/recommend/constraint/compare) — **built leaf, not yet wired into the prompt** | UNVERIFIED (leaf, not injected) | `menu_playbook` (not in flag union) | both | customer |

### 2. Ordering & Menu
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| إضافة/تعديل صنف · add_to_order | Adds/【SET】s a menu item with size/choices/modifiers; merges identical lines; money computed from menu only | LIVE | orders mode | both | customer |
| حذف صنف · remove_from_order | Removes a draft line by name | LIVE | orders mode | both | customer |
| نوع الاستلام · set_fulfillment | Pickup or delivery + zone (fee applied); geo variant accepts a pickup branch | LIVE (geo variant BUILT-FLAG-OFF) | orders / `delivery_geo_routing` | both | customer |
| عنوان التوصيل · set_delivery_address | Stores the written street address (required before delivery finalize) | LIVE | orders mode | both | customer |
| ملخّص الطلب · get_order_summary | Re-prices and reads back the current draft + total | LIVE | orders mode | both | customer |
| إنهاء الطلب · finalize_draft | Places the order pending confirmation; blocks empty/no-fulfillment/no-address/86'd/below-min | LIVE | orders mode | both | customer |
| مسح الطلب · clear_order | Empties the in-progress draft (never touches placed orders) | LIVE | orders mode | both | customer |
| صور الأصناف · send_item_photos | Sends real dish photos (≤4) on ask/recommend; graceful if none | LIVE | always | both | customer |
| عرض المنيو · present_menu | Renders the menu as a tappable WhatsApp list from live data | LIVE | orders mode | both | customer |
| أزرار الكمية/الإجراءات/الدفع · present_* | Quick 1/2/3, تأكيد/إضافة/إلغاء, and payment-method buttons (anti-loop) | LIVE | orders mode | both | customer |
| طلب الحالة (Stateful) · stateful order block | Renders the authoritative current draft as ground truth; model sends only the delta | BUILT-FLAG-OFF | `stateful_orders` | both | customer |
| 86 / التوفر · availability toggle | Real-time out-of-stock with audit; agent refuses to sell an 86'd item | LIVE | always | both | staff |
| نشر المنيو · menu draft + publish | Draft table + atomic publish RPC; ingest→draft→publish onboarding path | LIVE | always | both | owner |
| CRUD المنيو (legacy) · full menu CRUD | Add/update/delete items, modifiers, FAQs, policies (legacy console only) | LIVE | legacy console | both | owner |

### 3. Payments
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| الدفع عند الاستلام · COD | Cash on delivery — the default path | LIVE | `cod_enabled` config | both | customer |
| فودافون كاش/إنستاباي · Vodafone Cash / InstaPay | Manual-wallet transfer instructions; order stays UNPAID until operator confirms | LIVE | config `enabled` | EG | customer |
| بطاقة عبر ميسّر · Card via Moyasar | Server-priced hosted invoice + pay-link (SAR/halalas) | BUILT-FLAG-OFF | `psp_payments` | SA | customer |
| رابط الدفع · Pay-link message | Sends order#/total/expiry + anti-phishing line from the tenant's number | BUILT-FLAG-OFF | with PSP session | SA | customer |
| ويبهوك تسوية ميسّر · Moyasar settlement webhook | The only path that marks an order paid; verifies amount+currency, idempotent, fails closed | BUILT-FLAG-OFF | `psp_payments` | SA | owner |
| منع الشحن أثناء التعليق · Safety-hold charge block | Refuses to create/settle a payment session on a safety-held order (409) | LIVE | always | both | customer |
| دفتر النقد (COD ledger) · COD ledger + settlement | Driver cash collection, per-order capture on delivery, per-driver end-of-shift settle, CSV export, slip PNG | LIVE | always (legacy `/cod`) | EG | staff/owner |
| Paymob (EG) / mada labels | Paymob PSP for Egypt is roadmapped (Phase 6); mada/Apple-Pay labels present for SA | PLANNED (Paymob) | — | EG/SA | customer |

### 4. Delivery & Dispatch
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| مناطق التوصيل · Delivery zones (circle) | Named circular zones (center+radius) with per-zone fee/ETA/branch; validated editor | LIVE | always | both | owner |
| توجيه بالدبوس · Pin → zone → branch routing | WhatsApp location pin → point-in-radius match → branch + fee from zone (nearest-branch tie-break) | BUILT-FLAG-OFF | `delivery_geo_routing` | both | customer |
| خارج النطاق · Outside-area soft flow | Honest "outside range, offer pickup" + `zone_miss` insight log | BUILT-FLAG-OFF | `delivery_geo_routing` | both | customer |
| تعيين سائق يدوي · Manual driver assignment | Operator assigns a driver; mints driver+customer tokens; WhatsApps the driver a link | LIVE | env `ENABLE_DELIVERY_TRACKING` (default ON) | both | staff |
| صفحة السائق · Driver page `/d/[token]` | Token-auth status buttons + GPS sharing while page open (no login) | LIVE | env `ENABLE_DELIVERY_TRACKING` | both | driver |
| تتبّع العميل · Customer tracking `/t/[token]` | Live status + driver dot poll (fresh 30s) | LIVE | env `ENABLE_DELIVERY_TRACKING` | both | customer |
| صف توصيل عند الإنهاء · Delivery row on finalize | Opens an assignable delivery row for delivery orders | LIVE | always | both | staff |
| جولات متعددة · Multi-order runs (delivery_runs) | Up to 3 orders/driver, Kivo-suggested (spec §3) | SPEC'D | — | both | staff |
| لوحة التوصيل (console) · Delivery board | Operator dispatch board in console_v2 (W-D3) | SPEC'D | — | both | staff |
| مضلّعات المناطق · Polygon zones | Arbitrary polygon zones (column exists, unused) | PLANNED (V2) | — | both | owner |
| **قاعدة السلامة** · Allergy notes never on driver view | Health/allergen notes appear on the kitchen ticket only, never the driver surface | LIVE (invariant) | always | both | — |

### 5. Kitchen & Tickets / Print
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| تذكرة المطبخ · Kitchen/delivery ticket PNG | High-contrast RTL 80mm ticket; every number from the DB, never the LLM | LIVE | always (render) | both | staff |
| بانر الحساسية · Allergy banner on ticket | Red boxed «⚠️ حساسية — لا يتم التحضير قبل مراجعة المطعم» + specific allergens; explicit green "no report" when clear | LIVE | always | both | staff |
| إيصال العميل · Customer receipt PNG | Branded RTL receipt auto-sent over WhatsApp (24h-window, fire-once) | LIVE | always | both | customer |
| قصاصة تسوية COD · COD settlement slip | Per-driver cash-reconciliation slip PNG | LIVE | with COD settle | EG | staff |
| طباعة QZ الصامتة · QZ Tray silent print | Silent thermal print via local QZ websocket; browser-dialog fallback; V1 unsigned | BUILT-FLAG-OFF | `qz_print` + printer config | both | staff |
| تدقيق طباعة التذكرة · Ticket print audit | `order_events` ticket_printed row; route 410s when off | BUILT-FLAG-OFF | `kitchen_ticket` | both | owner |

### 6. Channels (WhatsApp) & Storefront
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| ويبهوك ميتا موثّق · Signed Meta webhook | GET verify (global/per-tenant), POST HMAC-verify (fail-closed in prod), idempotent persist | LIVE | always | both | — |
| توجيه متعدد المستأجرين · Per-tenant routing | Routes inbound by `phone_number_id`; unmapped numbers dropped (with a safe global fallback) | LIVE | always | both | — |
| نص/أزرار/قوائم · Text + interactive in/out | Handles text, button/list replies; builds text, buttons (≤3), lists, templates (outside 24h) | LIVE | always | both | customer |
| رسائل صوتية واردة · Inbound voice STT | Transcribes voice notes before persist (transcript IS the stored text); mock refused in prod | LIVE (STT env-dependent) | always | both | customer |
| دبابيس الموقع · Inbound location pins | Parses a pin → `meta.location` for zone routing | BUILT-FLAG-OFF | `delivery_geo_routing` | both | customer |
| صور واردة · Inbound images | Image triggers a customer turn (caption/📷 = gate input; one-shot vision read stored provenance-marked as context) — fixes the 45-min silent-drop | BUILT-FLAG-OFF | `media_turn_trigger` | both | customer |
| إحالة إعلان (CTWA) · Ad-referral capture | Captures Meta click-to-WhatsApp referral metadata | LIVE (schema) | always | both | owner |
| إشعار "تمّت القراءة"/الكتابة · Read + typing | Honest seen/typing signal on inbound | BUILT-FLAG-OFF | `cadence` | both | customer |
| تسلّم بشري · Operator takeover send | Human replies from the tenant's own number, claims ownership, audits authorship | LIVE | always | both | staff |
| حارس الوسائط · Photo/media guard | Caps menu photos (3/msg, 6/convo), hard-zero on hold/complaint/payment | BUILT-FLAG-OFF | `media_guard` / `photo_thread` | both | customer |
| الواجهة العامة · Storefront `/order/[slug]` | Public branded menu + cart + checkout (live pricing) | LIVE | always | both | customer |
| تسجيل ميتا المدمج · Embedded Signup | Meta Embedded Signup: code→token exchange, WABA subscribe, encrypted per-tenant creds | IN-BUILD (Meta Tech-Provider review pending) | manager auth | both | owner |

### 7. Console / Operations
Two consoles coexist: **legacy** (`app/(console)`, live at bare URLs) and **console_v2** (`app/(console-v2)/c`, gated by env `CONSOLE_V2` + per-tenant `console_v2`). Operators (`operation` role) see only Live Shift + Conversations; the rest is manager-only.
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| كونسول v2 · console_v2 shell | The new one-rail, display-state-driven operator console | BUILT-FLAG-OFF | env `CONSOLE_V2` + `console_v2` | both | owner/staff |
| المحادثات · Conversations | Ownership spine (Karim's Stage vs Human Hall): takeover-at-send, return-to-Karim, close, safety-hold lock banner | LIVE | console | both | owner/staff |
| الوردية الحيّة · Live Shift | Active orders, Karim pause/resume, POS-handoff stamp, 86-an-item, order-heat map | IN-BUILD (some maps GATHERING) | console | both | owner/staff |
| المعرفة · Knowledge | What Karim knows: 86/tonight-notes (instant), gated price/desc/zone edits (→Approvals), allergen vocab (locked view-only) | IN-BUILD | console | both | owner |
| الموافقات · Approvals | Propose→approve→audited-apply signing folder; nothing auto-applies | LIVE | console | both | owner |
| العملاء · Customers | Regulars wall: real spend/orders aggregates; memory/timeline GATHERING | IN-BUILD | console | both | owner |
| الرؤى · Insights | Revenue/orders/AOV/COD-share/completion/top-item/order-sources (LIVE); margin/funnel/repeat GATHERING; export SOON | IN-BUILD | console | both | owner |
| النتائج · Outcomes | Written-once verdict per closed conversation | IN-BUILD (outcomes table not shipped) | `conversation_outcomes` | both | owner |
| الحملات · Campaigns | Capacity strip + template registry real; recipe/composer engine SOON | IN-BUILD | console | both | owner |
| الفريق والأدوار · Team & Roles | Invite member, change role (last-manager guard), permission matrix, command vocabulary | LIVE | console | both | owner |
| الإعدادات · Settings | Preflight room — see appendix (E) | LIVE | console | both | owner |
| لوحة legacy · Legacy console | `/dashboard`, `/menu` (full CRUD), `/deliveries`, `/cod`, `/settings` (COD/Vodafone/tone-dialect) | LIVE | legacy | both | owner/staff |
| اسأل كيفو · Ask Kivo overlay | Command-brain overlay (rail entry, no page) | SPEC'D | console | both | owner |
| كونسول الأدمن (chat) · Admin chat console | Operator free-text admin + in-chat promo builder | BUILT-FLAG-OFF | env `ENABLE_ADMIN_CHAT_CONSOLE` | both | owner |

### 8. Onboarding & Go-Live
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| واتساب (ربط) · WhatsApp connect | Embedded Signup "Connect" + 8-probe health board | IN-BUILD | manager auth | both | owner |
| تجربة القيادة · Test drive | Live sandboxed chat with the real Brain + one-click allergy safety-probe; nothing sent to customers | LIVE | console | both | owner |
| الانطلاق · Go-live gate | Checklist (whatsapp/menu/hours/zones), server re-checks on flip, per-row fix deep-links | IN-BUILD (whatsapp LIVE; others advisory/SOON) | console | both | owner |
| توفير المستأجر · Tenant provisioning | Provision + config endpoints (hours, persona, branches, zones, menu ingest) | LIVE | admin | both | owner |

### 9. Safety & Allergy stack (defense-in-depth)
Evaluation order per turn: base gate → symptom layer → phonetic net → (companion) emergency. See `docs/ALLERGY_COMPANION_SPEC.md`.
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| بوابة الحساسية الأساسية · Base allergen gate (input) | Explicit allergy word alone, OR avoidance/medical intent (incl. euphemisms) + a boundary-matched allergen → force safety escalation | LIVE | **always (unconditional)** | both | customer |
| مطابقة حدود الكلمة العربية · Arabic boundary matching | Boundary-aware term match so «اللوزتين» (tonsils) never trips «لوز» (WO-ALLERGEN-BOUNDARY) | LIVE | always | both | customer |
| حارس المخرجات · Never-say-safe output guard | Intercepts a reply that certifies an item allergen-safe on unknown data | LIVE | `deterministic_allergen_safety` (default-ON, SAFETY) | both | customer |
| كاشف الأعراض · Symptom/condition detector | Symptoms (choking/swelling/epipen), conditions (celiac/lactose/favism), English+Franco, child-triple → conservative escalation | BUILT-FLAG-OFF (do-not-enable-for-V1 per docs) | `allergen_symptom_detection` (SAFETY) | both | customer |
| الشبكة الصوتية · Phonetic safety net | Levenshtein near-match on garbled STT/typed allergen tokens (voice-scoped near budget) + low-confidence tripwire | LIVE | **always (unconditional)** | both | customer |
| كاشف الطوارئ · Emergency detector | Narrow present-tense active-reaction (airway/swelling/anaphylaxis/ambulance), excludes past/hypothetical/questions | BUILT-FLAG-OFF | consulted only when `allergy_companion_mode` | both | customer |
| وضع المرافقة · Allergy-Companion Mode (W1) | Swaps always-escalate for: acknowledge + keep talking, two-axis data truth, §6 checkpoint, §1e no-purgatory recovery, §4 audit, kitchen-note | BUILT-FLAG-OFF | `allergy_companion_mode` | both | customer |
| منع العبارات المحظورة · Banned-phrase scan | Blocks «آمن/مضمون/safe…» on any allergy-context reply (incl. authored text) | BUILT-FLAG-OFF (companion) | `allergy_companion_mode` | both | customer |
| ملاحظة الحساسية للمطبخ · Kitchen allergy-note | Monotonic, kitchen-readable Arabic note union («⚠️ حساسية: بيض، مكسرات») copied onto the order | BUILT-FLAG-OFF (companion; migration 0080 PREPARE-ONLY) | `allergy_companion_mode` | both | staff |
| سجل تدقيق الحساسية · Allergy audit trail | Append-only structured record of every allergy interaction (§4) | BUILT-FLAG-OFF (0080 PREPARE-ONLY) | `allergy_companion_mode` | both | owner |
| تعليق السلامة · SYSTEM_HOLD | An explicit safety hold can never auto-return to the agent | LIVE | always | both | staff |
| مصفوفة صنف×مسبب (W2/W3) · Full allergen×dish matrix | Per-dish ingredient/prep data + edit surfaces + MIZAN rewrite | SPEC'D | — | both | owner |

### 10. Voice
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| تفريغ صوتي وارد · Inbound STT | Voice note → transcript enters the same text+safety pipeline | LIVE (env adapter) | always | both | customer |
| رد صوتي إضافي · Outbound voice reply | TTS voice alongside text only when the customer used voice / asked (opt-in) | BUILT-FLAG-OFF | `voice_notes` | both | customer |
| ميزانية الصوت · Voice budget + suppression | Hard-zero on safety/money/payment-link/receipt; daily per-conversation cap (default 10) | BUILT-FLAG-OFF | `voice_notes` | both | owner |
| بديل TTS · TTS fallback | ElevenLabs → OpenAI onyx fallback; text always sent regardless | BUILT-FLAG-OFF | `voice_notes` | both | customer |

### 11. Monitoring & Alerts
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| تنبيهات حرجة · Critical alerts | WhatsApp-to-owner + banner + email on agent_error/send-failure/paid-while-held, with dedupe | LIVE | always | both | owner |
| مسح المراقبة · Monitoring sweep | Cron-guarded sweep: delivery silence, webhook-anomaly spikes, agent error-rate, daily spend (cooldown-gated) | LIVE (0079 PREPARE-ONLY) | env cron | both | owner |
| تدهور رشيق · Graceful degradation | Customer fallback + env-gated agent timeout so a failing agent never leaves silence | LIVE | env | both | customer |
| بنر التنبيهات · Alert banner list/dismiss | Operator alert list + dismiss | LIVE | console | both | owner |
| طابور إعادة المحاولة · Durable retry queue | Re-sends e.g. paid-confirmation on transient failure | LIVE (0067 PREPARE-ONLY) | cron | both | — |

### 12. Insights / Outcomes / Intelligence
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| تقارير المحادثة · Conversation reports (P1) | Terminal end-of-conversation report (deterministic spine + labeled soft layer) | BUILT-FLAG-OFF (**pro-auto**) | `conversation_intelligence` | both | owner |
| نتائج المحادثة · Conversation outcomes | Written-once structured verdict per closed conversation (the keystone) | IN-BUILD (0060 PREPARE-ONLY) | `conversation_outcomes` | both | owner |
| رؤى المال · Money KPIs | Revenue/orders/AOV/COD-share/completion/top-item/order-sources | IN-BUILD (LIVE KPIs + GATHERING) | console | both | owner |
| محرّك الرؤى · Insights engine (Layer 3) | Weekly owner report + margins + funnels (blocked on outcomes) | PLANNED | — | both | owner |
| طبقة القرار · Decision layer (Layer 4) | Kivo proposes ops/menu/growth actions to approve | PLANNED | — | both | owner |

### 13. Campaigns / Growth
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| سجل القوالب · Template registry | Per-tenant WhatsApp template registry + category-truth chips | IN-BUILD (0068 PREPARE-ONLY) | console | both | owner |
| شريط السعة · Capacity strip | Messaging capacity/quality estimate | LIVE | console | both | owner |
| محرّك الحملات · Campaign engine | Recipe-based sends, all through Approvals | PLANNED (no migration; V2/Phase-4) | — | both | owner |

### 14. Customer Memory / Personalization
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| ذاكرة العميل · Customer memory (P2) | Durable per-customer record (facts recomputed from orders + labeled inferences); operator-read DATA only, does NOT feed replies | BUILT-FLAG-OFF | `customer_memory` | both | owner |
| تجميعات العملاء · Customer aggregates | Real spend/orders/favorites for the Regulars wall | LIVE | console | both | owner |

### 15. Multi-branch & Zones
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| فروع متعددة · Multi-branch | Branches with per-branch zones/ETA; orders carry branch_id/zone_id | LIVE (schema) | always | both | owner |
| توجيه الفرع · Branch routing | Pin/zone resolves the serving branch | BUILT-FLAG-OFF | `delivery_geo_routing` | both | customer |

### 16. Staff Command Channel & Team/Roles
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| قناة أوامر الطاقم · Staff command channel | A registered staff number is diverted to a deterministic command handler | BUILT-FLAG-OFF | `staff_command_channel` | both | staff |
| طلب مكالمة · Callback requests | Detects «اطلب مكالمة», captures window, confirms honestly, alerts staff, tracks status | BUILT-FLAG-OFF | `callback_requests` | both | customer |
| تمييز أوامر المدير · Manager-command recognition | Recognizes manager commands on invite/inbound | BUILT-FLAG-OFF | `manager_command_recognition` | both | staff |
| الأدوار والصلاحيات · Roles & permissions | Manager/Operator roles, code-enforced permission matrix, last-manager guard, actor audit | LIVE | console | both | owner |

### 17. Quality & Eval
| Feature (AR · EN) | What it does | Status | Gate | Market | Serves |
|---|---|---|---|---|---|
| لوحة ميزان · MIZAN reviewer panel | Hosted per-token Saudi-reviewer scoring of Khalid's replies (dialect QA) | BUILT-FLAG-OFF (0078 PREPARE-ONLY) | env `ENABLE_MIZAN_PANEL` | SA | owner |
| لينتر اللهجة · Dialect-leakage linter | Pure outbound quality validator (soft signal, never blocks, not the safety gate) | LIVE (observability) | always | SA | owner |
| بوابة التقييم CI · CI eval gate | Blocking safety/dialect proof suites in CI | LIVE | always (CI) | both | — |

---

## C. Version & tier differentiation (current truth)

### Gate types (the packaging backbone)
- **`tier`** column = `standard | pro` (migration 0022). Wesaya is configured `tier='pro'`.
- **pro-auto flags** (`isFeatureEnabled` — ON for any `tier=pro` OR explicit true): **only `conversation_intelligence`** in the codebase today. Everything else is explicit-only.
- **explicit-only flags** (`isFeatureExplicitlyEnabled` — must be literally set, NOT implied by `tier=pro`): the other 22 `ProFeature` members. This is deliberate — each Pro capability is a separate, verifiable switch.
- **SAFETY flags** (cannot be flipped off in console; write-side `isSafetyFlag` guard): `deterministic_allergen_safety` (default-ON via 0037), `allergen_symptom_detection`.
- **Unconditional (never-flagged) safety behaviors:** base allergen gate, phonetic safety net, SYSTEM_HOLD structural hold.
- **env deploy flags:** `CONSOLE_V2` (off), `ENABLE_DELIVERY_TRACKING` (**on**), `ENABLE_MIZAN_PANEL` (off), `ENABLE_ADMIN_CHAT_CONSOLE` (off), `ENABLE_MOCK_PAYMENTS`/`ENABLE_MOCK_STT` (dev only).
- **Default state:** `feature_flags` column defaults `{}` (0024) → every flag OFF except `deterministic_allergen_safety` (backfilled ON in 0037). Migrations 0080/0081 add no flag default.

### "Karim Pro" capability ladder (documented P-levels)
P0 tier flag · P1 `conversation_intelligence` · P2 `customer_memory` (data only) · P3 `perception` · P4 `cadence` (+ later `stateful_orders`, `standing_instructions`, etc.). "Karim Pro" is the documented premium tier name; granular flags let a `standard` tenant buy a single Pro capability without flipping to `tier='pro'`.

### Product versions (from specs/roadmaps)
- **V1 (live / Wesaya, Phase 0):** ordering agent, allergen gate, COD+Vodafone Cash, ownership/takeover, 86ing, kitchen ticket, storefront, delivery tracking (manual), operator console, onboarding backend.
- **V1 finishing / V1.1:** Embedded Signup frontend (Meta review pending) · delivery geo-routing (W-D1) · conversation outcomes (keystone) · deferred: driver_shifts, full COD reconciliation, auto-assignment.
- **V2 (staged):** promotions/campaign engine · polygon zones · POS API integration · Allergy-Companion W2/W3 (per-dish matrix) · phone-call channel · Insights/Decision layers.

### Market differentiation (EG vs SA)
- **EG (Wesaya / كريم):** dialect=egyptian, EGP (ج.م), Arabic-Indic digits, VAT-inclusive default, COD + Vodafone Cash/InstaPay, phone 01→20. Paymob + ETA e-invoicing planned.
- **SA (Kivo / خالد):** dialect=saudi, SAR (ر.س), Western digits, +966/05 normalization, Riyadh TZ, Khalid persona + KSA encyclopedia, Moyasar/mada PSP, PDPL consent, Ramadan mode, MIZAN reviewer panel. **Genuinely-new SA gaps:** real PSP live (partly built) + **ZATCA e-invoicing (not in code)**. Same multi-tenant core — activation, not a fork.

> **UNVERIFIED (per-tenant runtime):** exactly which explicit flags Wesaya has ON cannot be read from code (it's tenant DB state). This doc states each feature's build/gate truth, not one tenant's live toggle set.
> **UNVERIFIED (migration apply state):** the live DB applies migrations out-of-band; several files (esp. 0040–0081) are self-marked PREPARE-ONLY while the roadmap implies 0051–0057 are applied. Treat migration-dependent features' data layer as "apply pending" unless confirmed against live history.

---

## D. Market best-practice packaging — **PROPOSAL (opinion, not inventory)**

> This section is the only place opinions live. It benchmarks our inventory against how leading restaurant-commerce / POS / WhatsApp-commerce products package tiers, then proposes a cut. Prices/tiers below are directional (2025–26, some third-party-sourced — re-confirm before quoting).

### Benchmark (abridged)
| Product | Tiers | Up-tier lever |
|---|---|---|
| Square for Restaurants | Free → Plus $49 → Premium $149/loc | Lower card rate + advanced reporting/loyalty |
| Toast | Starter $0 → POS $69 → Build-your-own | Lower processing + modules as line-items |
| Lightspeed Restaurant | Starter $69 → Essential $189 → Premium $399 | Multi-location, inventory, API |
| Foodics (EG) | ~$48 → $83 → $111/mo | Feature depth (tables/inventory/loyalty) |
| Wati (WhatsApp) | Growth → Pro → Business | **AI agents locked to Pro+**, seats, numbers |
| Zoko / Qiscus | tiered by agents/convos | Platform fee → 0 + volume, AI as upsell |
| Meta WhatsApp API | per-message (not tiers) | Marketing/Utility/Service categories; Service free |

### Packaging norms observed
1. Payments monetized as a **% rate**, not a gated feature — the tier pays for itself via a lower processing rate.
2. Free/entry tier acquires, then **monetizes on transaction fees**.
3. **Multi-location** is a top-tier / "call sales" lever.
4. In WhatsApp tools, **AI/automation is the premium hook** (Wati gates AI agents to Pro+).
5. Meta per-message cost is **passed through**, decoupled from the SaaS tier.
6. Modules (loyalty, KDS, online ordering) are often **à-la-carte line items**.
7. Seats / agents / conversation-volume are the primary **scaling axes** for chat tools.
8. **Analytics & support** gated to the premium tier.

### Proposed 3-tier cut (rationale per placement)
| | **Kivo Start** (entry) | **Kivo Pro** (growth) | **Kivo Agent+** (premium) |
|---|---|---|---|
| **Positioning** | Get selling on WhatsApp | Run the restaurant on it | AI concierge + intelligence |
| **Customer Agent** | Karim/Khalid full ordering agent (our wedge — AI is baseline, not gated) | + stateful orders, cadence, perception recovery | + companion allergy mode, standing instructions, KSA encyclopedia/persona depth |
| **Safety** | Full allergen gate + phonetic net (always on — never a paywall) | + symptom detection (post-review) | + Allergy-Companion (two-axis, checkpoint, audit) |
| **Payments** | COD + manual wallets | + card/PSP (Moyasar/mada) at a competitive rate | rate step-down at volume |
| **Delivery** | Zones + manual assignment + tracking | + geo pin routing | + multi-order runs + dispatch board |
| **Console** | Conversations + Live Shift + Settings | + Knowledge/Approvals + Insights KPIs | + Outcomes + Decision layer + Insights engine |
| **Ops** | Kitchen ticket + receipts | + QZ silent print + staff command channel | + campaigns/growth + customer memory |
| **Multi-branch** | Single branch | Up to N | Unlimited + branch routing |

**Rationale for the inversion (our key move):** competitors gate *AI* behind Pro/enterprise. Because our AI agent + allergy-safety + dialect authenticity are the differentiators, we make **the agent and safety the baseline** (the thing nobody else has, driving acquisition) and reserve the **proven POS up-tier levers** — multi-location, analytics/outcomes, lower payment rate, campaigns, dispatch — for Pro/Agent+.

### Where we differentiate (competitors don't package these)
- **In-thread ordering AI** (not a broadcast/FAQ bot, not just an ordering link).
- **Allergy-safety / liability stack** — no analog in any tier above; a compliance + trust story competitors would need menu-data depth to copy.
- **Dialect authenticity (Masri / Khaleeji)** — a genuine MENA moat vs generic-Arabic global tools.
- **Commission-free direct ordering** framing (escape 20–30% aggregator fees) delivered by an agent, not a static storefront.

### Gaps we should be honest about (competitors have, we lack)
- No **loyalty / rewards** program module.
- No **inventory management** (COGS/stock) — blocks true margin insights.
- **Campaign/marketing engine** not built (registry only).
- **E-invoicing:** ZATCA (SA) absent in code; ETA (EG) deferred.
- No **billing/subscription** system for Kivo itself (undefined).
- **POS integration** is handoff-only (no deep API sync yet).
- No **table-service / dine-in** POS surface (we are ordering-first).
- Reporting/analytics is **partial** (outcomes keystone unbuilt) vs mature POS dashboards.

---

## E. Settings & options appendix (every configurable control)

### Per-tenant feature flags (`restaurants.feature_flags`; default OFF unless noted)
`conversation_intelligence` (pro-auto) · `customer_memory` · `conversation_outcomes` · `perception` · `cadence` · `stateful_orders` · `deterministic_allergen_safety` (**default ON, SAFETY-locked**) · `allergen_symptom_detection` (**SAFETY-locked**) · `psp_payments` · `staff_command_channel` · `standing_instructions` · `kitchen_ticket` · `console_v2` · `media_guard` · `khalid_persona` · `ksa_encyclopedia` · `callback_requests` · `qz_print` · `voice_notes` · `photo_thread` · `manager_command_recognition` · `delivery_geo_routing` · `allergy_companion_mode` · `media_turn_trigger`.
Env deploy flags: `CONSOLE_V2`, `ENABLE_DELIVERY_TRACKING` (default ON), `ENABLE_MIZAN_PANEL`, `ENABLE_ADMIN_CHAT_CONSOLE`, `ENABLE_MOCK_PAYMENTS`/`ENABLE_MOCK_STT` (dev).

### Console settings controls
| Setting (AR · EN) | What it controls | Where |
|---|---|---|
| اسم المطعم/الشخصية/المنطقة الزمنية · Identity | Restaurant name, agent persona name, timezone | Settings → `/api/settings/identity` |
| إيقاف طارئ · Emergency pause/resume | Instant reversible agent pause | Settings/Shift → `/api/settings/ops` |
| اختبار واتساب · WhatsApp round-trip + 8-probe health | Prove outbound delivery; read connection health | Settings → `/api/settings/whatsapp-health` |
| أعلام الميزات · Feature flags | Flip any non-safety flag; safety flags shown locked-ON | Settings → `/api/settings/flags` |
| ساعات العمل · Business hours | Per-day open/close the agent quotes (edit deferred — UNVERIFIED) | Settings → `/api/settings/hours` |
| مفاتيح ميسّر · PSP keys | Publishable/secret/webhook keys (write-only secrets) | Settings (needs `psp_payments`) → `/api/settings/psp` |
| الدفع اليدوي/COD · Payment config | COD enable, Vodafone Cash number (legacy settings) | Legacy Settings → `/api/settings/payment` |
| الطابعة · Printer | QZ printer pick, 58/80mm width, auto-print toggle | Settings (needs `qz_print`) → `/api/settings/printer` |
| مناطق التوصيل · Delivery zones | Draw circular zones: center, radius, fee, ETA, branch | Settings/Onboarding → zone editor |
| اللهجة/النبرة · Tone & dialect | saudi/egyptian dialect + persona display (legacy; SOON in v2) | Legacy Settings → `/api/onboarding/config/persona` |
| ملاحظات الليلة · Tonight notes | Add auto-expiring staff notes | Knowledge → `/api/settings/tonight-notes` |
| قوالب واتساب · Templates | Per-tenant template registry (category-truth) | Campaigns → `/api/settings/templates` |
| الانطلاق · Go-live | Readiness checklist + flip | Onboarding → `/api/onboarding/go-live` |

### Onboarding choices
1) **WhatsApp** — Embedded Signup connect + health board. 2) **Test drive** — sandbox chat + allergy safety-probe. 3) **Go live** — checklist (whatsapp required; menu/hours/zones advisory) + optional inline zone editor.

---

## Summary — counts per status per module
| Module | LIVE | BUILT-FLAG-OFF | IN-BUILD | SPEC'D | PLANNED |
|---|---|---|---|---|---|
| 1. Customer Agent (persona) | 3 | 6 | 0 | 0 | 0 (+1 UNVERIFIED) |
| 2. Ordering & Menu | 12 | 1 | 0 | 0 | 0 |
| 3. Payments | 4 | 3 | 0 | 0 | 1 |
| 4. Delivery & Dispatch | 5 | 2 | 0 | 2 | 1 |
| 5. Kitchen & Tickets | 4 | 2 | 0 | 0 | 0 |
| 6. Channels & Storefront | 7 | 3 | 1 | 0 | 0 |
| 7. Console / Operations | 5 | 2 | 5 | 1 | 0 |
| 8. Onboarding | 2 | 0 | 2 | 0 | 0 |
| 9. Safety & Allergy | 5 | 6 | 0 | 1 | 0 |
| 10. Voice | 1 | 3 | 0 | 0 | 0 |
| 11. Monitoring & Alerts | 5 | 0 | 0 | 0 | 0 |
| 12. Insights / Intelligence | 0 | 1 | 2 | 0 | 2 |
| 13. Campaigns / Growth | 1 | 0 | 1 | 0 | 1 |
| 14. Customer Memory | 1 | 1 | 0 | 0 | 0 |
| 15. Multi-branch & Zones | 1 | 1 | 0 | 0 | 0 |
| 16. Staff / Team | 1 | 3 | 0 | 0 | 0 |
| 17. Quality & Eval | 2 | 1 | 0 | 0 | 0 |
| **Total** | **59** | **35** | **11** | **5** | **6** |

_Counts are indicative (some rows span states); statuses are code-verified, per-tenant flag state and migration-apply state are UNVERIFIED as noted in Section C._
