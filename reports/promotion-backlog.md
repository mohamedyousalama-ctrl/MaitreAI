# Promotion builder — Phase 2 backlog (do NOT build now)

Phase 1 (in-chat builder: conceive → design → price → preview → approve → launch,
all in the console, template image, tool-computed prices, manager-gated publish)
shipped 2026-06-13. Phase 1 "launch" = the promo goes **LIVE** as an active
`promotions` row; there is **no outbound broadcast** (omitted, no fake "sent").

## Phase 2 (the real §T promotion engine — Sprint 11)
1. **Outbound broadcast** — send the approved promo to customers via the
   WhatsApp **template rail (S9-4)**, honoring the §T **3-way consent split**
   (opted-in / ask-first / never), the 5-template library, and opt-out. This is
   the actual broadcast engine; Phase 1 deliberately stops at "live".
2. **AI-generated promo images** — a real image-generation service (NEW PAID
   key → gated on owner approval + cost note, like the STT decision). The
   template render (lib/render/promo) stays the default/fallback.
3. **Promo performance card** — sent / opened / redeemed surfaced in-chat.
4. **Scheduling / recurring** promos (start later, repeat weekly, happy-hour
   windows) — the promotions table already has `schedule`/`state` for this.
5. **Edit / pause / end** a live promo from the console.
6. **Stacking + caps + eligibility** (budget_cap, per-customer caps, min-order)
   — columns exist; surface them in the builder for richer offers.
