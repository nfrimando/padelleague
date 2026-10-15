-- Solo ladder auto-requeue: when on, the player gets a fresh waiting ticket (back of the line) as soon
-- as their ladder match is recorded. A player preference, so it persists across cycles. Backing out,
-- leaving the queue, or an expired match turns it off (see src/lib/ladder/ladderQueue.ts).
alter table public.players
  add column if not exists ladder_auto_requeue boolean not null default false;
