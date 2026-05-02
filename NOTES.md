# Hooks & Components Reference

A plain-English guide to every custom hook and major component in the codebase.

---

## Custom Hooks

### Data Fetching

---

#### `useMatches`

**File:** `src/lib/useMatches.ts`
**Used in:** `matches/page.tsx`, `app/page.tsx` (homepage)

Fetches a list of matches from Supabase with optional pagination (`limit`), date range filters (`dateGte`, `dateLte`), and ordering. After fetching the base match rows, it fires three parallel queries to get teams, sets, and pre-match ratings for those match IDs. Passes all of that through the assembly utilities in `matchAssembly.ts` to produce fully-joined `MatchWithTeams[]` objects that components can render directly.

Handles large match sets by chunking IDs into batches of 100 to avoid Supabase URL length limits.

**Returns:** `{ matches, loading, error }`

**Watch out for:** It re-fetches on every options change. If you pass an inline object like `useMatches({ limit: 10 })` directly in the component body, it will re-fetch on every render because the object reference changes. Pass stable values or memoize the options object.

---

#### `usePlayerMatches`

**File:** `src/lib/usePlayerMatches.ts`
**Used in:** `players/page.tsx`, `dashboard/page.tsx`

Fetches all matches for a single player. Starts by looking up match IDs from `match_teams` where the player appears as `player_1_id` or `player_2_id`, then fetches the full match data, teams, sets, and ratings in parallel.

Also derives two extra values: `latestRating` (the most recent `rating_post` value for this player across all their matches) and `ratingHistory` (up to 6 historical rating points for the sparkline chart, oldest to newest).

**Returns:** `{ matches, latestRating, ratingHistory, loading }`

**Note:** This is structurally very similar to `useMatches` but player-scoped. They share the `matchAssembly.ts` utilities but not a base fetch layer — a future consolidation opportunity.

---

#### `usePlayers`

**File:** `src/lib/usePlayers.ts`
**Used in:** `players/page.tsx`, `admin/page.tsx` (passed to all admin tabs)

Fetches all players from either the `players` table or the `active_players` view, depending on the `onlyActivePlayers` option. Optionally orders by name. Returns a setter so parent components can update the list in place (used when the admin creates or edits a player).

**Returns:** `{ players, setPlayers, loading, error }`

**Options:**

- `enabled` — skip the fetch entirely (used in admin to wait for auth check)
- `orderByName` — sort alphabetically
- `onlyActivePlayers` — use the `active_players` view instead of `players`

---

#### `useEventMap`

**File:** `src/lib/useEventMap.ts`
**Used in:** `useMatchEvents`, `players/page.tsx`, `matches/page.tsx`, `leaderboard/page.tsx`

Fetches all events and builds a lookup map of `event_id → display label`. The label is the event's `name` if it has one, otherwise falls back to `"Event {id}"`. Also returns the raw `events` array for cases where you need more than just the label.

**Returns:** `{ eventMap, events, loading }`

**Problem:** This hook is called independently in multiple places with no shared cache, so the same `events` table is queried once per component that mounts. A module-level cache would fix this (see improvement list, item 4).

---

#### `useMatchEvents`

**File:** `src/lib/useMatchEvents.ts`
**Used in:** `leaderboard/page.tsx`, `admin/page.tsx` (for ScheduleMatchTab and UpdateMatchTab)

Fetches the distinct set of `event_id` values that appear on actual matches (as opposed to all events), then combines them with labels from `useEventMap` to produce `EventOption[]` — the `{ id, label }` shape used by filter dropdowns.

**Returns:** `{ events, loading, error }`

**Redundancy note:** This hook calls `useEventMap` internally, which fires its own Supabase query. So mounting this hook causes two round trips: one for match event IDs, one for event labels. These could be combined.

---

#### `useScheduledMatches`

**File:** `src/lib/useScheduledMatches.ts`
**Used in:** `admin/page.tsx` → passed to `CompleteMatchTab`

Fetches all matches with `status = 'scheduled'`, then enriches each with the four player IDs from `match_teams`. Returns a flat `ScheduledMatchOption[]` array that the admin complete-match dropdown renders.

Accepts a `refreshKey` prop — when this string changes, the hook re-fetches. The admin page increments a counter after completing a match to trigger a refresh.

**Returns:** `{ scheduledMatches, setScheduledMatches, loading, error }`

---

### Derived / Client-Side

---

#### `useLeaderboardData`

**File:** `src/lib/useLeaderboardData.ts`
**Used in:** `leaderboard/page.tsx`, `app/page.tsx` (homepage top players section)

The most complex hook in the codebase. Calls one of two Supabase RPC functions (`get_leaderboard` or `get_leaderboard_ratings`) depending on `selectedMode`, aggregates results across multiple rows per player (because the RPC can return one row per event per player), applies minimum match thresholds, sorts, then computes tied ranks.

Also fires a secondary query to fetch `image_link` and `nickname` for the top 10 players, which the RPC doesn't return.

**Returns:** `{ rows, topPlayersById, loading, error, minMatchesRequired, rankedRowsWithTopTies }`

**Note:** The aggregation logic in this hook (combining rows by `player_id`) is non-trivial. It handles edge cases like which `latest_rating` to use when a player appears in multiple result rows from different match types.

---

#### `usePlayerSearch`

**File:** `src/lib/usePlayerSearch.ts`
**Used in:** `players/page.tsx`, `admin/EditPlayerTab.tsx`

A pure `useMemo` hook — no side effects, no async. Filters a `Player[]` array against a search string by checking if `name` or `nickname` contains the query (case-insensitive). Returns the filtered array.

This is correctly minimal. No network calls, no state. If the search string is empty, returns an empty array (not all players — the caller decides what to show when there's no query).

---

#### `useMatchRatingPreview`

**File:** `src/lib/useMatchRatingPreview.ts`
**Used in:** `admin/CompleteMatchTab.tsx`

A `useMemo` wrapper around `calculateMatchRatingPreview` from `matchRatingPreview.ts`. Takes the current set score inputs and loaded match details, runs the v3 rating calculation, and returns either a preview result or an error string.

Technically this doesn't need to be a hook — it's a `useMemo` with no special hook behavior. The calculation function itself (`calculateMatchRatingPreview`) is the real logic and lives in `src/lib/matchRatingPreview.ts`.

**Returns:** `MatchRatingPreview | null` (either `{ winnerTeam, rows }` or `{ error }`)

---

#### `useLoadedMatchDetails`

**File:** `src/lib/useLoadedMatchDetails.ts`
**Used in:** `admin/CompleteMatchTab.tsx`, `admin/UpdateMatchTab.tsx`

Given a `matchId` string, fetches the full match details needed by admin forms: match metadata, both teams with player names, set scores, and resolved pre-match v3 ratings for all four players. The rating resolution calls `resolvePreMatchRatings` which has its own multi-step fallback logic.

**⚠ Known bug:** The match row fetch is missing a `.eq("match_id", parsedId)` filter — it will return whatever the database returns first (likely the first match by primary key), not the match the admin selected. This needs to be fixed before anything else in the admin panel.

**Returns:** `{ loadedMatchDetails, setLoadedMatchDetails, loading, error }`

---

### Admin Only

---

#### `useAdminEvents`

**File:** `src/lib/useAdminEvents.ts`
**Used in:** `admin/EventsTab.tsx`

Fetches all events ordered by `event_id` descending for the admin events tab. Returns a setter so the tab can optimistically update the list when a new event is created or a registration status is toggled.

**Returns:** `{ events, setEvents, loading }`

---

#### `usePendingMembers`

**File:** `src/lib/usePendingMembers.ts`
**Used in:** `admin/MembersTab.tsx`

Fetches players where `is_profile_complete = false` and `email IS NOT NULL` — these are players who signed up via Google OAuth but haven't been approved by an admin yet. Returns a setter so the tab can remove players from the list after verifying or dismissing them.

**Returns:** `{ pendingMembers, setPendingMembers, loading }`

---

---

## Components

### Match Domain

---

#### `MatchCard`

**File:** `src/components/MatchCard.tsx`
**Used in:** `matches/page.tsx`, `players/page.tsx`, `dashboard/page.tsx`, `app/page.tsx`

The primary display component for a single match. Shows teams (with avatar stacks), score or scheduled time, set scores, status badge, season badge, and venue. Supports a `highlightPlayerId` prop that turns that player's name cyan — used on the player profile page.

Both team labels link to player profiles. If a player has no `player_id` (shouldn't happen in practice), the link is suppressed.

**Props:**

- `match` — `MatchWithTeams` (the fully assembled match object)
- `highlightPlayerId` — optional, highlights this player's name
- `seasonLabel` — optional label string for the season badge

---

#### `MatchCalendar`

**File:** `src/components/MatchCalendar.tsx`
**Used in:** `matches/page.tsx`

The most complex UI component. Renders a monthly calendar grid on desktop and a scrollable day-by-day agenda on mobile. Handles its own month navigation state (with min/max bounds), filters the passed matches to only show those in the current calendar view window, and shows hover tooltips (`MatchPreviewFull`) on desktop calendar cells.

On mobile, tapping a match row expands it inline to show `MatchPreviewCompact`.

This component is ~470 lines and handles too many concerns. The mobile agenda section (~120 lines) could be its own `<MatchAgenda>` component, and the desktop grid cell renderer could be extracted too.

**Props:**

- `matches` — `MatchWithTeams[]` (pre-filtered to a date range by the parent)
- `loading` — shows a blur overlay when true
- `className` — passed to the outer wrapper

---

#### `MatchPreview` (two exports)

**File:** `src/components/MatchPreview.tsx`
**Used in:** `MatchCalendar.tsx`

Two small components:

- `MatchPreviewCompact` — shown inline in the mobile agenda when a match row is tapped. Just venue, type, and date.
- `MatchPreviewFull` — shown as a hover tooltip on desktop calendar cells. Shows full team breakdown with player avatars, set scores, and winner highlight.

---

#### `TeamCard`

**File:** `src/components/TeamCard.tsx`
**Used in:** nowhere currently in the visible page components

Renders a team as a bordered card with both player avatars, names, and average pre-match rating. Shows a winner badge. Uses `PlayerCard` in `matchCompact` layout for each player.

---

#### `TeamPlayerLine`

**File:** `src/components/TeamPlayerLine.tsx`
**Used in:** `MatchCalendar.tsx`, `MatchPreview.tsx`

A single component with three rendering variants controlled by the `variant` prop:

- `desktop-text` — compact one-line team label for the desktop calendar cell pill
- `mobile` — full-width row with avatars and winner trophy for the mobile agenda
- `preview-block` — two-player block with avatars used in the hover tooltip

This is a well-designed abstraction — one component handles all three calendar display contexts. The tradeoff is that the file is ~250 lines of three mini-components that could reasonably live in separate files.

---

### Player Domain

---

#### `PlayerCard`

**File:** `src/components/PlayerCard.tsx`
**Used in:** `players/page.tsx`, `dashboard/page.tsx`, `leaderboard/page.tsx` (indirectly via TopPlayersTable), `admin/EditPlayerTab.tsx`, `TeamCard.tsx`

Renders a player with avatar, name, nickname, last match date, and rating badge. Has two main layout modes:

- Default (`sm`/`lg`) — horizontal row layout with optional rating sparkline
- `matchCompact` — stacked vertical layout for use inside match team displays

The `RatingSparkline` sub-component is defined inside this file. It renders a small SVG line chart of up to 6 rating data points with colour-coded dots (green = gain, red = loss) and a hover tooltip showing the exact value.

**Props:**

- `player` — `Player` object
- `size` — `"sm"` | `"lg"` (affects text and image sizes)
- `layout` — `"default"` | `"matchCompact"`
- `ratingHistory` — array of `{ rating, date }` points for the sparkline
- `loadingRating` — shows skeleton while rating loads
- `disableLink` — removes the link wrapper (used on the player's own profile page)
- `hrefBuilder` — custom href generator (used in admin search to preserve query params)

---

#### `PlayerSearchBox`

**File:** `src/components/PlayerSearchBox.tsx`
**Used in:** `players/page.tsx`, `admin/EditPlayerTab.tsx`

A text input with a dropdown suggestion list. Supports keyboard navigation (arrow keys, Enter to select, Escape to close). Clears via an `×` button. Does not do any filtering itself — the parent passes in the already-filtered `suggestions` array (from `usePlayerSearch`).

**Props:**

- `value` / `onValueChange` — controlled input
- `suggestions` — pre-filtered player array
- `onSelectPlayer` / `onClear` — callbacks
- `selectedPlayerName` — used to suppress the dropdown when the input matches the selected player exactly

---

### Leaderboard Domain

---

#### `TopPlayersTable`

**File:** `src/components/TopPlayersTable.tsx`
**Used in:** `leaderboard/page.tsx`, `app/page.tsx`

A styled table showing ranked players with avatar, name, wins, matches played, sets won/lost, and rating. First place gets a crown icon instead of a rank number. Rating cells have a subtle background highlight. All player names link to their profile page.

**Props:**

- `rows` — `TopPlayersTableRow[]` (a leaderboard-specific shape, not the full `Player` type)
- `loading` — shows a pulse animation
- `emptyMessage` — shown when rows is empty

---

### Layout / Shared

---

#### `SiteHeader`

**File:** `src/components/SiteHeader.tsx`
**Used in:** Nearly every page

Sticky navigation bar with the Padel League logo, nav links (Calendar, Players, Leaderboard), and a right slot for page-specific actions (sign in button, sign out button, dashboard link). Manages its own auth state internally via `supabase.auth.getUser()` and `onAuthStateChange` to show the correct right-side content.

The `activePath` prop highlights the current nav link. If not passed, it uses `usePathname()` to determine it automatically.

**Props:**

- `activePath` — optional override for the active nav link
- `rightSlot` — optional ReactNode rendered on the right side

---

#### `BackToHome`

**File:** `src/components/BackToHome.tsx`
**Used in:** `matches/page.tsx`, `players/page.tsx`, `leaderboard/page.tsx`, `admin/page.tsx`

A thin wrapper that renders `<SiteHeader />` with no props. Exists so pages that just want the header don't need to import `SiteHeader` directly. In practice this adds a layer of indirection with no benefit — these pages could just use `<SiteHeader />` directly.

---

#### `MatchFiltersCard`

**File:** `src/components/MatchFiltersCard.tsx`
**Used in:** `players/page.tsx`, `leaderboard/page.tsx`

Two dropdowns: one for filtering by event, one for filtering by match type. Both are fully controlled — the parent manages state and passes callbacks. The event dropdown is always shown; the type dropdown can be hidden via `showTypeFilter={false}` (used on the leaderboard where type filtering isn't relevant).

**Props:**

- `eventFilter` / `onEventChange` — controlled event selection
- `selectedTypeFilter` / `onTypeChange` — controlled type selection
- `events` — `{ id, label }[]`
- `typeFilterOptions` — optional, defaults to the global `MATCH_TYPE_FILTER_OPTIONS`
- `showTypeFilter` — defaults to true

---

### Admin Domain

---

#### `MembersTab`

**File:** `src/components/admin/MembersTab.tsx`

Shows players with `is_profile_complete = false`. Each row has a Verify button (sets `is_profile_complete = true`) and a Dismiss button (sets it to `false`, which removes them from the pending list). Uses `usePendingMembers` for data and calls `PATCH /api/admin/players/:id/verify` for each action.

---

#### `EventsTab`

**File:** `src/components/admin/EventsTab.tsx`

Two sections: a list of all events with a toggle button to open/close registration, and a form to create a new event. Uses `useAdminEvents`. The toggle calls `PATCH /api/admin/events` and optimistically updates the list.

---

#### `CreatePlayerTab`

**File:** `src/components/admin/CreatePlayerTab.tsx`

Form for creating a new player (name, nickname, image link, initial rating). On success calls `onPlayerCreated` which causes `admin/page.tsx` to add the player to the list and switch to the Edit tab with the new player pre-selected.

---

#### `EditPlayerTab`

**File:** `src/components/admin/EditPlayerTab.tsx`

Player search + edit form. Uses `PlayerSearchBox` and `usePlayerSearch` to find a player, then shows editable fields for name, nickname, and image link. On save calls `PATCH /api/admin/players/:id/update` and updates the parent's player list in place.

Also accepts an `initialPlayer` prop — when `CreatePlayerTab` creates a player, the admin page hands it to this tab so the new player is pre-loaded for immediate editing.

---

#### `ScheduleMatchTab`

**File:** `src/components/admin/ScheduleMatchTab.tsx`

Form for creating a new scheduled match. Four player dropdowns (team 1 player 1, team 1 player 2, team 2 player 1, team 2 player 2), plus event, date, time, venue, and type fields. Validates that all four players are selected and unique before submitting to `POST /api/admin/matches/create`.

---

#### `CompleteMatchTab`

**File:** `src/components/admin/CompleteMatchTab.tsx`

Two-step admin flow: select a scheduled match → enter set scores → click "Calculate Outcome" → review the rating preview table → click "Complete Match".

The calculate step runs the v3 rating algorithm client-side via `useMatchRatingPreview` and shows a preview table (player, team, before rating, after rating, delta). The complete step sends the set scores to `PATCH /api/admin/matches/:id/update` with `status: "completed"`.

The `completeMatchCalculated` flag gates the final submit — you must calculate before you can complete. This prevents submitting without seeing the rating impact.

---

#### `UpdateMatchTab`

**File:** `src/components/admin/UpdateMatchTab.tsx`

General-purpose match editor. Enter a match ID, the form auto-populates with current values from `useLoadedMatchDetails`, then you can update status, event, date, time, venue, type, and team player assignments. Team updates go to `PATCH /api/admin/matches/:id/teams` first, then match metadata goes to `PATCH /api/admin/matches/:id/update`.

Note: setting status to `"completed"` via this tab is blocked in the UI (it shows as disabled) — completed matches must go through `CompleteMatchTab` which enforces the rating calculation step.

---

---

## Utility Modules (not hooks, not components)

These live in `src/lib/` and are worth understanding because hooks and components depend on them.

---

#### `matchAssembly.ts`

The assembly pipeline for match data. Takes raw rows from separate Supabase queries (matches, teams, sets, ratings) and joins them into `MatchWithTeams[]`. Key functions:

- `groupByMatchId` — groups any array of rows into a Map keyed by match_id
- `buildPreMatchRatingLookup` — builds a `matchId:playerId → rating` map, preferring v3 > v2 > other formulas
- `attachPreMatchRating` — copies the pre-match rating onto a player object
- `assembleMatchesWithTeamsAndSets` — the main function that uses all of the above

---

#### `matchRatingPreview.ts`

Pure function `calculateMatchRatingPreview` that runs the v3 rating algorithm given set scores and a loaded match. Returns either a preview result (winner team + per-player before/after/delta rows) or an error string. No side effects, no Supabase calls.

---

#### `resolvePreMatchRatings.ts`

Given a match ID and player IDs, resolves the pre-match rating for each player through a fallback chain:

1. Most recent `rating_post` from any prior match (ordered by date, preferring v3 formula)
2. Existing `rating_pre` already stored on this match (handles re-completion)
3. Player's `initial_rating` from the players table

Returns a `Map<playerId, rating | null>`.

---

#### `matches.ts`

Filter utilities: `filterMatchesByEventAndType`, `matchPassesTypeFilter`, `getEventsFromMatches`. Also defines `MATCH_TYPE_FILTER_OPTIONS` and `ALL_MATCH_FILTER` constant used across filter dropdowns.

---

#### `utils.ts`

Display helpers: `formatMatchDate`, `formatMatchTime`, `playerLabel` (returns nickname or name), `versusLabel` (returns "vs", "⚔️", or "👑" based on match type), `matchTopLine` (set scores or venue+time), `seasonBadgeFromEvent` (extracts "S11" from "Season 11").

---

#### `playerLookup.ts`

Single function `fetchPlayerByEmail` used on the register and dashboard pages to find the player record matching the logged-in Google account's email address.
