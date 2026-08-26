-- 0111 — pin search_path on six trigger functions
-- APPLIED to production 2026-08-26 via Supabase apply_migration.
--
-- Supabase advisor WARN 0011 "Function Search Path Mutable".
--
-- All six are zero-argument TRIGGER functions owned by postgres and are
-- SECURITY INVOKER (prosecdef = false) — verified live before applying.
--
-- Urgency, recorded honestly: the classic mutable-search_path exploit requires
-- SECURITY DEFINER, where a planted shadowing object executes with the
-- definer's elevated privileges. With SECURITY INVOKER the body runs as the
-- caller, so hijacking name resolution gains an attacker nothing they could not
-- already do directly. Routine hardening, not an open hole.
--
-- Every non-catalog reference in every body is already schema-qualified and
-- every type involved is a pg_catalog builtin, so pinning changes no
-- resolution. pg_catalog stays implicitly first. 'public' is retained for
-- robustness against future body edits; pg_temp is named LAST — when pg_temp is
-- not listed explicitly Postgres searches it FIRST, which is what this prevents.

alter function public.touch_updated_at()                  set search_path = public, pg_temp;
alter function public.touch_conversations_updated_at()    set search_path = public, pg_temp;
alter function public.enforce_min_one_manager()           set search_path = public, pg_temp;
alter function public.enforce_min_one_manager_on_delete() set search_path = public, pg_temp;
alter function public.bump_control_epoch()                set search_path = public, pg_temp;
alter function public.log_assignment_event()              set search_path = public, pg_temp;
