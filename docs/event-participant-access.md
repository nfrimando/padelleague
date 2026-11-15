# Event participant access

Registered participants can read the event description (including general rules)
and see all non-cancelled participants, even if the organizer hides the roster
from the public. The participant list does not expose other teams' pair IDs.

Matchups, divisions and inside event information require a confirmed `paid`
payment belonging to the viewer's own signup. Accepting a signup alone does not
unlock access. Each partner pays separately. Free events unlock for registered
participants without payment. Cancelled and waitlisted participants remain locked.
Organizers and active admins can inspect and edit inside information.

## Owner setup before testing or publishing

Apply these migrations in order to the intended Supabase database before deploying
this branch's application code:

1. `20261016000000_event_participant_access.sql`
2. `20261016000001_duo_cup_divisions.sql`

Use the existing Supabase migration process; apply each migration in a transaction.
The Duo Cup migration targets **event 17, Padel League Duo Cup** and fails if that
event is absent, a referenced player is missing, or a live partnership conflicts
with the supplied draw. Review its 35 player-ID pairs and full-name comments first.
Player IDs were checked against the live directory on October 16, 2026. The organizer
confirmed Gio R as **Malvin Angelo C. Reyes (348)**; Gio M is **Gio Manito (354)**.

The draw creates seven divisions of five teams (70 players). It reuses matching
partner invitations, adds missing signup rows, updates the player capacity to 70,
and sets unpaid draw members to `pending_payment`. Existing confirmed payments and
signup IDs are preserved. Registrations outside this draw are retained. It does
not create payment records, send emails, or invent scheduled matches or dates.

The payment lock defaults on for new events and is enabled for existing active
events. Existing completed seasons retain public access. Completing a newly locked
event does not automatically publish its private information.

## Editing content

Keep general rules in the event description. In the event page, organizers can
choose **Edit inside information** to edit protected instructions and an optional
HTTP/HTTPS link. These fields are stored in `event_private_details`, outside the
public `events` row. Legacy editors' non-empty notes and destination links are
moved there automatically for locked events.

Manual cash/GCash/bank payments use the existing admin payment recording flow.
PayMongo unlocks after its signed webhook confirms payment. A `?payment=success`
return URL alone does not unlock anything. The event page checks payment status
for two minutes and also offers **Check access again**. A delayed webhook records
payment without reinstating cancelled or waitlisted registrations.

## Data protections and ratings

`get_event_access` is shared by the API and database permissions. Restrictive read
policies protect matches, teams, scores, predictions, raw pair IDs and match rating
records against direct Supabase requests as well as application navigation. Client
writes cannot mark payments as paid or disable the event lock; server-side admin
and webhook routes retain those responsibilities.

Public rating readers use `player_rating_events_public`, a read-only projection of
the rating ledger. Every rating change remains available, so effective ratings and
progression stay accurate. Locked match source IDs and metadata are redacted to
prevent reconstructing matchups through the ledger. Server-side rating writers,
reanchoring and pre-match rating resolution continue using the underlying ledger.

## Verification

- `npm test` runs existing tests plus API tests and PostgreSQL migration/permission
  tests using PGlite. No live credentials are needed for these tests.
- `npx tsc --noEmit` checks types.
- `npm run build` requires the app's environment variables, including a Resend key
  because its existing client initializes during module loading.
- `npx playwright test src/__tests__/e2e/event-access.spec.ts` checks the unpaid to
  paid UI journey at 375px and 1280px. It uses API/auth fixtures rather than charging
  real payments. Configure the app's public Supabase variables and install the
  Playwright Chromium browser first.

For owner acceptance testing after migrations, open `/events/17` as an unpaid
registrant: rules and participants should be visible, while divisions and inside
information remain locked. Confirm that player's payment and refresh access: all
seven divisions and linked player cards should appear, with their own division
identified. Their unpaid partner must remain locked. Repeat as a waitlisted or
cancelled player, signed-out visitor and organizer. Check a completed season still
has its public history. Test an actual PayMongo sandbox payment separately before
publishing; automated tests do not contact the payment provider.
