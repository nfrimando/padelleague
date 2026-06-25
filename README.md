# Padel League PH

A web app for a competitive padel league in the Philippines. Built by players for players.

Members can track their rating over time, browse match history, find opponents, and register for events. Organizers manage matches, players, and events through an admin panel.

## Features

- **Player profiles** — rating history, win/loss record, match history, and partner breakdown
- **Live leaderboard** — ranked by an ELO-inspired rating that rewards game dominance, not just wins
- **Match calendar** — monthly view with mobile agenda fallback
- **Event registration** — PayMongo payment integration with webhook confirmation
- **Admin panel** — schedule and complete matches, verify members, manage events

## Admin Access

Admin access is controlled by rows in the `admin_users` table — there's no in-app UI to grant or revoke it, so it's managed directly via SQL (Supabase dashboard SQL editor).

**Grant:**

```sql
insert into admin_users (user_id, email) values ('<auth-user-uuid>', 'person@example.com');
```

**Revoke** (soft — sets `revoked_at`, doesn't delete the row, so it's reversible):

```sql
update admin_users set revoked_at = now(), updated_at = now() where email = 'person@example.com';
```

**Re-grant** (clear the revocation):

```sql
update admin_users set revoked_at = null, updated_at = now() where email = 'person@example.com';
```

All admin checks across the app filter on `revoked_at is null` via the shared helpers `src/app/api/_lib/admin-check.ts` (server) and `src/lib/adminCheck.ts` (client) — never query `admin_users` directly elsewhere.
