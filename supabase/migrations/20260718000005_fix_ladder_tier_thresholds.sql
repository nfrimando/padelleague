-- The placeholder ladder_tiers seed (20260718000000_add_ladder_tiers.sql) used an unrelated
-- 0/1000/1200/1400 points scale and was missing a Diamond tier. Replace it with the real
-- thresholds on the app's 0-6 rating scale: Bronze 0-1.5, Silver 1.5-3, Gold 3-4.5,
-- Platinum 4.5-6, Diamond 6+. See .claude/ladder.md.

DELETE FROM public.ladder_tiers;

INSERT INTO public.ladder_tiers (name, rank, elo_floor) VALUES
  ('Bronze',   1, 0),
  ('Silver',   2, 1.5),
  ('Gold',     3, 3),
  ('Platinum', 4, 4.5),
  ('Diamond',  5, 6);
