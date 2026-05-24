# Season 11 standings — recalculate & regenerate images

Two scripts build the Season 11 group standings from the **live Supabase DB**
and render shareable graphics. Everything is **read-only** — these scripts never
write to the database.

| File | Purpose |
| --- | --- |
| `season11-standings.mjs` | Compute standings (CLI prints tables + per-match results; also `export`s `computeStandings()`). |
| `season11-image.mjs` | Render one PNG/SVG per group **plus** a combined overview, importing `computeStandings()`. |
| `season11-groupa.mjs` | Original Group-A-only script. **Superseded** by `season11-standings.mjs`; kept for reference. |

## Quick start

```bash
# 1. Recalculate standings (prints tables, per-match breakdown, and any warnings)
node scripts/season11-standings.mjs

# 2. (optional, for PNG output) install the rasterizer once
npm i @resvg/resvg-js

# 3. Regenerate the graphics -> writes to the repo root:
#    season11-groupa.png … season11-groupd.png + season11-standings.png (+ .svg)
node scripts/season11-image.mjs
```

If `@resvg/resvg-js` isn't installed, the image script still writes the `.svg`
files and skips the `.png` (it prints a hint). You can also point it at an
existing install with `RESVG_DIR=/path/to/dir node scripts/season11-image.mjs`.

The generated `season11-*.png` / `.svg` files are git-ignored (regenerate them;
don't commit them).

## Requirements

- Node 18+ (uses global `fetch`).
- Network access to Supabase. Credentials are read from the hardcoded anon URL/key
  in `season11-standings.mjs` (same public anon key as `.env`).
- `@resvg/resvg-js` only for PNG rendering (SVG works without it).

## How standings are computed

- **Rosters** come from `public/11.html` (the official schedule). Each group's
  team rosters are parsed from the `MATCHES` array, so the script auto-updates if
  the schedule changes. Player short-names are resolved to DB `players` by
  `nickname`/`name` (name collisions are disambiguated by who actually played).
- **Event:** Season 11 is `event_id = 11` (`EVENT_ID` constant).
- **Which matches count:** `type = 'group'` only (duels excluded), status
  `completed` **or** `forfeit`. A match counts toward a group only if **all 4 of
  its players** are in that group's roster — this cleanly drops cross-group /
  exhibition matches that reuse the same "Team N" labels.
- **Scoring:** Win = **3 pts**. `Sets Won` = sum of each pair's sets across its
  matches. Tiebreakers, in order: **Points → Sets Won → Head-to-head**
  (head-to-head is a mini-league over only the matches played between the tied
  teams; works for 2-way and N-way ties).

## When results change (adding new matches)

Nothing to do — just re-run both commands. New `completed`/`forfeit` group
matches in the DB are picked up automatically.

## Manual overrides (top of `season11-standings.mjs`)

Two small maps handle known data quirks. Edit these if the roster/data needs a
correction:

- `OVERRIDES` — force a schedule short-name to a specific `player_id`
  (`"Group|Team|ShortName": player_id`). Current entries:
  - `Group A | Team 9 | Jerry → 80` (Jerry **Companjen**, not Jerry Echter)
  - `Group B | Team 2 | Petar → 193` (actual player is **Guilherme Queen**; the
    schedule label "Petar" is wrong)
- `SET_OVERRIDES` — supply set scores for a match the DB has no scores for, as
  `matchId: [[team1Games, team2Games], …]`. Current entry:
  - `746: [[6,0],[6,0]]` — Group B Gil/Shogo beat Kino/Andy 6-0 6-0 (DB stored
    it as a `forfeit` with no scores).

To resolve a future ambiguity, find the right `player_id`:

```bash
# list players whose name/nickname contains a string
node -e 'fetch("https://hmztjweohbfnbpuidrtl.supabase.co/rest/v1/players?select=player_id,name,nickname",{headers:{apikey:"sb_publishable_HvMwZ4XO6nZrYwCKs1Kffw_zVyjowBI"}}).then(r=>r.json()).then(a=>console.log(a.filter(p=>/SEARCH/i.test((p.name||"")+(p.nickname||"")))))'
```

## Future seasons

Point the scripts at a new season by updating `EVENT_ID` in
`season11-standings.mjs` and supplying that season's schedule HTML path in
`season11-image.mjs` / the `parseRosters(...)` call (currently `public/11.html`).
