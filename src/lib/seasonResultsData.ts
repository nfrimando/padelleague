import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { FIXTURE_BY_PLAYER_SET, FIXTURES, SEASON_11, SeasonFixture, playerSetKey } from "@/lib/data/season-11";

export type FixtureResult = {
  fixture: SeasonFixture;
  status: "completed" | "scheduled" | "tbd";
  db_match_id?: number;
  date?: string | null;
  time?: string | null;
  venue?: string | null;
  // Sets in fixture orientation (left = fixture.teamLeft, right = fixture.teamRight).
  sets?: Array<[number, number]>;
  setsLeft?: number;
  setsRight?: number;
  winner?: "left" | "right" | null;
};

export type BracketStanding = {
  teamCode: string;
  played: number;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
  points: number;
};

export type SeasonResults = {
  fixtures: FixtureResult[];
  standingsByBracket: Record<"A" | "B" | "C" | "D", BracketStanding[]>;
  totals: {
    completed: number;
    scheduled: number;
    total: number;
  };
};

type MatchRow = { match_id: number; status: string | null; date_local: string | null; time_local: string | null; venue: string | null; winner_team: number | null };
type TeamRow = { match_id: number; team_number: number | null; player_1_id: number | null; player_2_id: number | null; sets_won: number | null };
type SetRow = { match_id: number; set_number: number; team_1_games: number; team_2_games: number };

function makeServerClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

async function fetchSeason11Results(): Promise<SeasonResults> {
  const db = makeServerClient();
  const eventId = SEASON_11.event_id;

  const { data: matchesData, error: mErr } = await db
    .from("matches")
    .select("match_id, status, date_local, time_local, venue, winner_team")
    .eq("event_id", eventId);
  if (mErr) throw new Error(mErr.message);
  const matches = (matchesData ?? []) as MatchRow[];

  const fixtureResults = new Map<string, FixtureResult>();
  // seed every fixture as TBD
  for (const f of FIXTURES) fixtureResults.set(f.key, { fixture: f, status: "tbd" });

  if (matches.length > 0) {
    const matchIds = matches.map((m) => m.match_id);
    const [{ data: teamsData, error: tErr }, { data: setsData, error: sErr }] = await Promise.all([
      db.from("match_teams").select("match_id, team_number, player_1_id, player_2_id, sets_won").in("match_id", matchIds),
      db.from("match_sets").select("match_id, set_number, team_1_games, team_2_games").in("match_id", matchIds),
    ]);
    if (tErr) throw new Error(tErr.message);
    if (sErr) throw new Error(sErr.message);
    const teams = (teamsData ?? []) as TeamRow[];
    const sets = (setsData ?? []) as SetRow[];

    // group teams + sets by match
    const teamsByMatch = new Map<number, TeamRow[]>();
    for (const t of teams) {
      if (!teamsByMatch.has(t.match_id)) teamsByMatch.set(t.match_id, []);
      teamsByMatch.get(t.match_id)!.push(t);
    }
    const setsByMatch = new Map<number, SetRow[]>();
    for (const s of sets) {
      if (!setsByMatch.has(s.match_id)) setsByMatch.set(s.match_id, []);
      setsByMatch.get(s.match_id)!.push(s);
    }

    for (const m of matches) {
      const ts = teamsByMatch.get(m.match_id) ?? [];
      const t1 = ts.find((t) => t.team_number === 1);
      const t2 = ts.find((t) => t.team_number === 2);
      if (!t1 || !t2) continue;
      const t1Players = [t1.player_1_id, t1.player_2_id].filter((x): x is number => x != null);
      const t2Players = [t2.player_1_id, t2.player_2_id].filter((x): x is number => x != null);
      if (t1Players.length !== 2 || t2Players.length !== 2) continue;

      const fixture = FIXTURE_BY_PLAYER_SET.get(playerSetKey([...t1Players, ...t2Players]));
      if (!fixture) continue; // DB match doesn't correspond to any season fixture (skip silently)

      // Determine which DB team aligns with fixture.teamLeft.
      // If t1's player set matches fixture.playerIdsLeft → DB team1 = fixture left.
      const t1Key = playerSetKey(t1Players);
      const fixtureLeftKey = playerSetKey(fixture.playerIdsLeft);
      const team1IsLeft = t1Key === fixtureLeftKey;

      const matchSets = (setsByMatch.get(m.match_id) ?? []).sort((a, b) => a.set_number - b.set_number);
      const setsInFixtureOrientation: Array<[number, number]> = matchSets.map((s) =>
        team1IsLeft ? [s.team_1_games, s.team_2_games] : [s.team_2_games, s.team_1_games]
      );

      const status: FixtureResult["status"] = m.status === "completed" ? "completed" : m.status === "scheduled" ? "scheduled" : "tbd";

      let winner: FixtureResult["winner"] = null;
      let setsLeft: number | undefined;
      let setsRight: number | undefined;
      if (status === "completed") {
        const t1Sets = t1.sets_won ?? 0;
        const t2Sets = t2.sets_won ?? 0;
        setsLeft = team1IsLeft ? t1Sets : t2Sets;
        setsRight = team1IsLeft ? t2Sets : t1Sets;
        if (m.winner_team != null) {
          const winnerIsTeam1 = m.winner_team === 1;
          winner = winnerIsTeam1 === team1IsLeft ? "left" : "right";
        } else {
          winner = setsLeft > setsRight ? "left" : "right";
        }
      }

      fixtureResults.set(fixture.key, {
        fixture,
        status,
        db_match_id: m.match_id,
        date: m.date_local,
        time: m.time_local,
        venue: m.venue,
        sets: status === "completed" ? setsInFixtureOrientation : undefined,
        setsLeft,
        setsRight,
        winner,
      });
    }
  }

  const allFixtures = Array.from(fixtureResults.values());

  // Compute standings per bracket
  const standingsByBracket: SeasonResults["standingsByBracket"] = { A: [], B: [], C: [], D: [] };
  for (const b of SEASON_11.brackets) {
    const stats = new Map<string, BracketStanding>();
    for (const t of b.teams) stats.set(t.code, { teamCode: t.code, played: 0, wins: 0, losses: 0, setsFor: 0, setsAgainst: 0, points: 0 });
    for (const fr of allFixtures) {
      if (fr.fixture.bracket !== b.key || fr.status !== "completed") continue;
      const sl = stats.get(fr.fixture.teamLeft)!;
      const sr = stats.get(fr.fixture.teamRight)!;
      sl.played++; sr.played++;
      sl.setsFor += fr.setsLeft ?? 0; sl.setsAgainst += fr.setsRight ?? 0;
      sr.setsFor += fr.setsRight ?? 0; sr.setsAgainst += fr.setsLeft ?? 0;
      if (fr.winner === "left") { sl.wins++; sl.points += 3; sr.losses++; }
      else if (fr.winner === "right") { sr.wins++; sr.points += 3; sl.losses++; }
    }
    standingsByBracket[b.key] = Array.from(stats.values()).sort((a, b) =>
      b.points - a.points ||
      (b.setsFor - b.setsAgainst) - (a.setsFor - a.setsAgainst) ||
      a.teamCode.localeCompare(b.teamCode)
    );
  }

  const completed = allFixtures.filter((f) => f.status === "completed").length;
  const scheduled = allFixtures.filter((f) => f.status === "scheduled").length;

  return { fixtures: allFixtures, standingsByBracket, totals: { completed, scheduled, total: allFixtures.length } };
}

export const getSeason11Results = unstable_cache(fetchSeason11Results, ["season-11-results"], { revalidate: 60 });
