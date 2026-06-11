-- Track which existing member referred a new applicant
alter table public.signups_players
  add column if not exists referrer_id bigint references public.players(player_id);
