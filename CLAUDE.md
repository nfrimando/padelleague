@AGENTS.md

# Padel League PH

A Next.js web app for a competitive padel league in the Philippines. Members can view matches, stats, ratings, and leaderboards. New members express interest to join; existing members register for events set up by organizers.

## Data Model

Core tables: `players`, `matches`, `match_teams`, `match_sets`, `match_player_ratings`, `events`, `signups_events`, `signups_players`, `player_claims`, `payments`, `payments_paymongo`, `webhook_events`, `admin_users`.

- Players link to auth via `players.email = auth.user.email`
- Match structure: `matches` → `match_teams` (team 1 & 2) → each team has `player_1_id` + `player_2_id`
- Ratings stored in `match_player_ratings` with `formula_name` (prefer `v3` > `v2` when multiple exist)
- Events are stored in `events` table. "Seasons" are main events, but other types exist.
- Admin access is checked against the `admin_users` table

## Rating System

V3 is an ELO-inspired algorithm in `src/lib/ratings/v3/calculate.ts`:

1. **Expected win probability (EWP)** — from average team ratings using ELO formula
2. **Actual performance** — percentage of total games won across all sets (not just sets won)
3. **Reward curve** — scaled by how much a team outperformed their EWP
4. **Win floor** — winners always gain at least `+0.08`
5. **Symmetric delta** — loser mirrors winner's delta as negative

This rewards dominant wins (6-0 6-0) over squeaky wins (7-6 7-6).

## Routes

- `/` — public homepage with live stats and recent matches
- `/players` — player search (random subset shown; user can search/reroll)
- `/players/[id]` — player profile with match history and rating sparkline
- `/leaderboard` — server-rendered; filtered by event and match type
- `/matches` — match list + calendar view
- `/events` — all events grouped by status
- `/dashboard` — authenticated player dashboard
- `/join` — new member application or profile claim
- `/admin` — admin panel (gated by `admin_users` table)

## Reuse First

**Components** — use these before adding new variants:

- `MatchCard` — renders a single match with teams, score, and badges
- `PlayerCard` — player avatar, name, rating badge, optional sparkline
- `PlayerDiscoveryCard` — grid card for the players browse page
- `TeamCard` — team block with two players for match detail views
- `MatchFiltersCard` — event + type filter selectors (reuse on all match/player pages)
- `SiteHeader` — sticky nav; accepts `rightSlot` for context-specific actions
- `PlayerSearchBox` — search input with dropdown suggestions

**Hooks** — use these before writing new fetch logic:

Players:
- `src/lib/usePlayers.ts` — list of players (supports `onlyActivePlayers`, `orderByName`, custom `select`)
- `src/lib/usePlayerSearch.ts` — client-side filter by name/nickname
- `src/lib/usePlayerMatchCounts.ts` — match counts + latest rating via `get_player_summary` RPC
- `src/lib/usePlayerMatches.ts` — all matches for a player with rating history

Matches:
- `src/lib/useMatches.ts` — paginated match list with optional date range
- `src/lib/matches.ts` — `filterMatchesByEventAndType`, `getEventsFromMatches`, `ALL_MATCH_FILTER`
- `src/lib/matchAssembly.ts` — `assembleMatchesWithTeamsAndSets`, `buildPreMatchRatingLookup`, `groupByMatchId`

Events:
- `src/lib/useEventMap.ts` — shared event id→label lookup (cached in memory, avoid duplicate fetches)
- `src/lib/useMatchEvents.ts` — event options derived from matches (for filter dropdowns)

Admin:
- `src/lib/useLoadedMatchDetails.ts` — loads full match details including pre-ratings for admin tools
- `src/lib/useMatchRatingPreview.ts` — previews rating impact from set scores before completing a match
- `src/lib/useScheduledMatches.ts` — list of scheduled matches for admin complete/update tabs

## Coding Principles

**Scope** — keep changes minimal and focused. No unrelated refactors, no speculative abstractions.

**Safety** — always null-safe with Supabase data (`data?.field ?? null`). After edits, verify there are no TypeScript errors.

**Admin routes** — always use `getAuthorizedAdminClient` from `src/app/api/admin/_lib/auth.ts` for admin endpoints.

**Email notifications** — always `await` and chain `.catch()`. Never fire-and-forget. Pattern:
```ts
await notifyXxx(...).catch((err) => console.error("[email] ...", err));
```
Always include the person's name in the subject line (e.g. `"New Player Claim: ${name}"`) to prevent Gmail threading separate notifications.

**URL state** — filter state lives in query params (`?event=X&type=Y`). Use `searchParams.toString()` as the single source of truth. Don't set eager defaults that overwrite explicit URL params on load. When linking to another player on `/players`, preserve existing params and only replace `playerId`.

## UI Principles

**Dark mode only** — no conditional `dark:` classes, no `bg-white` or `text-black`. All UI assumes a dark background. Use slate/zinc/neutral grays, muted text, subtle borders.

**Responsive — all screens** — every UI feature must work on mobile (375px+) and desktop. Always use responsive Tailwind breakpoints (`sm:`, `md:`) instead of fixed multi-column layouts. Multi-column grids must collapse: use `flex flex-col sm:grid` or `grid-cols-1 sm:grid-cols-2` patterns so content stacks on mobile. Content extends edge-to-edge with `px-4`. No horizontal scroll. Sticky/fixed elements must account for safe-area insets (`safe-area-inset-*`) on iOS. Calendar falls back to an agenda list; cards stack vertically.

**No layout jumps** — use loading overlays on mounted containers, not unmounting.

**Subtle affordances** — hover/focus styles only. No loud badges unless explicitly requested. Keyboard-visible focus rings.

## Commands

```bash
npm run dev      # Start local dev server (http://localhost:3000)
npm run build    # Production build
npm run lint     # ESLint
```

## Next.js Note

This repo uses Next.js 16. Before introducing any framework-level changes, consult `node_modules/next/dist/docs/` and check for deprecations. APIs, conventions, and file structure may differ from older Next.js versions.
