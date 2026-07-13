# WO-SECURITY-1 — Founder click-script (post-apply live check)

The migration `0088_publish_menu_draft_lockdown.sql` is **PREPARE-ONLY** — the source
proof (`scripts/proof-security-1-publish-lockdown.test.ts`) verifies its content in CI,
but the real behavioral check runs **after** the ceremony applies it to the live DB.

Run these three on the live project (SQL editor / psql). Use a **test tenant / Kivo
Demo** restaurant_id + draft_id — never Wesaya's live row.

Legend: ✅ = must hold.

---

## 0. Pre-check — confirm the leaked grant is gone
```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_name = 'publish_menu_draft';
```
- ✅ `grantee` is **service_role** (and the owner) only — **no `anon`, no `authenticated`**.

## 1. Anon call → permission denied (grant revoke works)
As the **anon** role (anon key, no user JWT):
```sql
select public.publish_menu_draft('<any-restaurant-id>', '<any-draft-id>');
```
- ✅ Fails with **`permission denied for function publish_menu_draft`** — the body never runs.

## 2. Authenticated NON-member → guard exception (defense-in-depth)
As an **authenticated** user who is **not** a manager of the target restaurant (temporarily
grant EXECUTE to `authenticated` to exercise the guard, then revoke again — or test via a
signed-in non-member session):
```sql
select public.publish_menu_draft('<restaurant-they-do-not-manage>', '<draft-id>');
```
- ✅ Fails with **`[menu] not authorized to publish for restaurant …`** — the internal
  `auth.uid() IS NOT NULL` + member-manager guard rejects them.
- ✅ The target tenant's menu is **unchanged** (no rows touched).

## 3. The onboarding wizard publish → still succeeds (legit path intact)
In the app, as a **manager** of the test tenant, complete the onboarding menu step and
press publish (this hits `POST /api/onboarding/menu/publish` → `admin.rpc` = service_role):
- ✅ Publish **succeeds** — the service_role caller has `auth.uid()` = NULL, so the guard
  is skipped (the route already verified manager membership), and the grant is retained.
- ✅ The live menu reflects the draft; any previously **86'd** surviving item stays 86'd
  (0050 preserve-86 behavior is unchanged).

---

**If all three hold, WO-SECURITY-1 has closed the hole:** an unauthenticated (or
authenticated non-member) caller can no longer wipe an arbitrary tenant's menu, while the
onboarding wizard — the one live caller — keeps working.

> **Coupling (deferred to WO-MENU-CRUD):** publish is still keyed by `name` (rename =
> remove-old + add-new, losing that item's id/86). The id-key rewrite + `unique(restaurant_id,
> name)` is the larger coupled change MENU-CRUD needs; it is intentionally **not** in
> SECURITY-1, which is scoped to grant-revoke + internal-auth only.
