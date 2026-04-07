// app/matches/page.tsx
import { createClient } from "@supabase/supabase-js";
import { formatMatchDate, formatMatchTime } from "@/lib/utils";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Player = {
  player_id: number;
  name: string;
  nickname: string;
  image_link?: string | null;
};

type TeamWithPlayers = {
  uuid: string;
  team_number: number | null;
  sets_won: number | null;
  player_1: Player | null;
  player_2: Player | null;
};

type MatchWithTeams = {
  match_id: number;
  created_at: string;
  date_local: string | null;
  time_local: string | null;
  venue: string | null;
  type: string | null;
  winner_team: number | null;
  is_forfeit: boolean;
  teams: TeamWithPlayers[];
};

export default async function MatchesPage() {
  // 1️⃣ Get latest 10 matches
  const { data: matchesData, error: matchesError } = await supabase
    .from("matches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (matchesError || !matchesData) return <div>Error loading matches</div>;

  // 2️⃣ Get all teams for these matches
  const matchIds = matchesData.map((m) => m.match_id);
  const { data: teamsData, error: teamsError } = await supabase
    .from("match_teams")
    .select(
      "*, player_1:player_1_id(name,nickname,image_link), player_2:player_2_id(name,nickname,image_link)",
    )
    .in("match_id", matchIds);

  if (teamsError || !teamsData) return <div>Error loading teams</div>;

  // 3️⃣ Combine matches with teams
  const matches: MatchWithTeams[] = matchesData.map((m) => ({
    ...m,
    teams: teamsData
      .filter((t) => t.match_id === m.match_id)
      .map((t) => ({
        uuid: t.uuid,
        team_number: t.team_number,
        sets_won: t.sets_won,
        player_1: t.player_1 || null,
        player_2: t.player_2 || null,
      })),
  }));

  const defaultAvatar = "/default-avatar.png"; // put a default avatar in public/

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Latest 10 Matches</h1>
      {matches.map((match) => {
        const team1 = match.teams.find((t) => t.team_number === 1);
        const team2 = match.teams.find((t) => t.team_number === 2);

        return (
          <div
            key={match.match_id}
            className="border rounded-lg shadow p-4 bg-white dark:bg-gray-800"
          >
            <div className="flex justify-between mb-2 text-sm text-gray-500 dark:text-gray-400">
              <div>
                {formatMatchDate(match.date_local)}{" "}
                {formatMatchTime(match.time_local)}
              </div>
              <div>{match.venue || "N/A"}</div>
            </div>

            <div className="mb-2 font-semibold">
              {(match.type || "Match").charAt(0).toUpperCase() +
                (match.type || "Match").slice(1)}
            </div>

            <div className="flex flex-col md:flex-row items-stretch justify-center gap-4">
              {/* Team 1 */}
              <div
                className={`flex-1 min-w-[220px] p-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 ${
                  match.winner_team === 1
                    ? "ring-2 ring-green-300 dark:ring-green-600"
                    : ""
                }`}
              >
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                  Team 1
                </div>
                <div className="grid gap-3">
                  {[team1?.player_1, team1?.player_2].map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <img
                        src={p?.image_link || "/default-avatar.webp"}
                        alt={p?.name || "Player"}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {p?.name || "N/A"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {p?.nickname || "Player"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                  Sets Won: {team1?.sets_won ?? 0}
                </div>
              </div>

              <div className="flex items-center justify-center px-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                VS
              </div>

              {/* Team 2 */}
              <div
                className={`flex-1 min-w-[220px] p-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 ${
                  match.winner_team === 2
                    ? "ring-2 ring-green-300 dark:ring-green-600"
                    : ""
                }`}
              >
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                  Team 2
                </div>
                <div className="grid gap-3">
                  {[team2?.player_1, team2?.player_2].map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <img
                        src={p?.image_link || "/default-avatar.webp"}
                        alt={p?.name || "Player"}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {p?.name || "N/A"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {p?.nickname || "Player"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                  Sets Won: {team2?.sets_won ?? 0}
                </div>
              </div>
            </div>

            {match.is_forfeit && (
              <div className="mt-2 text-red-500 font-semibold">
                Forfeit Match
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
