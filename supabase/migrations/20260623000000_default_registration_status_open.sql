-- Events should default to open registration on creation; status can be
-- changed afterwards by the creator or an admin.
ALTER TABLE public.events
  ALTER COLUMN registration_status SET DEFAULT 'open';
