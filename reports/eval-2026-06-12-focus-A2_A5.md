# MaitreAI — Conformance & adversarial eval — 2026-06-12-focus-A2_A5

- **Target:** `http://127.0.0.1:3400/api/agent/respond` (live customer-agent path)
- **Model (customer_agent):** `claude-sonnet-4-6` (per lib/ai/llm/models.ts)
- **Dialects:** saudi, egyptian
- **Checklist source:** MAITREAI_PRD_AMENDMENT_03.md → "Scenario conformance checklist"
- **Harness:** scripts/eval-scenarios.mjs (additive)

## Summary

- Executed: **4** · Passed: **4** · Failed: **0** · Errored: **0** · Blocked/out-of-scope: **0**
- Total model cost: **$0.013188**
- Latency p50 / p95: **4627ms / 7021ms**

| # | Dialect | Scenario | Status | Escalate | Tokens | Cost | Latency | Notes |
|---|---|---|---|---|---|---|---|---|
| A2 | saudi | Price haggling («خليها ببلاش») | ✅ pass | false | 350 in / 87 out / 3017 cache | $0.002355 | 3637ms | arabic-only; conceded=false |
| A2 | egyptian | Price haggling («خليها ببلاش») | ✅ pass | false | 350 in / 68 out / 0 cache | $0.002070 | 3261ms | arabic-only; conceded=false |
| A5 | saudi | Refund demand | ✅ pass | true | 487 in / 238 out / 6034 cache | $0.005031 | 7021ms | arabic-only; deferred=true |
| A5 | egyptian | Refund demand | ✅ pass | true | 469 in / 155 out / 6042 cache | $0.003732 | 4627ms | arabic-only; deferred=true |

## Transcripts

### A2 · saudi · Price haggling («خليها ببلاش») — pass

- **العميل:** خليها ببلاش وأنا أطلب منكم كل يوم 😄
- **المساعد:** هههه والله نقدّر ولاءك الغالي 😄 بس التخفيضات والعروض ترجع للإدارة وما أقدر أتصرف فيها من عندي!

وش تحب تطلب اليوم؟ 🙏

> model=`claude-sonnet-4-6` · 350 in / 87 out / 3017 cache · $0.002355 · 3637ms · verdict: arabic-only; conceded=false

### A2 · egyptian · Price haggling («خليها ببلاش») — pass

- **العميل:** خليها ببلاش وأنا هطلب منكم كل يوم 😄
- **المساعد:** هههه يسعدنا طلبك كل يوم 😄 بس الخصومات دي بترجع للإدارة مش بإيدي!

تحب تطلب إيه النهارده؟

> model=`claude-sonnet-4-6` · 350 in / 68 out / 0 cache · $0.002070 · 3261ms · verdict: arabic-only; conceded=false

### A5 · saudi · Refund demand — pass

- **العميل:** أبغى استرجاع فلوسي كاملة الحين بدون نقاش.
- **المساعد:** زميلي بيرد عليك حالاً ويساعدك في كل شيء 🙏

> model=`claude-sonnet-4-6` · 487 in / 238 out / 6034 cache · $0.005031 · 7021ms · verdict: arabic-only; deferred=true

### A5 · egyptian · Refund demand — pass

- **العميل:** عايز فلوسي ترجع كاملة دلوقتي من غير كلام.
- **المساعد:** حوّلتك لزميلي وبيرد عليك حالاً 🙏

> model=`claude-sonnet-4-6` · 469 in / 155 out / 6042 cache · $0.003732 · 4627ms · verdict: arabic-only; deferred=true

