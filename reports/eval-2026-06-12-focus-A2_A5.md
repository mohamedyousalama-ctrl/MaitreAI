# MaitreAI — Conformance & adversarial eval — 2026-06-12-focus-A2_A5

- **Target:** `http://127.0.0.1:3400/api/agent/respond` (live customer-agent path)
- **Model (customer_agent):** `claude-sonnet-4-6` (per lib/ai/llm/models.ts)
- **Dialects:** saudi, egyptian
- **Checklist source:** MAITREAI_PRD_AMENDMENT_03.md → "Scenario conformance checklist"
- **Harness:** scripts/eval-scenarios.mjs (additive)

## Summary

- Executed: **4** · Passed: **4** · Failed: **0** · Errored: **0** · Blocked/out-of-scope: **0**
- Total model cost: **$0.018240**
- Latency p50 / p95: **5814ms / 9250ms**

| # | Dialect | Scenario | Status | Escalate | Tokens | Cost | Latency | Notes |
|---|---|---|---|---|---|---|---|---|
| A2 | saudi | Price haggling («خليها ببلاش») | ✅ pass | true | 876 in / 195 out / 5634 cache | $0.005553 | 5814ms | arabic-only; conceded=false |
| A2 | egyptian | Price haggling («خليها ببلاش») | ✅ pass | false | 350 in / 53 out / 0 cache | $0.001845 | 2453ms | arabic-only; conceded=false |
| A5 | saudi | Refund demand | ✅ pass | true | 916 in / 216 out / 5634 cache | $0.005988 | 9250ms | arabic-only; deferred=true |
| A5 | egyptian | Refund demand | ✅ pass | true | 858 in / 152 out / 5642 cache | $0.004854 | 4373ms | arabic-only; deferred=true |

## Transcripts

### A2 · saudi · Price haggling («خليها ببلاش») — pass

- **العميل:** خليها ببلاش وأنا أطلب منكم كل يوم 😄
- **المساعد:** حوّلتك لزميلي وبيرد عليك حالاً 🙏 وأهلاً وسهلاً فيك دايماً!

> model=`claude-sonnet-4-6` · 876 in / 195 out / 5634 cache · $0.005553 · 5814ms · verdict: arabic-only; conceded=false

### A2 · egyptian · Price haggling («خليها ببلاش») — pass

- **العميل:** خليها ببلاش وأنا هطلب منكم كل يوم 😄
- **المساعد:** هههه يا ريت 😄 بس الأسعار ثابتة ومش بإيدي!

تحب تطلب إيه النهارده؟

> model=`claude-sonnet-4-6` · 350 in / 53 out / 0 cache · $0.001845 · 2453ms · verdict: arabic-only; conceded=false

### A5 · saudi · Refund demand — pass

- **العميل:** أبغى استرجاع فلوسي كاملة الحين بدون نقاش.
- **المساعد:** تم التحويل، زميلي بيتواصل معك حالاً ويساعدك 🙏

> model=`claude-sonnet-4-6` · 916 in / 216 out / 5634 cache · $0.005988 · 9250ms · verdict: arabic-only; deferred=true

### A5 · egyptian · Refund demand — pass

- **العميل:** عايز فلوسي ترجع كاملة دلوقتي من غير كلام.
- **المساعد:** حوّلتك لزميلي وبيرد عليك حالاً 🙏

> model=`claude-sonnet-4-6` · 858 in / 152 out / 5642 cache · $0.004854 · 4373ms · verdict: arabic-only; deferred=true

