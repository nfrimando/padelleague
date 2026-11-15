import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";

// Execute the actual migrations and restrictive policies in PostgreSQL, including
// deliberately broad legacy policies to prove they cannot bypass the payment gate.
const migration = readFileSync("supabase/migrations/20261016000000_event_participant_access.sql", "utf8");
const draw = readFileSync("supabase/migrations/20261016000001_duo_cup_divisions.sql", "utf8");
let db: PGlite;
const paidUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const unpaidUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const creatorUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const adminUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const signupId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const tables = ["players", "events", "event_signup_pairs", "signups_events", "payments", "admin_users", "matches", "match_teams", "match_sets", "match_player_ratings", "teams", "predictions", "prediction_results", "player_rating_events"];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;`);
  const schema = readFileSync("supabase/schema.sql", "utf8");
  for (const table of tables) {
    const definition = schema.match(new RegExp(`CREATE TABLE public\\.${table} \\([\\s\\S]*?\\n\\);`))?.[0];
    if (!definition) throw new Error(`Missing schema for ${table}`);
    try { await db.exec(definition.replace("  payment_lock_enabled boolean NOT NULL DEFAULT true,\n", "")); } catch (error) { throw new Error(`Schema fixture ${table}: ${String(error)}`, { cause: error }); }
    await db.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO anon, authenticated, service_role;
      CREATE POLICY legacy_public_access ON public.${table} FOR ALL USING (true) WITH CHECK (true);`);
  }
  await db.exec("CREATE UNIQUE INDEX signups_events_event_player_uniq ON public.signups_events(event_id, player_id) WHERE player_id IS NOT NULL;");
  const ids = new Set([3, ...[...draw.matchAll(/\(17, \d+, \d+, (\d+), (\d+)\)/g)].flatMap(m => [Number(m[1]), Number(m[2])])]);
  for (const id of ids) await db.query("INSERT INTO players (player_id,name,email) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3)", [id, `Player ${id}`, `player${id}@example.test`]);
  await db.exec(`INSERT INTO auth.users VALUES ('${paidUser}', 'player146@example.test'), ('${unpaidUser}', 'player38@example.test'), ('${creatorUser}', 'player50@example.test'), ('${adminUser}', 'admin@example.test');
    INSERT INTO admin_users (user_id) VALUES ('${adminUser}');
    INSERT INTO events (event_id,name,created_by_player_id,status,notes,event_url) OVERRIDING SYSTEM VALUE VALUES (17,'Padel League Duo Cup',50,'upcoming','Private court instructions','https://example.test/inside');
    INSERT INTO events (event_id,name,status) OVERRIDING SYSTEM VALUE VALUES (11,'Archived season','completed');
    INSERT INTO signups_events (id,event_id,player_id,status) VALUES ('${signupId}',17,146,'accepted');
    INSERT INTO signups_events (event_id,player_id,status) VALUES (17,38,'accepted'), (17,3,'applied');
    INSERT INTO payments (signup_id,player_id,event_id,amount,method,status) VALUES ('${signupId}',146,17,1000,'gcash','paid');
    INSERT INTO event_signup_pairs (event_id,initiator_player_id,invitee_player_id,status) VALUES (17,143,132,'accepted');
    INSERT INTO matches (match_id,event_id,type,status) OVERRIDING SYSTEM VALUE VALUES (1,17,'group','scheduled'), (2,11,'group','completed');
    INSERT INTO match_teams (match_id,player_1_id,player_2_id) VALUES (1,146,38);
    INSERT INTO match_sets (match_id,set_number,team_1_games,team_2_games) VALUES (1,1,6,4);
    INSERT INTO match_player_ratings (player_id,match_id,rating_pre,rating_post,result,formula_name) VALUES (146,1,3,3.1,'win','v3');
    INSERT INTO predictions (id,email,match_id,prediction,pick_probability) VALUES ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','test@example.test',1,1,0.5);
    INSERT INTO prediction_results (user_pick_id,reward_system_version,prediction_model_version,was_correct,points_awarded) VALUES ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','v1','v1',true,1);`);
  await db.exec(`INSERT INTO player_rating_events (player_id,event_type,rating_before,rating_after,rating_delta,source_type,source_id,occurred_at,metadata)
    VALUES (146,'initial_rating',NULL,3,NULL,'player','146',now()-interval '1 day',NULL),
      (146,'match_win',3,3.1,0.1,'match','1',now(),'{"match_id":1}');`);
  try { await db.exec(migration); } catch (error) { throw new Error(`Access migration: ${JSON.stringify(error)}`, { cause: error }); }
  try { await db.exec(draw); } catch (error) { throw new Error(`Draw migration: ${JSON.stringify(error)}`, { cause: error }); }
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("BEGIN"); });
afterEach(async () => { await db.exec("ROLLBACK; RESET ROLE;"); });
async function identity(user: string | null, role = "authenticated") {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
  await db.exec(`SET ROLE ${role}`);
}
async function access() {
  return (await db.query<{ access: { canViewInside: boolean; registered: boolean; paid: boolean; found: boolean } }>("SELECT get_event_access(17) AS access")).rows[0].access;
}
async function count(table: string) { return Number((await db.query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)).rows[0].n); }

describe("participant/payment access migrations", () => {
  it("seeds 35 real-player teams, 7 divisions, 70 unique members and preserves other signups", async () => {
    expect(await count("event_division_teams")).toBe(35);
    expect(await count("event_signup_pairs")).toBe(35);
    expect(await count("signups_events")).toBe(71);
    expect((await db.query("SELECT division,count(*)::int AS n FROM event_division_teams GROUP BY division ORDER BY division")).rows).toEqual(Array.from({ length: 7 }, (_, i) => ({ division: i + 1, n: 5 })));
    expect((await db.query("SELECT player_1_id,player_2_id FROM event_division_teams WHERE team_number=25")).rows[0]).toEqual({ player_1_id: 361, player_2_id: 348 });
  });
  it("preserves confirmed payments and puts unpaid roster members in pending_payment", async () => {
    expect((await db.query("SELECT player_id,status FROM signups_events WHERE player_id IN (146,38) ORDER BY player_id")).rows).toEqual([{ player_id: 38, status: "pending_payment" }, { player_id: 146, status: "accepted" }]);
    expect(await count("payments")).toBe(1);
  });
  it("keeps anonymous callers out of protected tables, including direct child-table reads", async () => {
    await identity(null, "anon");
    expect((await access()).canViewInside).toBe(false);
    for (const table of ["event_private_details", "event_division_teams", "match_teams", "match_sets", "match_player_ratings", "predictions", "prediction_results", "signups_events"]) expect(await count(table), table).toBe(0);
    expect(await count("matches")).toBe(1); // archived season remains public
  });
  it("keeps registered unpaid players locked and allows their own signup only", async () => {
    await identity(unpaidUser);
    expect(await access()).toMatchObject({ registered: true, paid: false, canViewInside: false });
    expect(await count("signups_events")).toBe(1);
    expect(await count("event_division_teams")).toBe(0);
  });
  it("unlocks paid players and does not unlock their unpaid partner", async () => {
    await identity(paidUser);
    expect(await access()).toMatchObject({ paid: true, canViewInside: true });
    expect(await count("event_division_teams")).toBe(35);
    expect(await count("match_teams")).toBe(1);
    await identity(unpaidUser);
    expect((await access()).canViewInside).toBe(false);
  });
  it("acceptance without payment cannot unlock content", async () => {
    await db.exec("UPDATE signups_events SET status='accepted' WHERE player_id=38");
    await identity(unpaidUser);
    expect((await access()).canViewInside).toBe(false);
  });
  it.each(["cancelled", "waitlisted"])("denies %s players even when paid", async status => {
    await db.query("UPDATE signups_events SET status=$1 WHERE player_id=146", [status]);
    await identity(paidUser);
    expect((await access()).canViewInside).toBe(false);
  });
  it("a pending or refunded payment never unlocks content", async () => {
    for (const status of ["pending", "refunded", "failed"]) {
      await db.exec("RESET ROLE");
      await db.query("UPDATE payments SET status=$1", [status]);
      await identity(paidUser);
      expect((await access()).canViewInside).toBe(false);
    }
  });
  it("unlocks free events for registrants", async () => {
    await db.exec("UPDATE events SET requires_payment=false WHERE event_id=17");
    await identity(unpaidUser);
    expect((await access()).canViewInside).toBe(true);
    await identity(null, "anon");
    expect((await access()).canViewInside).toBe(false);
  });
  it.each([creatorUser, adminUser])("allows organizer %s to inspect the draw without payment", async user => {
    await identity(user);
    expect((await access()).canViewInside).toBe(true);
    expect(await count("event_division_teams")).toBe(35);
  });
  it("hides drafts/deleted events from non-managers", async () => {
    await db.exec("UPDATE events SET visibility='draft' WHERE event_id=17");
    await identity(paidUser);
    expect((await access()).found).toBe(false);
    await db.exec("RESET ROLE; UPDATE events SET deleted_at=now() WHERE event_id=17");
    await identity(adminUser);
    expect((await access()).found).toBe(false);
  });
  it("moves private information off public event rows and catches legacy editor writes", async () => {
    expect((await db.query("SELECT notes,event_url FROM events WHERE event_id=17")).rows[0]).toEqual({ notes: null, event_url: null });
    await db.exec("UPDATE events SET notes='Updated private notes' WHERE event_id=17");
    expect((await db.query("SELECT information FROM event_private_details WHERE event_id=17")).rows[0]).toEqual({ information: "Updated private notes" });
    expect((await db.query("SELECT notes FROM events WHERE event_id=17")).rows[0]).toEqual({ notes: null });
  });
  it("prevents forged client-side payment confirmations despite broad legacy policies", async () => {
    await identity(unpaidUser);
    await expect(db.query("INSERT INTO payments (signup_id,player_id,event_id,amount,method,status) VALUES ($1,38,17,1000,'gcash','paid')", [signupId])).rejects.toThrow(/row-level security/);
  });
  it("hides locked match identities in the raw ledger while keeping current ratings public", async () => {
    await identity(null, "anon");
    expect(await count("player_rating_events")).toBe(1); // initial rating only
    const latest = (await db.query("SELECT rating_after,source_id,metadata FROM player_rating_events_public WHERE player_id=146 ORDER BY occurred_at DESC LIMIT 1")).rows[0];
    expect(latest).toEqual({ rating_after: "3.1", source_id: null, metadata: null });
    await identity(paidUser);
    expect(await count("player_rating_events")).toBe(2);
    expect((await db.query("SELECT source_id FROM player_rating_events_public WHERE event_type='match_win'")).rows[0]).toEqual({ source_id: "1" });
  });
  it("prevents clients from disabling the payment lock", async () => {
    await identity(unpaidUser);
    await db.exec("UPDATE events SET payment_lock_enabled=false WHERE event_id=17");
    expect((await access()).canViewInside).toBe(false);
  });
  it("fails closed when multiple player records share an auth email", async () => {
    await db.exec("UPDATE players SET email='player146@example.test' WHERE player_id=3");
    await identity(paidUser);
    expect((await access()).canViewInside).toBe(false);
  });
  it("prevents client updates and deletion of payment confirmations", async () => {
    await identity(unpaidUser);
    await db.exec("UPDATE payments SET status='refunded'; DELETE FROM payments;");
    await db.exec("RESET ROLE");
    expect((await db.query("SELECT status FROM payments")).rows).toEqual([{ status: "paid" }]);
  });
  it("rolls back a draw containing a missing player without partial teams", async () => {
    await db.exec("DELETE FROM event_division_teams; SAVEPOINT draw_import;");
    await expect(db.exec(draw.replace("(17, 5, 25, 361, 348)", "(17, 5, 25, 999999, 348)"))).rejects.toThrow(/foreign key/);
    await db.exec("ROLLBACK TO SAVEPOINT draw_import");
    expect(await count("event_division_teams")).toBe(0);
    expect(await count("signups_events")).toBe(71);
  });
  it("rolls back a conflicting live partnership without partial teams", async () => {
    await db.exec("DELETE FROM event_division_teams; UPDATE event_signup_pairs SET invitee_player_id=3 WHERE initiator_player_id=146; SAVEPOINT draw_import;");
    await expect(db.exec(draw)).rejects.toThrow(/Conflicting partner/);
    await db.exec("ROLLBACK TO SAVEPOINT draw_import");
    expect(await count("event_division_teams")).toBe(0);
    expect(await count("signups_events")).toBe(71);
  });
  it("rejects players assigned to multiple teams across opposite seats", async () => {
    await expect(db.exec("INSERT INTO event_division_teams (event_id,division,team_number,player_1_id,player_2_id) VALUES (17,8,36,3,146)")).rejects.toThrow(/one division team/);
  });
});
