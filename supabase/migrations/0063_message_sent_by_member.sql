-- ============================================================================
-- MaitreAI — R6: message authorship attribution (Attribution Law) — ADDITIVE.
-- PREPARE-ONLY.
--
-- sent_by_member_id = the console MEMBER who AUTHORED this outbound message.
-- Column semantics (the Attribution Law): it identifies the human who wrote the
-- words that left the building, NOT merely whoever triggered a send.
--   • Operator reply (whatsapp/send) and operator-sent receipt → the acting member.
--   • Karim's own turns (webhook / agent / resume-to-Karim) → NULL (= Karim): the
--     words are the agent's, and attributing them to the releasing member would
--     misattribute authorship. The release itself is audited by its own route.
--   • Driver-dispatch / customer track-link (deliveries subsystem) write NO
--     conversation `messages` row, so they are INAPPLICABLE here by design (not
--     omitted) — Kivo ends at handoff; deliveries attribution, if it ever returns
--     as a module, gets delivery_events.actor_member_id in that WO.
--
-- Nullable, no default → every existing + agent message stays NULL (Karim). No
-- RLS change (messages RLS already governs reads). Idempotent.
-- ============================================================================

alter table public.messages
  add column if not exists sent_by_member_id uuid references public.members(id) on delete set null;

create index if not exists messages_sent_by_member_idx
  on public.messages(sent_by_member_id) where sent_by_member_id is not null;

notify pgrst, 'reload schema';
