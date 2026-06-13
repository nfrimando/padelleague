-- Drop the existing FK (which may have ON DELETE CASCADE in the live DB)
ALTER TABLE public.signups_players
  DROP CONSTRAINT IF EXISTS signups_players_player_id_fkey;

-- Re-add without cascade: player_id goes NULL when player is deleted
ALTER TABLE public.signups_players
  ADD CONSTRAINT signups_players_player_id_fkey
    FOREIGN KEY (player_id)
    REFERENCES public.players(player_id)
    ON DELETE SET NULL;
