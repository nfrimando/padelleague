-- Remove leaderboard-only RPC functions.
-- Run this in Supabase SQL editor after deploying app changes that remove leaderboard consumers.

-- Drop known function signatures first.
DROP FUNCTION IF EXISTS public.get_leaderboard(bigint, text);
DROP FUNCTION IF EXISTS public.get_leaderboard_ratings(bigint, text, text, integer);

-- Overload-safe cleanup in case signatures differ across environments.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS fn_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_leaderboard', 'get_leaderboard_ratings')
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS %I.%I(%s);',
      r.schema_name,
      r.fn_name,
      r.args
    );
  END LOOP;
END $$;

-- Verification query (expect 0 rows).
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS function_args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_leaderboard', 'get_leaderboard_ratings');
