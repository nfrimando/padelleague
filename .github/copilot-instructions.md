# GitHub Copilot Instructions

## Project Overview

- Stack: Next.js App Router + TypeScript + Tailwind CSS + Supabase.
- Data model is centered around `players`, `matches`, and `match_teams`.
- Leaderboard data comes from Supabase RPC: `get_leaderboard(season_filter, type_filter)`.

## Routing and Page Patterns

- Keep `/` as a lightweight navigation page.
- Use `/players` for player search, profile stats, and filtered match history.
- Use `/leaderboard` for ranking and season/type filtering.

## Filter and URL State

- Reuse `src/components/MatchFiltersCard.tsx` for season/type UI.
- Keep filter defaults as:
  - Players: season `ALL`, type `ALL`
  - Leaderboard: URL-driven, with safe fallback behavior
- Persist filter state in query params (`season`, `type`) without dropping existing params.
- Preserve `playerId` query behavior on `/players`.
- Prevent URL/state races on same-route updates:
  - Use `searchParams.toString()` as the source of truth for read/write effects.
  - Parse query params from that string in effects instead of mixing direct `searchParams.get(...)` reads.
  - When linking to another player on `/players`, preserve existing query params and only replace `playerId`.
  - Do not set eager default filters that can overwrite explicit URL params during initial load.

## UX Conventions

- Avoid layout jumps when data loads.
- Prefer loading overlays while keeping containers mounted.
- Keep clickable affordances subtle:
  - hover/focus styles
  - keyboard-visible focus rings
  - avoid loud badges unless requested

## Component Reuse

- Reuse `MatchCard`, `PlayerCard`, `TeamCard`, and `MatchFiltersCard` before adding new variants.
- Keep top-level page files focused on data fetching/state orchestration.
- Extract reusable UI into `src/components`.

## Shared Hooks And Domain Logic

- When the same player or match behavior is used in more than one place, prefer extracting a shared hook or helper in `src/lib` rather than duplicating page-local effects.
- Reuse the existing shared search/fetch patterns before writing new ones:
  - `src/components/PlayerSearchBox.tsx`
  - `src/lib/usePlayerSearch.ts`
  - `src/lib/usePlayers.ts`
- Reuse the existing shared match-domain patterns before adding page-local match logic:
  - `src/lib/matches.ts`
  - `src/lib/usePlayerMatches.ts`
  - `src/lib/useMatchSeasons.ts`
  - `src/lib/useLeaderboardData.ts`
- Prefer top-level pages to orchestrate URL state and rendering while shared hooks own Supabase fetch, aggregation, and normalization logic.

## Data and Scripts

- CSV/data scripts live in `src/app/scripts/`.
- Maintain compatibility with:
  - `transform_players.py`
  - `transform_matches.py`
  - `transform_sets.py`
  - `load_all_to_supabase_full_refresh.py`
  - `leaderboard.sql`

## Coding Expectations

- Follow existing TypeScript and Tailwind style in the repo.
- Keep changes minimal and scoped; avoid unrelated refactors.
- Preserve null-safe handling for Supabase data.
- After edits, check for TypeScript/compile errors.
- Increment `WEBSITE_VERSION` in `src/app/page.tsx` only when there is a user-facing UI change.
- Do not increment `WEBSITE_VERSION` for non-UI changes (scripts, SQL, docs, backend-only logic).

## Next.js Note

- This repo may use Next.js behavior that differs from older defaults.
- Before introducing framework-level changes, consult docs under `node_modules/next/dist/docs/` and watch for deprecations.
