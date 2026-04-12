import { Match } from "@/lib/types";
import PlayerAvatar from "./PlayerAvatar";

function typeBadge(type: string) {
  const map: Record<string, string> = {
    duel: "bg-accent-dim text-accent",
    doubles: "bg-accent-dim text-accent",
    kotc: "bg-gold-bg text-gold",
    team: "bg-elevated text-sec",
  };
  const labels: Record<string, string> = {
    duel: "Duel",
    doubles: "Doubles",
    kotc: "KOTC",
    team: "Team",
  };
  return { cls: map[type] || "bg-elevated text-sec", label: labels[type] || type };
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  match: Match;
  highlightPlayerId?: string;
}

export default function MatchCard({ match, highlightPlayerId }: Props) {
  const { match_teams = [], match_sets = [] } = match;
  const teamA = match_teams.find((t) => t.team_side === "A");
  const teamB = match_teams.find((t) => t.team_side === "B");

  const setsA = match_sets.reduce(
    (acc, s) => (s.score_a > s.score_b ? acc + 1 : acc),
    0
  );
  const setsB = match_sets.reduce(
    (acc, s) => (s.score_b > s.score_a ? acc + 1 : acc),
    0
  );

  const { cls: typeCls, label: typeLabel } = typeBadge(match.match_type);

  function TeamPanel({ team }: { team: typeof teamA }) {
    if (!team) return null;
    const isWin = team.result === "win";
    const players = [team.player1, team.player2].filter(Boolean);
    const isHighlighted = players.some(
      (p) => p?.player_id === highlightPlayerId
    );

    return (
      <div
        className={`flex-1 rounded-lg p-3 border transition-colors ${
          isWin
            ? "bg-win-bg border-win-bdr"
            : "bg-elevated border-bdr"
        } ${isHighlighted ? "border-accent bg-accent-dim" : ""}`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted font-mono">
            Team {team.team_side}
          </span>
          {isWin && (
            <span className="text-xs text-win font-medium">🏆 Winner</span>
          )}
          {team.team_rating != null && (
            <span className="text-xs font-mono text-sec">
              {team.team_rating.toFixed(2)}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {players.map((p) =>
            p ? (
              <div key={p.player_id} className="flex items-center gap-2">
                <PlayerAvatar name={p.name} imageLink={p.image_link} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {p.name}
                  </p>
                  {p.nickname && (
                    <p className="text-xs text-muted truncate">"{p.nickname}"</p>
                  )}
                </div>
                {p.match_rating != null && (
                  <span
                    className={`text-xs font-mono font-medium ${
                      p.player_id === highlightPlayerId
                        ? "text-accent"
                        : "text-sec"
                    }`}
                  >
                    {p.match_rating.toFixed(2)}
                  </span>
                )}
              </div>
            ) : null
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-bdr rounded-xl overflow-hidden hover:border-accent/30 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-bdr">
        <span className="text-xs text-sec">
          {fmtDate(match.match_date)} · {fmtTime(match.match_date)}
        </span>
        {match.venue && (
          <span className="text-xs text-muted truncate max-w-[120px]">
            {match.venue}
          </span>
        )}
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-bdr flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeCls}`}>
          {typeLabel}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-gold-bg text-gold border border-gold/20">
          {match.season_id}
        </span>
        <span className="text-xs text-muted font-mono">#{match.match_id.slice(-6)}</span>
        {match.status === "completed" && (
          <span className="text-xs px-2 py-0.5 rounded bg-win-bg text-win border border-win-bdr">
            COMPLETED
          </span>
        )}
      </div>

      {/* Teams + Score */}
      <div className="p-4">
        <div className="flex gap-3 items-stretch">
          <TeamPanel team={teamA} />

          {/* Score */}
          <div className="flex flex-col items-center justify-center gap-1 min-w-[60px]">
            <div className="font-display text-3xl text-white italic leading-none">
              {setsA} – {setsB}
            </div>
            <div className="text-xs text-muted">sets</div>
            {match_sets.length > 0 && (
              <div className="text-xs font-mono text-sec text-center leading-relaxed">
                {match_sets
                  .sort((a, b) => a.set_number - b.set_number)
                  .map((s) => `${s.score_a}-${s.score_b}`)
                  .join(", ")}
              </div>
            )}
          </div>

          <TeamPanel team={teamB} />
        </div>
      </div>
    </div>
  );
}
