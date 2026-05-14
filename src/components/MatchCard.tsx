"use client";

import Link from "next/link";
import {
  formatMatchDate,
  formatMatchTime,
  seasonBadgeFromEvent,
} from "@/lib/utils";
import { MatchWithTeams } from "@/lib/types";

interface MatchCardProps {
  match: MatchWithTeams;
  highlightPlayerId?: string | number;
  seasonLabel?: string;
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
      href={`/players/${encodeURIComponent(String(player.player_id))}`}
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
        className="h-5 w-5 rounded-full object-cover border border-[#687FA3]/40 sm:h-5 sm:w-5"
      />
    );
  }

  return (
    <span className="inline-flex h-5 w-5 rounded-full items-center justify-center text-[10px] font-bold bg-[#1e2d45] text-[#687FA3] border border-[#687FA3]/40 sm:h-5 sm:w-5">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function TeamAvatarStack({
  player1,
  player2,
}: {
  player1: MatchWithTeams["teams"][number]["player_1"] | undefined;
  player2: MatchWithTeams["teams"][number]["player_2"] | undefined;
}) {
  return (
    <div className="relative h-7 w-7 shrink-0">
      <div className="absolute left-0 top-0">
        <PlayerAvatar player={player1} />
      </div>
      <div className="absolute bottom-0 right-0">
        <PlayerAvatar player={player2} />
      </div>
    </div>
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

function YoutubeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.75 15.5V8.5l6.5 3.5-6.5 3.5z" />
    </svg>
  );
}

function getSetScores(match: MatchWithTeams): string {
  if (!match.sets || match.sets.length === 0) return "";
  return match.sets
    .map((s) => `${s.team_1_games}-${s.team_2_games}`)
    .join("  ");
}

function getStatusBadgeClass(status: string | null | undefined) {
  switch (status) {
    case "scheduled":
      return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300";
    case "forfeit":
      return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
    case "cancelled":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    default:
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  }
}

export default function MatchCard({
  match,
  highlightPlayerId,
  seasonLabel,
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
  const leftTeamClass = isWinnerTeam1
    ? "text-slate-900 dark:text-white"
    : "text-slate-500 dark:text-[#687FA3]";
  const rightTeamClass = !isWinnerTeam1
    ? "text-slate-900 dark:text-white"
    : "text-slate-500 dark:text-[#687FA3]";
  const statusLabel = String(match.status || "completed").toUpperCase();
  const seasonBadge = seasonBadgeFromEvent(seasonLabel, match.event_id);

  return (
    <div className="group bg-white dark:bg-[#162032]/50 border border-slate-200 dark:border-[#687FA3]/10 hover:border-[#00C8DC]/30 rounded-2xl p-5 md:p-6 transition-all duration-300 shadow-sm dark:shadow-none">
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-slate-500 dark:text-[#687FA3] text-[10px] font-black uppercase tracking-widest">
          {formatMatchDate(match.date_local)}
        </span>
        {seasonBadge && (
          <span className="bg-[#00C8DC]/10 text-[#00C8DC] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
            {seasonBadge}
          </span>
        )}
        {match.type && (
          <span className="bg-slate-100 text-slate-600 dark:bg-[#687FA3]/10 dark:text-[#687FA3] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
            {match.type}
          </span>
        )}
        <span
          className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${getStatusBadgeClass(match.status)}`}
        >
          {statusLabel}
        </span>
        {match.youtube_link && (
          <a
            href={match.youtube_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Watch on YouTube"
            className="md:hidden text-slate-400 dark:text-[#687FA3]/50 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <YoutubeIcon size={13} />
          </a>
        )}
        <div className="ml-auto hidden items-center gap-3 md:flex">
          {match.venue && (
            <span className="text-slate-400 dark:text-[#687FA3]/50 text-[10px] font-bold">
              {match.venue}
            </span>
          )}
          {match.youtube_link && (
            <a
              href={match.youtube_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Watch on YouTube"
              className="text-slate-400 dark:text-[#687FA3]/50 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              <YoutubeIcon size={14} />
            </a>
          )}
          <span className="text-slate-300 dark:text-[#687FA3]/30 text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none">
            #{match.match_id}
          </span>
        </div>
      </div>

      {/* Teams vs score */}
      <div className="flex items-center gap-3 md:gap-6">
        <div className={`flex-1 text-right ${leftTeamClass}`}>
          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
            <TeamAvatarStack
              player1={team1?.player_1}
              player2={team1?.player_2}
            />
            <div className="min-w-0 font-black text-xs sm:text-sm md:text-base leading-tight max-w-full">
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
          {match.status === "scheduled" ? (
            <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700/60 rounded-xl px-4 py-2 font-semibold text-sm md:text-base tracking-tight text-sky-700 dark:text-sky-300">
              {match.time_local ? formatMatchTime(match.time_local) : "TBD"}
            </div>
          ) : (
            <div className="bg-slate-100 dark:bg-[#0E1523] border border-slate-200 dark:border-[#687FA3]/20 rounded-xl px-4 py-2 font-black text-lg md:text-xl tracking-tighter text-[#00C8DC]">
              {`${team1?.sets_won ?? 0} - ${team2?.sets_won ?? 0}`}
            </div>
          )}
          {setScores && match.status !== "scheduled" && (
            <div className="text-slate-400 dark:text-[#687FA3]/60 text-[9px] font-bold mt-1 tracking-wide">
              {setScores}
            </div>
          )}
          {match.status === "scheduled" && match.time_local && match.venue && (
            <div className="text-slate-400 dark:text-[#687FA3]/60 text-[9px] font-semibold mt-1 tracking-wide">
              {match.venue}
            </div>
          )}
        </div>

        <div className={`flex-1 ${rightTeamClass}`}>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <TeamAvatarStack
              player1={team2?.player_1}
              player2={team2?.player_2}
            />
            <div className="min-w-0 font-black text-xs sm:text-sm md:text-base leading-tight max-w-full">
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
