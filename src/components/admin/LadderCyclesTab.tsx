"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LadderStartCyclePanel } from "@/components/admin/LadderStartCyclePanel";

const buttonCls =
  "rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40 disabled:cursor-not-allowed disabled:opacity-50";

type CycleRow = {
  id: number;
  label: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

type ResultDraft = {
  player_id: number;
  tier_name: string;
  tier_rank: number;
  stars: number;
  matches_played: number;
  wins: number;
  losses: number;
  overall_rank: number | null;
  tier_position: number | null;
  badge_eligible: boolean;
  final_rating: number | null;
  start_tier_name: string | null;
};

type DuoResultDraft = {
  duo_id: number;
  tier_name: string;
  stars: number;
  matches_played: number;
  wins: number;
  losses: number;
  overall_rank: number | null;
  tier_position: number | null;
  badge_eligible: boolean;
  start_tier_name: string | null;
};

type CloseResponse = {
  cycle?: { id: number; label: string; status: string };
  written?: boolean;
  results?: ResultDraft[];
  namesByPlayer?: Record<string, string>;
  duoResults?: DuoResultDraft[];
  duoLabels?: Record<string, string>;
  recorded?: number;
  badgeEligible?: number;
  warnings?: string[];
  error?: string;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function statusCls(status: string): string {
  if (status === "active") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  if (status === "completed") return "bg-slate-500/10 text-slate-300 border-slate-500/30";
  return "bg-amber-500/10 text-amber-300 border-amber-500/30";
}

export function LadderCyclesTab({ enabled }: { enabled: boolean }) {
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [preview, setPreview] = useState<CloseResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [closeResult, setCloseResult] = useState<CloseResponse | null>(null);

  const loadCycles = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("ladder_cycles")
      .select("id, label, status, starts_at, ends_at")
      .order("id", { ascending: false });

    if (error) setLoadError(error.message);
    else setCycles((data ?? []) as CycleRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) void loadCycles();
  }, [enabled, loadCycles]);

  async function getAuthHeader(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : null;
  }

  async function callClose(
    cycleId: number,
    body: { dryRun?: boolean; recompute?: boolean },
  ): Promise<CloseResponse | null> {
    const authorization = await getAuthHeader();
    if (!authorization) {
      setActionError("No active session. Please sign in again.");
      return null;
    }

    const response = await fetch(`/api/admin/ladder/cycles/${cycleId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify(body),
    });

    const result = (await response.json()) as CloseResponse;
    if (!response.ok) {
      setActionError(result.error || "Request failed.");
      return null;
    }
    return result;
  }

  function resetAction(cycleId: number) {
    setSelectedCycleId(cycleId);
    setPreview(null);
    setCloseResult(null);
    setActionError(null);
    setConfirming(false);
  }

  async function handlePreview(cycleId: number, recompute: boolean) {
    resetAction(cycleId);
    setBusy(true);
    try {
      const result = await callClose(cycleId, { dryRun: true, recompute });
      if (result) setPreview(result);
    } catch {
      setActionError("Unexpected error while previewing the close.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit(cycleId: number, recompute: boolean) {
    setBusy(true);
    setActionError(null);
    try {
      const result = await callClose(cycleId, { recompute });
      if (result) {
        setCloseResult(result);
        setPreview(null);
        setConfirming(false);
        await loadCycles();
      }
    } catch {
      setActionError("Unexpected error while closing the cycle.");
    } finally {
      setBusy(false);
    }
  }

  const activeCycle = cycles.find((c) => c.status === "active") ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Ladder Cycles</h2>
        <p className="mt-1 text-sm text-slate-400">
          Closing a cycle records every placed player&apos;s final tier, stars and match record,
          then marks the cycle completed. Ranks and profile badges cover players with at least 3
          completed ladder matches; everyone else is still recorded, unranked.
        </p>
      </div>

      {loadError && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {loading && cycles.length === 0 ? (
        <p className="text-sm text-slate-400">Loading cycles…</p>
      ) : cycles.length === 0 ? (
        <p className="text-sm text-slate-400">No ladder cycles exist yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {cycles.map((cycle) => {
            const isSelected = selectedCycleId === cycle.id;
            const recompute = cycle.status === "completed";
            const actionable = cycle.status === "active" || cycle.status === "completed";

            return (
              <div
                key={cycle.id}
                className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">{cycle.label}</span>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusCls(cycle.status)}`}
                      >
                        {cycle.status}
                      </span>
                      <span className="text-[10px] text-slate-500">#{cycle.id}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDate(cycle.starts_at)} → {formatDate(cycle.ends_at)}
                    </p>
                  </div>

                  {actionable && (
                    <button
                      type="button"
                      onClick={() => handlePreview(cycle.id, recompute)}
                      disabled={busy}
                      className={`${buttonCls} shrink-0 bg-slate-700 text-slate-100 hover:bg-slate-600`}
                    >
                      {busy && isSelected
                        ? "Working…"
                        : recompute
                          ? "Preview recompute"
                          : "Preview close"}
                    </button>
                  )}
                </div>

                {isSelected && actionError && (
                  <p className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {actionError}
                  </p>
                )}

                {isSelected && closeResult && (
                  <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                    <p>
                      {recompute ? "Recomputed" : "Closed"} {closeResult.cycle?.label} —{" "}
                      {closeResult.recorded} player{closeResult.recorded === 1 ? "" : "s"} recorded,{" "}
                      {closeResult.badgeEligible} badge-eligible.
                    </p>
                    {(closeResult.warnings ?? []).length > 0 && (
                      <p className="mt-1 text-amber-300">{closeResult.warnings?.join(" ")}</p>
                    )}
                  </div>
                )}

                {isSelected && preview && (
                  <PreviewPanel
                    preview={preview}
                    recompute={recompute}
                    busy={busy}
                    confirming={confirming}
                    onAskConfirm={() => setConfirming(true)}
                    onCancel={() => {
                      setConfirming(false);
                      setPreview(null);
                    }}
                    onCommit={() => handleCommit(cycle.id, recompute)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {!activeCycle && cycles.length > 0 && (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          No cycle is currently active, so the roulette and new ladder matches will fail until the
          next cycle is started below.
        </p>
      )}

      <LadderStartCyclePanel
        enabled={enabled}
        hasActiveCycle={activeCycle !== null}
        nextCycleNumber={(cycles[0]?.id ?? 0) + 1}
        onStarted={loadCycles}
      />
    </div>
  );
}

function PreviewPanel({
  preview,
  recompute,
  busy,
  confirming,
  onAskConfirm,
  onCancel,
  onCommit,
}: {
  preview: CloseResponse;
  recompute: boolean;
  busy: boolean;
  confirming: boolean;
  onAskConfirm: () => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const results = preview.results ?? [];
  const names = preview.namesByPlayer ?? {};
  const eligible = results.filter((r) => r.badge_eligible);
  const ineligible = results.filter((r) => !r.badge_eligible);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-xs text-slate-400">
        {results.length} player{results.length === 1 ? "" : "s"} would be recorded ·{" "}
        <span className="text-slate-200">{eligible.length} badge-eligible</span> ·{" "}
        {ineligible.length} under 3 matches
      </p>

      {(preview.warnings ?? []).length > 0 && (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {preview.warnings?.join(" ")}
        </p>
      )}

      {eligible.length > 0 && (
        <div className="flex flex-col gap-1">
          {eligible.map((r) => (
            <div
              key={r.player_id}
              className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded border border-slate-700/40 bg-slate-900/60 px-2.5 py-1.5 text-xs"
            >
              <span className="w-6 shrink-0 text-right font-bold tabular-nums text-slate-200">
                {r.overall_rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-100">
                {names[String(r.player_id)] || `Player ${r.player_id}`}
              </span>
              <span className="shrink-0 text-slate-300">
                {r.start_tier_name && r.start_tier_name !== r.tier_name
                  ? `${r.start_tier_name} → `
                  : ""}
                {r.tier_name} #{r.tier_position} · {r.stars}★
              </span>
              <span className="shrink-0 tabular-nums text-slate-400">
                {r.matches_played}M · {r.wins}W-{r.losses}L
              </span>
            </div>
          ))}
        </div>
      )}

      {ineligible.length > 0 && (
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer hover:text-slate-200">
            {ineligible.length} recorded without a badge
          </summary>
          <div className="mt-1 flex flex-col gap-1">
            {ineligible.map((r) => (
              <div
                key={r.player_id}
                className="flex flex-wrap items-center gap-x-3 rounded border border-slate-700/30 px-2.5 py-1"
              >
                <span className="min-w-0 flex-1 truncate">
                  {names[String(r.player_id)] || `Player ${r.player_id}`}
                </span>
                <span className="shrink-0">
                  {r.tier_name} · {r.stars}★
                </span>
                <span className="shrink-0 tabular-nums">{r.matches_played}M</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {(preview.duoResults ?? []).length > 0 && (
        <DuoResultsPreview results={preview.duoResults ?? []} labels={preview.duoLabels ?? {}} />
      )}

      {confirming ? (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-200">
            {recompute ? (
              <>This rewrites the recorded results for this cycle. Continue?</>
            ) : (
              <>
                This marks the cycle completed and freezes these results. It leaves{" "}
                <strong>no active cycle</strong>, so the roulette and new ladder matches will fail
                until the next cycle is created. Continue?
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCommit}
              disabled={busy}
              className={`${buttonCls} bg-[#00C8DC] text-slate-900 hover:bg-[#00C8DC]/80`}
            >
              {busy ? "Working…" : recompute ? "Yes, recompute" : "Yes, close cycle"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={`${buttonCls} bg-slate-700 text-slate-100 hover:bg-slate-600`}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={onAskConfirm}
            disabled={busy || results.length === 0}
            className={`${buttonCls} bg-[#00C8DC] text-slate-900 hover:bg-[#00C8DC]/80`}
          >
            {recompute ? "Recompute snapshot" : "Close cycle"}
          </button>
        </div>
      )}
    </div>
  );
}

// The Duo Ladder closes with the cycle; its snapshot is written alongside the solo one.
function DuoResultsPreview({
  results,
  labels,
}: {
  results: DuoResultDraft[];
  labels: Record<string, string>;
}) {
  const eligible = results
    .filter((r) => r.badge_eligible)
    .sort((a, b) => (a.overall_rank ?? 0) - (b.overall_rank ?? 0));
  const ineligible = results.filter((r) => !r.badge_eligible);

  return (
    <details className="text-xs text-slate-400" open>
      <summary className="cursor-pointer hover:text-slate-200">
        Duo ladder · {results.length} duo{results.length === 1 ? "" : "s"} recorded ·{" "}
        <span className="text-slate-200">{eligible.length} badge-eligible</span> · {ineligible.length} under 3
        matches
      </summary>
      <div className="mt-1 flex flex-col gap-1">
        {eligible.map((r) => (
          <div
            key={r.duo_id}
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded border border-slate-700/40 bg-slate-900/60 px-2.5 py-1.5"
          >
            <span className="w-6 shrink-0 text-right font-bold tabular-nums text-slate-200">{r.overall_rank}</span>
            <span className="min-w-0 flex-1 truncate text-slate-100">{labels[String(r.duo_id)] || `Duo ${r.duo_id}`}</span>
            <span className="shrink-0 text-slate-300">
              {r.start_tier_name && r.start_tier_name !== r.tier_name ? `${r.start_tier_name} → ` : ""}
              {r.tier_name} #{r.tier_position} · {r.stars}★
            </span>
            <span className="shrink-0 tabular-nums text-slate-400">
              {r.matches_played}M · {r.wins}W-{r.losses}L
            </span>
          </div>
        ))}
        {ineligible.map((r) => (
          <div key={r.duo_id} className="flex flex-wrap items-center gap-x-3 rounded border border-slate-700/30 px-2.5 py-1">
            <span className="min-w-0 flex-1 truncate">{labels[String(r.duo_id)] || `Duo ${r.duo_id}`}</span>
            <span className="shrink-0">
              {r.tier_name} · {r.stars}★
            </span>
            <span className="shrink-0 tabular-nums">{r.matches_played}M</span>
          </div>
        ))}
      </div>
    </details>
  );
}
