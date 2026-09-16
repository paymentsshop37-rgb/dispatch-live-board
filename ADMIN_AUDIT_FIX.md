# Admin audit failure — verified September 16, 2026

## Exact cause

The live `public.activity_log.entity_id` was `bigint`. Admin user profiles have
UUID IDs. A service-role insert of the exact audit payload shape reproduced
Postgres **22P02, invalid input syntax for type bigint** in a rolled-back
production transaction. Retrying without metadata cannot fix this type mismatch.

The original migration, `20260627000100_create_nttr_fleet_operations_tables.sql`,
declares `entity_id uuid` inside `CREATE TABLE IF NOT EXISTS`; that does not alter
an existing table. The July 22 and September 3 metadata migrations only add
`metadata`. No repository migration reconciled the deployed bigint column.
The historical operation that originally created that bigint column is not
established by these migrations.

## Complete flow and identities

1. `src/modules/users/UserManagement.jsx` invokes `admin-users` with the signed-in
   session, action `reset-password`, target profile ID, password and change flag.
2. `supabase/functions/admin-users/index.ts` validates the session with `getUser`,
   resolves the caller's application profile and requires an active admin.
3. The server-only service-role client finds the target profile, validates its
   linked `auth_user_id`, looks up that Auth account and calls `updateUserById`.
4. It checks the returned Auth UUID, updates `force_password_change`, then writes
   `PASSWORD_RESET` to `activity_log`. The target is `app_users.id`; `created_by`
   and `metadata.performed_by` contain the caller's verified Auth UUID.
5. The browser displays the warning only when the server returns
   `audit_recorded: false`. The password already changed successfully.

The audit was already server-side; no service key was moved to the browser.
The shared helper is now in `supabase/functions/admin-users/audit.ts`.

## Live schema/security inspection

| Column | Type before repair | Required/default |
| --- | --- | --- |
| id | bigint | NOT NULL, identity primary key |
| entity_type | text | NOT NULL, supplied |
| entity_id | bigint | nullable, UUID payload caused failure |
| action | text | NOT NULL, supplied |
| description | text | nullable |
| created_by | text | nullable, accepts admin Auth UUID |
| created_at | timestamptz | NOT NULL, defaults to now() |
| metadata | jsonb | nullable, present in production |

There are no foreign keys or non-primary-key constraints on this table, and no
user triggers. RLS is enabled, not forced. The service role has INSERT permission
and BYPASSRLS. The sole policy is the restrictive `active authenticated users only`
policy from `20260710000100_secure_app_users.sql`. None of these prevented this
server insert. Post-deployment comparisons confirmed policies, grants, RLS,
constraints, triggers and service-role settings were unchanged.

## Repair and affected actions

`20260916000100_repair_activity_log_entity_id.sql` converts the generic entity
reference to text using `entity_id::text`. This preserves existing numeric
references and accommodates UUIDs across users, jobs and technicians. The
migration was rehearsed with rollback, applied to the linked production project
and registered in migration history. The `admin-users` Edge Function was deployed.

The audit helper no longer retries with lost metadata. It logs the original
code, message, details and hint alongside action/actor/target identifiers, without
logging passwords or tokens. Deletion responses now also include `audit_recorded`.
Password reset behavior and its existing browser warning remain intact.

The shared fix covers reset, creation, sync, updates, role/status changes,
Delete User and Delete Profile. Deletion audit references have no FK to the
deleted identity, so they survive deletion.

Separate finding: browser activity logging in
`src/modules/activity/activityLogService.js` uses the authenticated client.
The current restrictive-only RLS policy provides no permissive access, so those
browser reads/inserts can be denied independently of this type mismatch. No
permissions were broadened as part of this admin repair.

## Verification

- Production rollback rehearsal preserved all existing entity references and
  accepted reset/deletion UUID audits plus legacy numeric references.
- Full deployed API test used disposable admin and dispatcher accounts, including
  distinct admin profile and Auth UUIDs. Reset succeeded, login with the new
  password worked, the force-change flag persisted, and the audit row contained
  the correct actor, target and metadata. Non-admin reset returned 403.
- Delete User removed Auth/profile records and retained creation/reset/deletion
  audits. Delete Profile recorded `USER_PROFILE_DELETED` for an orphan profile.
- Temporary accounts were removed; their audit records were retained.
- Regression tests cover all admin action payloads, original database diagnostics,
  transport errors and deletion audit-failure reporting. Full suite and production
  build passed (build emitted existing chunk/dynamic-import warnings).

No frontend deployment is needed for the password-reset repair.
