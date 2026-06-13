-- Add new columns to events table for unified model
alter table public.events
  add column if not exists visibility           text not null default 'published'
    check (visibility in ('draft', 'published')),
  add column if not exists created_by_player_id bigint references public.players(player_id),
  add column if not exists signup_deadline      date,
  add column if not exists player_limit         integer,
  add column if not exists format               text,
  add column if not exists notes                text;

-- Existing events are already live — keep them published
update public.events set visibility = 'published' where visibility = 'draft';

-- Drop old event_proposals infrastructure
drop policy if exists "Players can insert own proposals" on public.event_proposals;
drop policy if exists "Players can view own proposals" on public.event_proposals;
drop table if exists public.event_proposals;
