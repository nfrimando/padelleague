alter table public.players
  add column if not exists is_ladder_opt_in boolean not null default false;
