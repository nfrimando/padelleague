@AGENTS.md

# Padel League PH

A Next.js web app for a competitive padel league in the Philippines. Built by players for players — members can view matches, stats, ratings, and leaderboards. New members express interest to join; existing members register for events set up by organizers.

## Architecture

This is a **monorepo** using Next.js App Router — there is no separate backend server. The "backend" lives inside the same repo as Next.js API routes under `src/app/api/`. The frontend is React/Next.js client components under `src/app/` and `src/components/`.

```
src/
├── app/
│   ├── api/                  # Backend: Next.js route handlers (server-side only)
│   │   ├── admin/            # Admin-only endpoints (auth-gated)
│   │   ├── events/           # Event registration endpoints
│   │   ├── membership/       # Membership application endpoint
│   │   ├── payments/         # PayMongo payment flow + webhook
│   │   ├── players/          # Player profile claim endpoint
│   │   └── ratings/          # v3 rating calculation endpoint
│   ├── admin/                # Admin panel page
│   ├── dashboard/            # Authenticated player dashboard
│   ├── events/               # Events listing + registration pages
│   ├── join/                 # New member application page
│   ├── leaderboard/          # Leaderboard (server-rendered)
│   ├── matches/              # Match history + calendar page
│   ├── players/              # Player search + profile pages
│   └── register/             # Event registration + payment success
├── components/               # Reusable React components
│   └── admin/                # Admin-specific tab components
└── lib/                      # Shared utilities, hooks, and domain logic
    ├── ratings/v3/           # v3 ELO-inspired rating algorithm
    └── ...                   # Hooks (useMatches, usePlayers, etc.), types, utils
```

## Tech Stack

| Layer      | Technology                      |
| ---------- | ------------------------------- |
| Framework  | Next.js 16 (App Router)         |
| Language   | TypeScript                      |
| Styling    | Tailwind CSS v4                 |
| Database   | Supabase (PostgreSQL)           |
| Auth       | Supabase Auth (Google OAuth)    |
| Deployment | Vercel                          |
| Testing    | Vitest (unit), Playwright (E2E) |

## Data Model

Core tables: `players`, `matches`, `match_teams`, `match_sets`, `match_player_ratings`, `events`, `signups_events`, `signups_players`, `player_claims`, `payments`, `payments_paymongo`, `webhook_events`, `admin_users`.

- Players link to auth via `players.email = auth.user.email`
- Match structure: `matches` → `match_teams` (team 1 & 2) → each team has `player_1_id` + `player_2_id`
- Ratings stored in `match_player_ratings` with `formula_name` (prefer `v3` > `v2` when multiple exist)
- Events are stored in `events` table. "Seasons" are main events, but other types exist.
- Admin access is checked against the `admin_users` table

## Rating System

Rating system is calculated using an independent formula intended to be version controlled. Ideally plugged and played.

V3 is an ELO-inspired algorithm in `src/lib/ratings/v3/calculate.ts`:

1. **Expected win probability (EWP)** — from average team ratings using ELO formula
2. **Actual performance** — percentage of total games won across all sets (not just sets won)
3. **Reward curve** — scaled by how much a team outperformed their EWP
4. **Win floor** — winners always gain at least `+0.08`
5. **Symmetric delta** — loser mirrors winner's delta as negative

This rewards dominant wins (6-0 6-0) over squeaky wins (7-6 7-6).

## Routing and Page Patterns

- `/` — public homepage with live stats and recent matches
- `/players` — player search (random subset shown; user can search/reroll)
- `/players/[id]` — player profile with match history and rating sparkline
- `/leaderboard` — server-rendered; filtered by event and match type
- `/matches` — match list + calendar view
- `/events` — all events grouped by status
- `/events/register` — event registration (same as `/register`)
- `/dashboard` — authenticated player dashboard
- `/join` — new member application or profile claim
- `/admin` — admin panel (gated by `admin_users` table)

## Component Reuse

Reuse these before adding new variants:

- `MatchCard` — renders a single match with teams, score, and badges
- `PlayerCard` — player avatar, name, rating badge, optional sparkline
- `PlayerDiscoveryCard` — grid card for the players browse page
- `TeamCard` — team block with two players for match detail views
- `MatchFiltersCard` — event + type filter selectors (reuse on all match/player pages)
- `SiteHeader` — sticky nav; accepts `rightSlot` for context-specific actions
- `PlayerSearchBox` — search input with dropdown suggestions

## Shared Hooks and Domain Logic

Prefer existing hooks before writing new fetch logic:

**Players:**

- `src/lib/usePlayers.ts` — list of players (supports `onlyActivePlayers`, `orderByName`, custom `select`)
- `src/lib/usePlayerSearch.ts` — client-side filter by name/nickname
- `src/lib/usePlayerMatchCounts.ts` — match counts + latest rating via `get_player_summary` RPC
- `src/lib/usePlayerMatches.ts` — all matches for a player with rating history

**Matches:**

- `src/lib/useMatches.ts` — paginated match list with optional date range
- `src/lib/matches.ts` — `filterMatchesByEventAndType`, `getEventsFromMatches`, `ALL_MATCH_FILTER`
- `src/lib/matchAssembly.ts` — `assembleMatchesWithTeamsAndSets`, `buildPreMatchRatingLookup`, `groupByMatchId`

**Events:**

- `src/lib/useEventMap.ts` — shared event id→label lookup (cached in memory, avoid duplicate fetches)
- `src/lib/useMatchEvents.ts` — event options derived from matches (for filter dropdowns)

**Admin:**

- `src/lib/useLoadedMatchDetails.ts` — loads full match details including pre-ratings for admin tools
- `src/lib/useMatchRatingPreview.ts` — previews rating impact from set scores before completing a match
- `src/lib/useScheduledMatches.ts` — list of scheduled matches for admin complete/update tabs

## URL State

- Filter state (season/event, match type) is persisted in query params: `?event=X&type=Y`
- Use `searchParams.toString()` as the single source of truth — avoid mixing `searchParams.get()` reads with effect dependencies
- Do not set eager default filters that overwrite explicit URL params on initial load
- When linking to another player on `/players`, preserve existing query params and only replace `playerId`

## UX Conventions

- Avoid layout jumps when data loads — use loading overlays on mounted containers, not unmounting
- Hover/focus styles only — no loud badges unless explicitly requested
- Keep clickable affordances subtle with keyboard-visible focus rings
- _Important_: In mobile, UI is allowed (and even preferred) to hug edge of screen with appropriate padding.
- Mobile: calendar falls back to an agenda list; cards stack vertically

## Dark Mode

The app is **dark mode only** — do not add light mode variants or conditional `dark:` classes. All new UI must assume a dark background and use colors consistent with the existing dark palette (slate/zinc/neutral grays, muted text, subtle borders). Never use `bg-white`, `text-black`, or any explicitly light color without a `dark:` override.

## Mobile Layout

- Cards and content sections should extend edge-to-edge on mobile — use `px-4` (or tighter) on the container itself rather than wrapping in a centered column with large margins.
- Avoid horizontal scroll; let content reflow or truncate instead.
- Sticky/fixed elements (headers, bottom bars) must account for safe-area insets (`safe-area-inset-*`) on iOS.

## Coding Standards

- Follow existing TypeScript and Tailwind style throughout
- Keep changes minimal and scoped — avoid unrelated refactors
- Preserve null-safe handling for all Supabase data (`data?.field ?? null`)
- After edits, verify there are no TypeScript/compile errors
- Admin API routes use `getAuthorizedAdminClient` from `src/app/api/admin/_lib/auth.ts` — always go through this for admin endpoints
- **Email notifications:** Always include the claimant or applicant's name in the email `subject` line (e.g. `"New Player Claim: ${name}"`). This prevents Gmail from threading separate notifications into the same conversation.
- **Email call sites:** Always `await` email notification calls and chain `.catch()` for error logging — never fire-and-forget. Pattern: `await notifyXxx(...).catch((err) => console.error("[email] ...", err));`. Fire-and-forget (no `await`) silently drops errors and can cause missed sends.

## Known Technical Debt (Future Work)

- No shared data cache — all hooks fire independent Supabase queries (React Query / SWR would fix this)
- Types are manually defined — Supabase type generation (`supabase gen types typescript`) would replace the `as unknown` casts
- URL state in `players/page.tsx` uses ~80 lines of manual `useEffect` sync — `nuqs` would clean this up
- `admin/page.tsx` uses prop drilling — a React context would improve this
- `src/lib/` is flat — a feature-based folder structure (`src/features/`) is planned

## Commands

```bash
npm run dev          # Start local dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
```

## Next.js Note

This repo uses Next.js 16. Before introducing any framework-level changes, consult `node_modules/next/dist/docs/` and check for deprecations. APIs, conventions, and file structure may differ from older Next.js versions.
