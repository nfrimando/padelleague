-- Add new columns to events table
alter table public.events
  add column if not exists restrictions jsonb,
  add column if not exists event_url    text;

-- Create event_proposals table
create table if not exists public.event_proposals (
  proposal_id           bigint primary key generated always as identity,
  name                  text not null,
  start_date            date not null,
  end_date              date,
  description           text,
  format                text,
  player_limit          integer,
  event_url             text,
  restrictions          jsonb,
  proposed_by_player_id bigint not null references public.players(player_id),
  proposed_by_auth_id   uuid   not null references auth.users(id),
  proposer_notes        text,
  status                text not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected')),
  admin_notes           text,
  reviewed_by           uuid references auth.users(id),
  reviewed_at           timestamptz,
  event_id              bigint references public.events(event_id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- RLS: players can insert and read their own proposals
alter table public.event_proposals enable row level security;

create policy "Players can insert own proposals"
  on public.event_proposals for insert
  to authenticated
  with check (proposed_by_auth_id = auth.uid());

create policy "Players can view own proposals"
  on public.event_proposals for select
  to authenticated
  using (proposed_by_auth_id = auth.uid());
