"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";
const inputCls =
  "block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";
const buttonCls =
  "rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40 disabled:cursor-not-allowed disabled:opacity-50";

type TierRow = { id: number; name: string };

type ProposedPlayer = { playerId: number; displayName: string; rating: number | null };
type ProposedGroup = {
  team1: [ProposedPlayer, ProposedPlayer];
  team2: [ProposedPlayer, ProposedPlayer];
};
type SkippedPlayer = { playerId: number; displayName: string; reason: string };
type TierProposal = {
  tierId: number;
  tierName: string;
  groups: ProposedGroup[];
  skippedPlayers: SkippedPlayer[];
};
type SweepResult = { expiredMatchIds: number[]; warnings: string[] };
type RouletteProposal = {
  cycleId: number;
  deadlineDays: number;
  sweep: SweepResult;
  tiers: TierProposal[];
};

type TierConfirmResult = {
  tierId: number;
  tierName: string;
  matchesCreated: number[];
  skippedPlayers: SkippedPlayer[];
};

type GenerateResponse = { proposal?: RouletteProposal; error?: string };
type ConfirmResponse = { cycleId?: number; tiers?: TierConfirmResult[]; error?: string };
type SweepResponse = SweepResult & { cycleId?: number; error?: string };

function teamLabel(team: [ProposedPlayer, ProposedPlayer]): string {
  return `${team[0].displayName} & ${team[1].displayName}`;
}

function teamAvgRating(team: [ProposedPlayer, ProposedPlayer]): number | null {
  const ratings = team.map((p) => p.rating).filter((r): r is number => r !== null);
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

export function LadderRouletteTab() {
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [selectedTierId, setSelectedTierId] = useState<string>("all");
  const [deadlineDays, setDeadlineDays] = useState("7");

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<RouletteProposal | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);

  const [sweeping, setSweeping] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const [sweepResult, setSweepResult] = useState<SweepResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTiersLoading(true);
      const { data } = await supabase
        .from("ladder_tiers")
        .select("id, name")
        .order("rank", { ascending: true });
      if (cancelled) return;
      setTiers((data ?? []) as TierRow[]);
      setTiersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function getAuthHeader(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : null;
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    setProposal(null);
    setConfirmResult(null);
    setConfirmError(null);

    try {
      const authorization = await getAuthHeader();
      if (!authorization) {
        setGenerateError("No active session. Please sign in again.");
        return;
      }

      const days = Number.parseFloat(deadlineDays);
      if (!Number.isFinite(days) || days <= 0) {
        setGenerateError("Deadline days must be a positive number.");
        return;
      }

      const response = await fetch("/api/admin/ladder/roulette/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
        },
        body: JSON.stringify({
          tierId: selectedTierId === "all" ? undefined : Number(selectedTierId),
          deadlineDays: days,
        }),
      });

      const result = (await response.json()) as GenerateResponse;
      if (!response.ok || !result.proposal) {
        setGenerateError(result.error || "Failed to generate proposal.");
        return;
      }
      setProposal(result.proposal);
    } catch {
      setGenerateError("Unexpected error while generating the proposal.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirm() {
    if (!proposal) return;
    setConfirming(true);
    setConfirmError(null);
    setConfirmResult(null);

    try {
      const authorization = await getAuthHeader();
      if (!authorization) {
        setConfirmError("No active session. Please sign in again.");
        return;
      }

      const response = await fetch("/api/admin/ladder/roulette/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
        },
        body: JSON.stringify({ proposal }),
      });

      const result = (await response.json()) as ConfirmResponse;
      if (!response.ok) {
        setConfirmError(result.error || "Failed to create matches.");
        return;
      }
      setConfirmResult(result);
      setProposal(null);
    } catch {
      setConfirmError("Unexpected error while creating matches.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleSweep() {
    setSweeping(true);
    setSweepError(null);
    setSweepResult(null);

    try {
      const authorization = await getAuthHeader();
      if (!authorization) {
        setSweepError("No active session. Please sign in again.");
        return;
      }

      const response = await fetch("/api/admin/ladder/roulette/sweep", {
        method: "POST",
        headers: { Authorization: authorization },
      });

      const result = (await response.json()) as SweepResponse;
      if (!response.ok) {
        setSweepError(result.error || "Failed to sweep expired assignments.");
        return;
      }
      setSweepResult(result);
    } catch {
      setSweepError("Unexpected error while sweeping expired assignments.");
    } finally {
      setSweeping(false);
    }
  }

  const totalProposedMatches = proposal?.tiers.reduce((sum, t) => sum + t.groups.length, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Ladder Roulette
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Generate a proposed set of matches for review, then confirm to actually create
          them and email the players. Sweeps overdue assignments first, so freed-up
          players are eligible again in the same run.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="roulette-tier">
              Tier
            </label>
            <select
              id="roulette-tier"
              value={selectedTierId}
              onChange={(e) => setSelectedTierId(e.target.value)}
              className={inputCls}
              disabled={tiersLoading}
            >
              <option value="all">All tiers</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="roulette-deadline-days">
              Deadline (days)
            </label>
            <input
              id="roulette-deadline-days"
              type="number"
              min="1"
              step="1"
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className={`${buttonCls} bg-[#00C8DC] text-slate-900 hover:bg-[#00b3c5] w-full`}
            >
              {generating ? "Generating…" : proposal ? "Regenerate" : "Generate"}
            </button>
          </div>
        </div>

        {generateError && <p className="text-sm text-rose-500">{generateError}</p>}

        {proposal && (
          <div className="space-y-3">
            {proposal.sweep.expiredMatchIds.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Swept {proposal.sweep.expiredMatchIds.length} expired assignment(s) first:
                #{proposal.sweep.expiredMatchIds.join(", #")}
              </p>
            )}

            <div className="rounded-md border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-sm text-blue-700 dark:text-blue-300 space-y-3">
              <p className="font-medium">
                Proposed: {totalProposedMatches} match(es) across {proposal.tiers.length} tier(s).
                Review below, then confirm to create them.
              </p>
              {proposal.tiers.map((tier) => (
                <div key={tier.tierId}>
                  <p className="font-medium text-xs uppercase tracking-wide text-blue-600/80 dark:text-blue-400/80">
                    {tier.tierName}
                  </p>
                  {tier.groups.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 pl-2">
                      No matches — not enough eligible players.
                    </p>
                  ) : (
                    <ul className="pl-2 space-y-1">
                      {tier.groups.map((g, i) => {
                        const avg1 = teamAvgRating(g.team1);
                        const avg2 = teamAvgRating(g.team2);
                        return (
                          <li key={i} className="text-sm">
                            <div>
                              {teamLabel(g.team1)}{" "}
                              <span className="text-slate-400">vs</span>{" "}
                              {teamLabel(g.team2)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              avg {avg1 !== null ? avg1.toFixed(0) : "—"} vs{" "}
                              {avg2 !== null ? avg2.toFixed(0) : "—"}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {tier.skippedPlayers.length > 0 && (
                    <ul className="pl-4 text-xs text-slate-500 dark:text-slate-400 list-disc">
                      {tier.skippedPlayers.map((s, i) => (
                        <li key={i}>
                          {s.displayName} skipped — {s.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || totalProposedMatches === 0}
              className={`${buttonCls} bg-emerald-500 text-white hover:bg-emerald-600`}
            >
              {confirming ? "Creating…" : "Confirm & Create Matches"}
            </button>
          </div>
        )}

        {confirmError && <p className="text-sm text-rose-500">{confirmError}</p>}

        {confirmResult?.tiers && (
          <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 space-y-2">
            {confirmResult.tiers.map((tier) => (
              <div key={tier.tierId}>
                <p className="font-medium">
                  {tier.tierName}: {tier.matchesCreated.length} match(es) created
                  {tier.matchesCreated.length > 0
                    ? ` (#${tier.matchesCreated.join(", #")})`
                    : ""}
                </p>
                {tier.skippedPlayers.length > 0 && (
                  <ul className="pl-4 text-xs text-slate-500 dark:text-slate-400 list-disc">
                    {tier.skippedPlayers.map((s, i) => (
                      <li key={i}>
                        {s.displayName} skipped — {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Sweep Expired Assignments
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Neutrally cancels roulette matches past their deadline that were never
              played. No rating or ladder-star impact.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSweep}
            disabled={sweeping}
            className={`${buttonCls} shrink-0 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600`}
          >
            {sweeping ? "Sweeping…" : "Sweep Now"}
          </button>
        </div>

        {sweepError && <p className="text-sm text-rose-500">{sweepError}</p>}

        {sweepResult && (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
            {sweepResult.expiredMatchIds.length === 0
              ? "No overdue assignments found."
              : `Cancelled ${sweepResult.expiredMatchIds.length} expired match(es): #${sweepResult.expiredMatchIds.join(", #")}`}
            {sweepResult.warnings.length > 0 && (
              <ul className="mt-1 pl-4 text-xs text-amber-600 dark:text-amber-400 list-disc">
                {sweepResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
