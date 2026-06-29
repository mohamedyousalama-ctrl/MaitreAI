-- ============================================================================
-- 0052 — conversations.stage (WB2, Be-On sales-lifecycle parity)
--
-- Wesaya's current Be-On has SALES stages (new / offer / follow-up / no-answer /
-- lost / done) that Kivo lacked — Kivo had ownership (ownership_state, 0032) and
-- order status (orders.order_status) but no conversation SALES stage.
--
-- stage is a NEW, SEPARATE axis on conversations. It is NOT ownership and NOT
-- order status (those live on orders, a different table) — a conversation can be
-- no_answer with no order; an ordered conversation still has the order's own
-- status on the order row. Do not conflate.
--
-- Stage keys (Arabic labels in the UI):
--   new             جديد
--   asking_offer    يسأل عن عرض
--   taking_order    جاري أخذ الطلب
--   follow_up       محتاج متابعة
--   no_answer       لا يرد
--   handed_to_human تم التحويل
--   ordered         تم الطلب
--   closed          مغلق
--   lost            خاسر / لم يتم
--
-- Additive + NOT NULL DEFAULT 'new' → every existing AND future conversation
-- starts 'new' (no backfill, no data touched). A CHECK constrains the values.
-- stage is set ONLY server-side via an authenticated staff action
-- (POST /api/conversations/[id]/stage), which validates the value and audits
-- who/when via audit_events (no extra columns). No RLS change (conversations'
-- existing tenant policies govern it). PREPARE-ONLY — review before prod apply.
-- ============================================================================

alter table public.conversations add column if not exists stage text not null default 'new';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_stage_chk'
  ) then
    alter table public.conversations
      add constraint conversations_stage_chk
      check (stage in (
        'new', 'asking_offer', 'taking_order', 'follow_up',
        'no_answer', 'handed_to_human', 'ordered', 'closed', 'lost'
      ));
  end if;
end $$;

-- Rollback (manual; not auto-run):
--   alter table public.conversations drop constraint if exists conversations_stage_chk;
--   alter table public.conversations drop column if exists stage;
