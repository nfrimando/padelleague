-- Move source_formula into metadata JSONB under the key "formula"
UPDATE public.player_rating_events
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('formula', source_formula)
WHERE source_formula IS NOT NULL;

ALTER TABLE public.player_rating_events DROP COLUMN source_formula;
