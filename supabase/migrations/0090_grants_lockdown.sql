-- ============================================================================
-- 0090 — WO-GRANTS-LOCKDOWN (🔴 pre-launch): revoke the broad EXECUTE grants on two
-- SECURITY DEFINER functions. Models 0088's grant-lockdown, but does NOT re-emit any
-- function body — GRANT-ONLY, so there is zero transcription risk on the ~110-line
-- bodies. Idempotent (revoke/grant are re-runnable).
--
-- THREAT (PM-verified against prod SHA fdaf57a7):
--   • reset_restaurant(uuid)      — SECURITY DEFINER with a live grant to `authenticated`
--     PLUS the implicit PUBLIC-execute-on-create (so anon inherits EXECUTE). It DOES have
--     an internal manager guard (0007:23-28), so tenant isolation holds today; the broad
--     grant is the defense-in-depth smell — an UNauthenticated role should never even
--     reach a SECURITY DEFINER function.
--   • seed_demo_restaurant(uuid)  — SECURITY DEFINER with NO internal guard and NO explicit
--     grant at all → runs purely on the default PUBLIC-execute-on-create. An anon caller
--     can spam-create tenants and forge a `members` manager row for an arbitrary uid.
--
-- CALLER FACTS (why the two functions are locked DIFFERENTLY — the pivotal divergence
-- from 0088, which could revoke `authenticated` because publish's only caller is a
-- service_role server route):
--   • reset_restaurant's ONLY caller is lib/store.ts:355 `resetAll()` → the BROWSER
--     client `_sb.rpc(...)` = the `authenticated` role (anon apikey + the manager's JWT).
--     There is NO service route. Revoking `authenticated` would break resetAll(). So we
--     KEEP `authenticated` and remove only the anon/public reachability; the internal
--     auth.uid() manager guard (0007) remains the real authorization control.
--   • seed_demo_restaurant has ZERO application callers (only dev/test scripts/*.mjs hit
--     it with the anon key against local/staging). In production it is dead surface, so
--     it is locked to service_role only. Dev/test scripts must switch to a service key
--     post-lockdown (non-blocking dev follow-up, tracked separately).
--
-- DEFERRED (NOT in this migration — filed as follow-ups):
--   (a) an internal server-only guard on seed_demo_restaurant (`raise if auth.uid() is
--       not null`) — would require re-emitting the ~110-line 0003 body; grant-only already
--       closes the hole, so the body re-emit isn't worth the launch-window risk.
--   (b) a possible DROP FUNCTION seed_demo_restaurant in prod (eliminate the dead
--       surface entirely) — pending founder confirmation nothing shared needs it.
--
-- PREPARE-ONLY: a live-schema grant write — review before apply, same ceremony law as
-- 0088/0089. Validate via BEGIN…ROLLBACK with SET ROLE (see the ceremony script). NOT
-- auto-applied.
-- ============================================================================

-- reset_restaurant — keep the legit authenticated manager-browser caller (its internal
-- auth.uid() manager guard enforces tenant isolation); remove the anon/public exposure.
revoke execute on function public.reset_restaurant(uuid) from public;
revoke execute on function public.reset_restaurant(uuid) from anon;
grant  execute on function public.reset_restaurant(uuid) to authenticated;  -- re-affirm the ONE legit caller
grant  execute on function public.reset_restaurant(uuid) to service_role;

-- seed_demo_restaurant — no production caller, no internal guard → lock to server-only.
revoke execute on function public.seed_demo_restaurant(uuid) from public;
revoke execute on function public.seed_demo_restaurant(uuid) from anon, authenticated;
grant  execute on function public.seed_demo_restaurant(uuid) to service_role;

-- Rollback (manual): restore the prior grants (git: 0007_reset.sql line 122
-- `grant execute … to authenticated`; 0003_seed.sql had no explicit grant → the default
-- PUBLIC execute). These functions' BODIES are untouched by this migration.
