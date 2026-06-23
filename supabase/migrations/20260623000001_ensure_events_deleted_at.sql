-- `deleted_at` already exists on `events` in production (added out-of-band,
-- not previously tracked by a migration). Tracking it here so fresh/staging
-- environments stay in sync now that both admins and event creators can
-- soft-delete events (see /api/events/[id] DELETE).
alter table public.events
  add column if not exists deleted_at timestamptz;
