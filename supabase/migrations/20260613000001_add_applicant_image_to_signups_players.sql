alter table public.signups_players
  add column if not exists applicant_image_url text;
