-- Soft-delete / revoke for admin access. When `revoked_at` is set the admin is
-- revoked and must NOT pass any admin check; the row stays as an audit record.
-- Re-granting clears revoked_at back to null. Every admin read filters
-- `revoked_at is null` (src/app/api/_lib/admin-check.ts, src/lib/adminCheck.ts).
alter table public.admin_users
  add column if not exists revoked_at timestamptz;
