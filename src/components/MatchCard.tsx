"use client";

import Link from "next/link";
import { formatMatchDate, formatMatchTime } from "@/lib/utils";
import { MatchWithTeams } from "@/lib/types";

interface MatchCardProps {
  match: MatchWithTeams;
  highlightPlayerId?: string | number;
}

function PlayerNamePart({
  player,
  selectedPlayerId,
}: {
  player: MatchWithTeams["teams"][number]["player_1"] | null | undefined;
  selectedPlayerId: string | null;
}) {
  const name = player?.name || "TBD";
  const isSelected =
    selectedPlayerId !== null &&
    player?.player_id !== null &&
    player?.player_id !== undefined &&
    String(player.player_id) === selectedPlayerId;
  const baseClass = isSelected
    ? "text-[#00C8DC]"
    : "hover:text-[#00C8DC] transition-colors";

  if (player?.player_id === null || player?.player_id === undefined) {
    return <span>{name}</span>;
  }

  return (
    <Link
      href={`/players?playerId=${encodeURIComponent(String(player.player_id))}`}
      className={baseClass}
    >
      {name}
    </Link>
  );
}

function PlayerAvatar({
  player,
}: {
  player: MatchWithTeams["teams"][number]["player_1"] | undefined;
}) {
  const name = player?.nickname || player?.name || "?";

  if (player?.image_link) {
    return (
      <img
        src={player.image_link}
        alt={name}
        className="w-5 h-5 rounded-full object-cover border border-[#687FA3]/40"
      />
    );
  }

  return (
    <span className="inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold bg-[#1e2d45] text-[#687FA3] border border-[#687FA3]/40">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function TeamLabel({
  team,
  selectedPlayerId,
}: {
  team: MatchWithTeams["teams"][number] | undefined;
  selectedPlayerId: string | null;
}) {
  if (!team) return <span>TBD</span>;

  return (
    <>
      <PlayerNamePart
        player={team.player_1}
        selectedPlayerId={selectedPlayerId}
      />
      <span> & </span>
      <PlayerNamePart
        player={team.player_2}
        selectedPlayerId={selectedPlayerId}
      />
    </>
  );
}

function getSetScores(match: MatchWithTeams): string {
  if (!match.sets || match.sets.length === 0) return "";
  return match.sets
    .map((s) => `${s.team_1_games}-${s.team_2_games}`)
    .join("  ");
}

export default function MatchCard({
  match,
  highlightPlayerId,
}: MatchCardProps) {
  const team1 = match.teams.find((t) => t.team_number === 1);
  const team2 = match.teams.find((t) => t.team_number === 2);
  const isWinnerTeam1 = match.winner_team === 1;
  const setScores = getSetScores(match);
  const selectedPlayerId =
    highlightPlayerId !== undefined && highlightPlayerId !== null
      ? String(highlightPlayerId)
      : null;
  const team1HasSelectedPlayer =
    selectedPlayerId !== null &&
    !!team1 &&
    (String(team1.player_1?.player_id) === selectedPlayerId ||
      String(team1.player_2?.player_id) === selectedPlayerId);
  const team2HasSelectedPlayer =
    selectedPlayerId !== null &&
    !!team2 &&
    (String(team2.player_1?.player_id) === selectedPlayerId ||
      String(team2.player_2?.player_id) === selectedPlayerId);

  return (
    <div className="bg-[#162032]/50 border border-[#687FA3]/10 hover:border-[#00C8DC]/30 rounded-2xl p-5 md:p-6 transition-all duration-300">
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[#687FA3] text-[10px] font-black uppercase tracking-widest">
          {formatMatchDate(match.date_local)}
        </span>
        {match.season_id && (
          <span className="bg-[#00C8DC]/10 text-[#00C8DC] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
            S{match.season_id}
          </span>
        )}
        {match.type && (
          <span className="bg-[#687FA3]/10 text-[#687FA3] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
            {match.type}
          </span>
        )}
        {match.venue && (
          <span className="text-[#687FA3]/50 text-[10px] font-bold ml-auto hidden md:block">
            {match.venue}
          </span>
        )}
      </div>

      {/* Teams vs score */}
      <div className="flex items-center gap-3 md:gap-6">
        <div
          className={`flex-1 text-right ${isWinnerTeam1 ? "text-white" : "text-[#687FA3]"}`}
        >
          <div className="flex items-center justify-end gap-2">
            <div className="inline-flex items-center -space-x-1.5">
              <PlayerAvatar player={team1?.player_1} />
              <PlayerAvatar player={team1?.player_2} />
            </div>
            <div className="font-black text-sm md:text-base leading-tight">
              <TeamLabel team={team1} selectedPlayerId={selectedPlayerId} />
            </div>
          </div>
          {isWinnerTeam1 && (
            <div className="text-[#00C8DC] text-[9px] font-black uppercase tracking-widest mt-0.5">
              Winner
            </div>
          )}
        </div>

        <div className="flex flex-col items-center shrink-0">
          <div className="bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2 font-black text-lg md:text-xl tracking-tighter text-[#00C8DC]">
            {`${team1?.sets_won ?? 0} - ${team2?.sets_won ?? 0}`}
          </div>
          {setScores && (
            <div className="text-[#687FA3]/60 text-[9px] font-bold mt-1 tracking-wide">
              {setScores}
            </div>
          )}
          {!setScores && match.time_local && (
            <div className="text-[#687FA3]/60 text-[9px] font-bold mt-1 tracking-wide">
              {formatMatchTime(match.time_local)}
            </div>
          )}
        </div>

        <div
          className={`flex-1 ${!isWinnerTeam1 ? "text-white" : "text-[#687FA3]"}`}
        >
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center -space-x-1.5">
              <PlayerAvatar player={team2?.player_1} />
              <PlayerAvatar player={team2?.player_2} />
            </div>
            <div className="font-black text-sm md:text-base leading-tight">
              <TeamLabel team={team2} selectedPlayerId={selectedPlayerId} />
            </div>
          </div>
          {!isWinnerTeam1 && match.winner_team !== null && (
            <div className="text-[#00C8DC] text-[9px] font-black uppercase tracking-widest mt-0.5">
              Winner
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
