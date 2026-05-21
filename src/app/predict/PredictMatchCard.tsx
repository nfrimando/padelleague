"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { PredictableMatch } from "@/lib/usePredictableMatches";
import type { UserPick } from "@/lib/usePredictions";
import type { MatchPredictionCounts } from "@/lib/usePredictionCounts";
import { getPickReward, REWARD_SAMPLES } from "./rewardDisplay";

type PredictionResult = {
  was_correct: boolean;
  points_awarded: number;
};

type Props = {
  match: PredictableMatch;
  existingPick: UserPick | null;
  crowdCounts: MatchPredictionCounts | null;
  canPredict: boolean;
  onPickRequest: (team: 1 | 2) => void;
  result?: PredictionResult | null;
};

function PlayerRow({
  name,
  nickname,
  imageLink,
  rating,
  team,
}: {
  name: string;
  nickname: string | null;
  imageLink: string | null;
  rating: number | null;
  team: 1 | 2;
}) {
  const hasImg = !!(imageLink && imageLink !== "null");
  const src = hasImg ? imageLink! : "/default-avatar.webp";
  const ringCls = team === 1 ? "ring-sky-500/40" : "ring-amber-500/40";

  return (
    <div className="flex items-center gap-2.5">
      <img
        src={src}
        alt={name}
        className={`h-8 w-8 rounded-full object-cover ring-1 shrink-0 ${ringCls}`}
      />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-100 truncate leading-tight">
          {nickname ?? name}
        </div>
        {rating != null && (
          <div className="text-[11px] font-mono text-[#687FA3] leading-tight">
            {rating.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(dateLocal: string | null, timeLocal: string | null): string {
  if (!dateLocal) return "";
  const d = new Date(dateLocal + "T00:00:00");
  const datePart = d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
  if (!timeLocal) return datePart;
  const [h, m] = timeLocal.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${datePart} · ${hour12}:${m} ${suffix}`;
}

function CrowdBar({
  pickedTeam,
  crowdCounts,
}: {
  pickedTeam: 1 | 2;
  crowdCounts: MatchPredictionCounts;
}) {
  const { team1Votes, team2Votes, totalVotes } = crowdCounts;
  const t1Pct = totalVotes > 0 ? (team1Votes / totalVotes) * 100 : 50;
  const t2Pct = totalVotes > 0 ? (team2Votes / totalVotes) * 100 : 50;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#687FA3]/60">
          Crowd Prediction
        </span>
        <span className="text-[9px] text-[#687FA3]/50 tabular-nums">
          {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        </span>
      </div>

      {/* Your pick badge */}
      <div className="flex items-center justify-center">
        <span
          className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
            pickedTeam === 1
              ? "text-sky-400 bg-sky-400/10 border-sky-400/30"
              : "text-amber-400 bg-amber-400/10 border-amber-400/30"
          }`}
        >
          Your pick: Team {pickedTeam} ✓
        </span>
      </div>

      {/* Vote bar */}
      <div className="relative h-9 rounded-xl overflow-hidden bg-[#0d1520]">
        <div
          className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-sky-900/80 to-sky-600/60 transition-all duration-700 ease-out"
          style={{ width: `${t1Pct}%` }}
        />
        <div
          className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-amber-900/80 to-amber-600/60 transition-all duration-700 ease-out"
          style={{ width: `${t2Pct}%` }}
        />
        {totalVotes > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-[#162032]/60"
            style={{ left: `${t1Pct}%` }}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-between px-3">
          <span className="text-xs font-black tabular-nums text-white/80 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
            {totalVotes > 0 ? `${t1Pct.toFixed(0)}%` : "—"}
          </span>
          <span className="text-xs font-black tabular-nums text-white/80 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
            {totalVotes > 0 ? `${t2Pct.toFixed(0)}%` : "—"}
          </span>
        </div>
      </div>

      {/* Vote counts */}
      <div className="flex justify-between px-1">
        <span className="text-[10px] text-sky-500/60 tabular-nums">
          {team1Votes} {team1Votes === 1 ? "vote" : "votes"}
        </span>
        <span className="text-[10px] text-amber-500/60 tabular-nums">
          {team2Votes} {team2Votes === 1 ? "vote" : "votes"}
        </span>
      </div>
    </div>
  );
}

export function PredictMatchCard({ match, existingPick, crowdCounts, canPredict, onPickRequest, result }: Props) {
  const { team1WinProbability, team2WinProbability } = match;
  const ewp1Pct = (team1WinProbability * 100).toFixed(1);
  const ewp2Pct = (team2WinProbability * 100).toFixed(1);
  const team1Favored = team1WinProbability > team2WinProbability;

  const pickedTeam = existingPick?.prediction ?? null;

  const [showRewardInfo, setShowRewardInfo] = useState(false);

  const team1Reward = getPickReward(team1WinProbability);
  const team2Reward = getPickReward(team2WinProbability);
  const rewardsAvailable = team1Reward !== null && team2Reward !== null;

  const FORMULA_NAME = "v3";

  return (
    <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          {match.date_local && (
            <p className="text-[11px] text-[#687FA3] font-medium">
              {formatDate(match.date_local, match.time_local)}
              {match.venue ? ` · ${match.venue}` : ""}
            </p>
          )}
          {match.type && (
            <p className="text-[10px] font-black uppercase tracking-widest text-[#687FA3]/50 mt-0.5">
              {match.type}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[9px] font-mono text-[#687FA3]/40 bg-[#687FA3]/5 border border-[#687FA3]/10 px-2 py-1 rounded-full">
          {FORMULA_NAME}
        </span>
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Teams */}
        <div className="flex flex-col sm:grid sm:grid-cols-[1fr_28px_1fr] sm:items-center gap-3 sm:gap-2">
          {/* Team 1 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 px-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-widest text-sky-500">
                Team 1
              </span>
              {team1Favored && (
                <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1 py-px rounded-sm leading-tight">
                  Favored
                </span>
              )}
            </div>
            <PlayerRow
              name={match.team1Player1.name}
              nickname={match.team1Player1.nickname}
              imageLink={match.team1Player1.image_link}
              rating={match.team1Player1.latest_rating}
              team={1}
            />
            <PlayerRow
              name={match.team1Player2.name}
              nickname={match.team1Player2.nickname}
              imageLink={match.team1Player2.image_link}
              rating={match.team1Player2.latest_rating}
              team={1}
            />
          </div>

          {/* VS divider */}
          <div className="flex sm:hidden items-center gap-3">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#687FA3]/20 to-transparent" />
            <span className="text-[10px] font-black text-[#687FA3]/50 tracking-widest">VS</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#687FA3]/20 to-transparent" />
          </div>
          <div className="hidden sm:flex flex-col items-center justify-center gap-1 self-stretch pt-5">
            <div className="flex-1 w-px bg-gradient-to-b from-transparent via-[#687FA3]/20 to-transparent" />
            <span className="text-[10px] font-black text-[#687FA3]/50 tracking-widest">VS</span>
            <div className="flex-1 w-px bg-gradient-to-b from-transparent via-[#687FA3]/20 to-transparent" />
          </div>

          {/* Team 2 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 px-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">
                Team 2
              </span>
              {!team1Favored && (
                <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1 py-px rounded-sm leading-tight">
                  Favored
                </span>
              )}
            </div>
            <PlayerRow
              name={match.team2Player1.name}
              nickname={match.team2Player1.nickname}
              imageLink={match.team2Player1.image_link}
              rating={match.team2Player1.latest_rating}
              team={2}
            />
            <PlayerRow
              name={match.team2Player2.name}
              nickname={match.team2Player2.nickname}
              imageLink={match.team2Player2.image_link}
              rating={match.team2Player2.latest_rating}
              team={2}
            />
          </div>
        </div>

        {/* Win probability bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#687FA3]/60">
                Win Probability
              </span>
              <span
                title="Win probabilities are based on ratings at the time of your prediction. If other matches occur before this one, ratings may shift and actual odds may differ."
                className="text-[#687FA3]/40 hover:text-[#687FA3]/70 transition-colors cursor-help"
              >
                <Info size={10} />
              </span>
            </div>
            {rewardsAvailable && (
              <button
                type="button"
                onClick={() => setShowRewardInfo((v) => !v)}
                className="text-[#687FA3]/40 hover:text-[#687FA3]/70 transition-colors"
                aria-label="How rewards work"
              >
                <Info size={10} />
              </button>
            )}
          </div>
          <div className="relative h-9 rounded-xl overflow-hidden bg-[#0d1520]">
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-sky-700 to-sky-400 transition-all duration-700 ease-out"
              style={{ width: `${team1WinProbability * 100}%` }}
            />
            <div
              className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-amber-700 to-amber-400 transition-all duration-700 ease-out"
              style={{ width: `${team2WinProbability * 100}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-[#162032]/60"
              style={{ left: `${team1WinProbability * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-between px-3">
              <span className="text-xs font-black tabular-nums text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
                {ewp1Pct}%
              </span>
              <span className="text-xs font-black tabular-nums text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
                {ewp2Pct}%
              </span>
            </div>
          </div>
          {rewardsAvailable && (
            <div className="flex justify-between px-1">
              <span className="text-[10px] tabular-nums font-bold text-sky-400/70">
                +{team1Reward!.toFixed(0)} pts if correct
              </span>
              <span className="text-[10px] tabular-nums font-bold text-amber-400/70">
                +{team2Reward!.toFixed(0)} pts if correct
              </span>
            </div>
          )}
          {rewardsAvailable && showRewardInfo && (
            <div className="bg-[#0d1520] border border-[#687FA3]/10 rounded-xl p-3 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#687FA3]/50">How Rewards Work</p>
              <p className="text-[10px] text-[#687FA3]/70 leading-relaxed">
                Correct picks earn more points for picking the underdog. The lower the odds, the higher the reward. Wrong picks earn 0.
              </p>
              <div className="space-y-1 pt-1 border-t border-[#687FA3]/10">
                <div className="flex justify-between">
                  <span className="text-[9px] font-black uppercase text-[#687FA3]/40">Win Prob</span>
                  <span className="text-[9px] font-black uppercase text-[#687FA3]/40">Points</span>
                </div>
                {REWARD_SAMPLES.map(({ prob, label }) => {
                  const pts = getPickReward(prob);
                  return pts !== null ? (
                    <div key={label} className="flex justify-between">
                      <span className="text-[10px] tabular-nums text-slate-400">{label}</span>
                      <span className="text-[10px] tabular-nums text-slate-300 font-bold">
                        +{pts.toFixed(0)} pts
                      </span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>

        {/* Result banner — only rendered when prop is explicitly passed (dashboard view) */}
        {result !== undefined && (
          <div
            className={`rounded-xl px-4 py-2.5 flex items-center justify-between ${
              result === null
                ? "bg-[#687FA3]/5 border border-[#687FA3]/10"
                : result.was_correct
                  ? "bg-emerald-500/10 border border-emerald-500/20"
                  : "bg-rose-500/10 border border-rose-500/20"
            }`}
          >
            <span
              className={`text-[10px] font-black uppercase tracking-widest ${
                result === null
                  ? "text-[#687FA3]/50"
                  : result.was_correct
                    ? "text-emerald-400"
                    : "text-rose-400"
              }`}
            >
              {result === null ? "Pending result" : result.was_correct ? "Correct" : "Wrong"}
            </span>
            <span
              className={`text-sm font-black tabular-nums ${
                result === null
                  ? "text-[#687FA3]/30"
                  : result.was_correct
                    ? "text-emerald-400"
                    : "text-rose-400/50"
              }`}
            >
              {result === null
                ? "—"
                : result.was_correct
                  ? `+${result.points_awarded % 1 === 0 ? result.points_awarded.toFixed(0) : result.points_awarded.toFixed(1)} pts`
                  : "0 pts"}
            </span>
          </div>
        )}

        {/* Crowd prediction (after picking) or pick buttons or no-profile CTA */}
        {pickedTeam !== null && crowdCounts !== null ? (
          <CrowdBar pickedTeam={pickedTeam} crowdCounts={crowdCounts} />
        ) : pickedTeam !== null ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full border ${
                pickedTeam === 1
                  ? "text-sky-400 bg-sky-400/10 border-sky-400/30"
                  : "text-amber-400 bg-amber-400/10 border-amber-400/30"
              }`}
            >
              Your pick: Team {pickedTeam} ✓
            </span>
          </div>
        ) : match.status !== "scheduled" ? null : !canPredict ? (
          <div className="flex flex-col items-center gap-2 py-1 text-center">
            <p className="text-[11px] text-[#687FA3]">
              Predictions are for league players only.
            </p>
            <a
              href="/join"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#00C8DC] bg-[#00C8DC]/10 border border-[#00C8DC]/20 hover:bg-[#00C8DC]/20 hover:border-[#00C8DC]/40 transition-colors px-4 py-2 rounded-xl"
            >
              Claim a profile or join the league →
            </a>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPickRequest(1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-sky-300 bg-sky-900/30 border border-sky-500/30 hover:bg-sky-900/50 hover:border-sky-400/50 transition-colors"
            >
              Pick Team 1
            </button>
            <button
              type="button"
              onClick={() => onPickRequest(2)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-amber-300 bg-amber-900/30 border border-amber-500/30 hover:bg-amber-900/50 hover:border-amber-400/50 transition-colors"
            >
              Pick Team 2
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
