alter table public.players
  add column if not exists is_duel_roulette_opt_in boolean not null default false;
