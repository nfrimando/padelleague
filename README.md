# Padel League Philippines

A lightweight Next.js app for tracking Padel league players and matches in the Philippines.

## What it does

- Home page with quick navigation to the main sections
- Players page with player search and profile details
- Matches page showing recent matches and team lineups
- Shared match card component for consistent match display
- Supports Supabase as the backend/data source
- Includes a simple CSV transform script for importing player data

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables into `.env.local`:

```bash
cp .env.example .env.local
```

3. Update `.env.local` with your Supabase project credentials:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project structure

- `src/app/` — Next.js app routes and page components
- `src/components/` — reusable UI components like match cards and navigation
- `src/lib/` — helper utilities and Supabase client setup
- `data/inputs/` — input CSV files for data transformation
- `data/outputs/` — generated CSV output files from the transform script
- `src/app/scripts/` — SQL and Python scripts for data transforms and Supabase refresh

## Scripts

- `npm run dev` — start the app locally
- `npm run build` — build the production app
- `npm run start` — start the production server after build
- `npm run lint` — run ESLint

## Data scripts

- `src/app/scripts/player_transform.py`
  - Transforms `data/inputs/dim_players.csv` into `data/outputs/dim_players_fixed.csv`.
  - Cleans name/nickname/image fields and prepares player data for import.

- `src/app/scripts/match_transform.py`
  - Transforms `data/inputs/fact_matches.csv` into:
    - `data/outputs/matches_fixed.csv`
    - `data/outputs/match_teams_fixed.csv`
  - Maps player names/nicknames to Supabase `player_id` values and formats match fields.

- `src/app/scripts/refresh_supabase_from_outputs.py`
  - Performs a full refresh of Supabase tables from the output CSV files.
  - Reloads tables in this order: `players`, `matches`, `match_teams`.
  - Resets identities/sequences after import.

- `src/app/scripts/leaderboard.sql`
  - Creates/updates the `get_leaderboard(season_filter, type_filter)` SQL function in Supabase.
  - Used by the leaderboard page via Supabase RPC.
  - Run this command to apply it:

```bash
psql "$SUPABASE_DB_URL" -f src/app/scripts/leaderboard.sql
```

## CSV import helpers

To transform the player import CSV, place `dim_players.csv` into `data/inputs/` and run:

```bash
python3 src/app/scripts/player_transform.py
```

The script writes a fixed output file to `data/outputs/dim_players_fixed.csv`.

To transform match and match team data, run:

```bash
python3 src/app/scripts/match_transform.py
```

## Notes

- The app uses Tailwind CSS for styling and Next.js 16 for routing.
- Match and player pages are designed for quick access and consistent UI.
- If you want to add more pages, reuse the `MatchCard` component for the same match layout.
