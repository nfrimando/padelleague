// app/matches/page.tsx
import { createClient } from "@supabase/supabase-js";
import MatchCard from "@/components/MatchCard";
import { Player, TeamWithPlayers, MatchWithTeams } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

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
      {matches.map((match) => (
        <MatchCard key={match.match_id} match={match} />
      ))}
    </div>
  );
}
