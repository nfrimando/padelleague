-- One signup row per (event, player).
--
-- Previously the register routes INSERTed a second row when a player re-signed up
-- after cancelling, while the duplicate checks read back with a bare .maybeSingle()
-- — so a second row made those lookups error. The routes now revive the existing
-- row instead (see insertOrReviveSignup in src/app/api/events/_lib/pairs.ts), which
-- makes this constraint safe to add.
--
-- Verified before writing this migration: zero duplicate (event_id, player_id)
-- groups existed in the database, so no dedupe step is needed. Re-check before
-- applying if signups have been created since:
--
--   SELECT event_id, player_id, count(*)
--   FROM public.signups_events
--   WHERE player_id IS NOT NULL
--   GROUP BY event_id, player_id
--   HAVING count(*) > 1;
--
-- Partial, because player_id is nullable for the vestigial guest-signup rows.
CREATE UNIQUE INDEX signups_events_event_player_uniq
  ON public.signups_events (event_id, player_id)
  WHERE player_id IS NOT NULL;
