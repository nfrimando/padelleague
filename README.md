# Padel League PH

A full-stack web application for managing and analysing a competitive padel league in the Philippines. Tracks players, matches, ratings, and event registrations with a real-time leaderboard and integrated payment flow.

---

## Features

- **Player profiles** — rating history, win/loss record, match history, partner analysis
- **Match management** — schedule, complete, and update matches via admin panel
- **v3 Rating system** — ELO-inspired algorithm that rewards game dominance, not just wins
- **Leaderboard** — performance (win rate) and rating modes, per-event filtering
- **Event registration** — PayMongo payment link integration with webhook confirmation
- **Admin panel** — create players, schedule/complete matches, verify members, manage events
- **Match calendar** — monthly calendar view with mobile agenda fallback
- **Public site** — homepage with live stats, recent matches, and top players

---

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Framework  | Next.js 15 (App Router)             |
| Language   | TypeScript                          |
| Styling    | Tailwind CSS                        |
| Database   | Supabase (PostgreSQL)               |
| Auth       | Supabase Auth (Google OAuth)        |
| Payments   | PayMongo (payment links + webhooks) |
| Deployment | Vercel                              |
| Testing    | Vitest (unit), Playwright (E2E)     |

---

## Setup

### Prerequisites

- Node.js 20+
- A Supabase project
- A PayMongo account (test credentials work for local dev)

### 1. Clone and install

```bash
git clone <repo-url>
cd padel-league
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PAYMONGO_SECRET_KEY=sk_test_your-key
PAYMONGO_WEBHOOK_SECRET=whsk_your-secret
```

### 3. Database

Apply the schema from `supabase/schema.sql` to your Supabase project, or run migrations in order from the `supabase/migrations/` directory.

The schema requires these custom RPC functions (see schema.sql):

- `get_leaderboard` — performance leaderboard
- `get_leaderboard_ratings` — rating-based leaderboard

### 4. Run locally

```bash
npm run dev
```

App runs at `http://localhost:3000`.

### 5. Admin access

Sign in with Google, then manually insert your `auth.users` user ID into the `admin_users` table via Supabase dashboard.

### 6. E2E tests (optional)

Playwright E2E tests that require auth need a saved session:

```bash
npm run test:auth-setup   # opens browser, sign in with Google, press Enter
npx playwright test       # runs all E2E tests
```

Unit tests run without auth:

```bash
npm run test
```

---

## Project Structure

```
src/
├── app/                      # Next.js App Router pages and API routes
│   ├── api/
│   │   ├── admin/            # Admin-only API routes (matches, players, events)
│   │   ├── payments/         # Payment flow (create-link, confirm, webhook)
│   │   └── ratings/          # v3 rating calculation endpoint
│   ├── admin/                # Admin panel page
│   ├── dashboard/            # Authenticated player dashboard
│   ├── leaderboard/
│   ├── matches/
│   ├── players/
│   └── register/             # Event registration + payment success
│
├── components/
│   ├── admin/                # Tab components for admin panel
│   ├── MatchCard.tsx
│   ├── MatchCalendar.tsx
│   ├── PlayerCard.tsx
│   ├── PlayerSearchBox.tsx
│   ├── SiteHeader.tsx
│   ├── TeamCard.tsx
│   ├── TeamPlayerLine.tsx
│   └── TopPlayersTable.tsx
│
├── lib/
│   ├── matchAssembly.ts      # Match + team + rating assembly utilities
│   ├── matchRatingPreview.ts # v3 rating preview calculation
│   ├── matches.ts            # Match filter utilities
│   ├── playerLookup.ts       # Email-based player lookup
│   ├── resolvePreMatchRatings.ts  # Pre-match rating resolution logic
│   ├── supabase.ts           # Supabase client (anon key)
│   ├── types.ts              # Shared TypeScript types
│   ├── utils.ts              # Date, label, format helpers
│   ├── useAdminEvents.ts
│   ├── useEventMap.ts
│   ├── useLeaderboardData.ts
│   ├── useLoadedMatchDetails.ts
│   ├── useMatchEvents.ts
│   ├── useMatchRatingPreview.ts
│   ├── useMatches.ts
│   ├── usePendingMembers.ts
│   ├── usePlayerMatches.ts
│   ├── usePlayerSearch.ts
│   ├── usePlayers.ts
│   └── useScheduledMatches.ts
│
└── __tests__/
    ├── api/payments/         # Unit tests for payment API routes
    ├── e2e/                  # Playwright E2E tests
    ├── helpers/              # Supabase mock factories
    └── setup.ts              # Test environment variables
```

---

## Rating System (v3)

Each match updates player ratings using an ELO-influenced algorithm:

1. **Expected win probability (EWP)** — computed from average team ratings using ELO formula
2. **Actual performance** — percentage of total games won across all sets (not just sets won)
3. **Reward curve** — scaled by how much a team outperformed their EWP
4. **Win bonus floor** — winners always gain at least `+0.08` regardless of performance
5. **Symmetric delta** — losers mirror the winner's gain as a negative

This rewards dominant wins (e.g. 6-0 6-0) over squeaky wins (7-6 7-6) and accounts for rating mismatch between teams.

---

## Payment Flow

```
User clicks "Register & Pay"
  → POST /api/payments/create-link
  → Creates payment + signup records (status: pending)
  → Calls PayMongo to create a payment link
  → Redirects user to PayMongo checkout

User completes payment on PayMongo
  → PayMongo POSTs to /api/payments/webhook
  → Signature verified (HMAC-SHA256)
  → Idempotency check (webhook_events table)
  → payment.status → "paid", signup.status → "registered"

Success page polls /api/payments/confirm
  → Direct PayMongo API check (covers localhost / slow webhooks)
  → Confirms registration if paid
```

---

## Future Improvements

- **React Query / SWR** — eliminate duplicate Supabase fetches across components; all hooks currently fire independent queries with no shared cache
- **Supabase type generation** — replace manual type definitions and `as unknown` casts with generated types from `supabase gen types typescript`
- **URL state via `nuqs`** — replace ~80 lines of manual `useEffect`-based URL sync in `players/page.tsx`
- **Head-to-head comparison** — dedicated `/players/compare` page with win rate, common opponents, and set history between any two players
- **Rating trajectory chart** — full time-series chart on player profile (data already exists, only the sparkline is shown)
- **Season summary cards** — shareable end-of-season recap per player (most improved, best win, longest streak)
- **Match result notifications** — email players their new rating after a match is recorded
- **Admin data context** — replace prop drilling in `admin/page.tsx` with a React context
- **Feature-based folder structure** — migrate from `src/lib/` flat structure to `src/features/` domain slices
