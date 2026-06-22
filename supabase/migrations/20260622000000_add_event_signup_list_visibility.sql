alter table public.events
  add column if not exists signup_list_visible boolean not null default true;
