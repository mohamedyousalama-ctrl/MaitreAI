# MaitreAI — Arabic Language & Terminology Guide (v1)

> Binding source of truth for ALL Arabic strings in MaitreAI (operator app,
> customer WhatsApp agent, rendered images, templates, marketing pages).
> Companion to PRD Amendment 03 §L; where they overlap, they agree — if a
> conflict is ever found, Amendment 03 wins. Expand this file as string work
> progresses; never contradict it silently.

---

## 1. The two Arabic layers (binding)

**Layer A — Operator app (web/console):** professional, short, operational
Modern Standard Arabic with a light, friendly register. ONE register for all
tenants — the operator UI never switches dialect. No slang, no stiffness.
Examples: «طلب جديد» · «بانتظار الدفع» · «يحتاج تدخل بشري» · «تمت الطباعة».

**Layer B — Customer WhatsApp agent:** dialect-aware per tenant
(`restaurants.dialect`: `saudi` | `egyptian`). Warm, brief, tap-first,
human — like a skilled host, never robotic.

| Moment | Saudi 🇸🇦 | Egyptian 🇪🇬 |
|---|---|---|
| Greeting | هلا فيك، وش تحب تطلب اليوم؟ | أهلاً بيك، تحب تطلب إيه النهارده؟ |
| Order confirm | تم، طلبك هو: برجر كلاسيك + بطاطس. الإجمالي ٤٥ ر.س. أجهّزلك الطلب؟ | تمام، طلبك هو: برجر كلاسيك + بطاطس. الإجمالي ٤٥ ج.م. أجهّزلك الطلب؟ |
| Escalation | أحتاج أتأكد من الفريق عشان أعطيك إجابة دقيقة. بحوّلك لأحد من الفريق الآن. | محتاج أتأكد من الفريق عشان أرد عليك صح. هحوّلك لحد من الفريق دلوقتي. |
| Closed | نعتذر منك 🌙 المطعم مغلق حالياً، نفتح الساعة ١١ صباحاً. | معلش 🌙 المطعم مقفول دلوقتي، بنفتح الساعة ١١ الصبح. |
| Heard a voice note | سمعتك 👌 ... صح؟ | سمعتك 👌 ... صح كده؟ |

Rules for Layer B: confirm money and orders explicitly; one clarifying
question max before offering buttons/lists; emoji sparingly and warmly;
never lecture; never blame the customer.

## 2. Terminology table (binding replacements)

| Avoid / current | Use |
|---|---|
| بوت، شات بوت، روبوت | المساعد (UI) · الموظف الذكي للمطعم (product phrase) |
| الذكاء (as the agent's name in UI) | المساعد — e.g. «المساعد يعمل»، «رد مقترح من المساعد»، «إعادة المحادثة للمساعد» |
| لوحة التحكم | الرئيسية / نبض المطعم |
| المطبخ (nav item) | (removed — order statuses live inside «الطلبات») |
| عقل المطعم | ذاكرة المطعم (UI label; "Brain" stays as the internal/technical concept) |
| مركز مراجعة الذكاء | مراجعة المساعد |
| قيد البناء (order draft) | مسودة طلب / طلب غير مؤكد |
| تعديلات (item options) | اختيارات / إضافات / بدون |
| نظام إدارة مطاعم / ERP | (never describe the product this way) |

**Product one-liner:** «MaitreAI هو موظف واتساب ذكي للمطاعم يستقبل الطلبات،
يرد على العملاء، ويتعلم من كل محادثة.»

## 3. Truth-driven status strings (binding, per Amendment 03 F3)

Status text may ONLY render when the underlying state is actually true:
- «واتساب متصل» only when the WhatsApp channel is live-connected.
- «المساعد نشط» only when the agent is enabled AND the system mode allows it.
- Modes must be explicit and visible: تجريبي (demo) · إعداد (setup) ·
  اختبار (test) · مباشر (live) · متوقف/مغلق (paused/closed) · خلل (degraded).
- No hardcoded status claims anywhere (the legacy sidebar «الموظف الذكي نشط /
  متصل بواتساب» fixed text is prohibited).

## 4. Numbers, currency, dates

- Currency follows tenant country: ر.س (KSA) · ج.م (Egypt), after the amount.
- Digit style is a THEME TOKEN per tenant/country: Western digits (45) are
  the default for KSA amounts (matches Jahez/HungerStation convention);
  Arabic-Indic (٤٥) acceptable for Egypt-facing strings. Be consistent
  within a surface.
- Accept Arabic-Indic digit INPUT everywhere regardless of display style.
- Weekend phrasing follows country (Fri–Sat); Hijri references (رمضان، العيد)
  are understood and resolved per the PRD.

## 5. Voice & escalation framing

- Escalation is SAFETY, not failure: «حوّلتك لزميلي وبيرد عليك حالاً 🙏» —
  never «النظام لا يفهم».
- The agent never argues, never gets defensive, apologizes briefly and
  specifically, and never promises what policy/tools don't allow.
- Human takeover line to customer (optional, tenant-configurable, default
  off): «تم تحويلك لأحد زملائنا 🙋‍♂️».

## 6. Implementation rules

- Centralize all strings in a terminology/constants module (per-layer,
  per-dialect maps). No inline hardcoded Arabic in components.
- Every new string PR must state which layer (A/B) and dialect(s) it adds.
- RTL correctness is part of string review (punctuation, parentheses,
  mixed-direction tokens like «MaitreAI» inside Arabic sentences).
- Customer-facing copy changes are content, not code: keep them editable
  without redeploy where the architecture allows (templates/config).
