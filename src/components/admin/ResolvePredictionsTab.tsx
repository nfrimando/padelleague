"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type CompletedMatch = {
  match_id: number;
  date_local: string | null;
  type: string | null;
};

const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";
const selectCls =
  "block w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";

export function ResolvePredictionsTab() {
  const [completedMatches, setCompletedMatches] = useState<CompletedMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState<string | null>(null);

  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);
  const [result, setResult] = useState<{ resolved: number; skipped: number } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setMatchesLoading(true);
      setMatchesError(null);

      const { data, error } = await supabase
        .from("matches")
        .select("match_id,date_local,type")
        .eq("status", "completed")
        .order("date_local", { ascending: false })
        .limit(50);

      if (cancelled) return;
      if (error) {
        setMatchesError(error.message || "Failed to load completed matches.");
      } else {
        setCompletedMatches((data ?? []) as CompletedMatch[]);
      }
      setMatchesLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleResolve = async () => {
    if (!selectedMatchId) return;
    setResolving(true);
    setResolveError(null);
    setResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setResolveError("Session expired. Please refresh the page.");
        return;
      }

      const res = await fetch(`/api/admin/resolve-predictions/${selectedMatchId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force: true }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setResolveError((payload as { error?: string }).error ?? "Request failed.");
        return;
      }

      setResult(payload as { resolved: number; skipped: number });
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setResolving(false);
    }
  };

  function matchLabel(m: CompletedMatch): string {
    const parts: string[] = [`#${m.match_id}`];
    if (m.date_local) parts.push(m.date_local);
    if (m.type) parts.push(m.type.toUpperCase());
    return parts.join(" · ");
  }

  return (
    <div className="space-y-6 max-w-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Resolve Predictions</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Force re-score all predictions for a completed match.
        </p>
      </div>

      <div className="rounded-md border border-rose-800/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
        <span className="font-semibold">Danger zone.</span> This will delete all existing
        prediction results for the selected match and recalculate from scratch. Use this
        to correct rewards after a score revision.
      </div>

      <div>
        <label className={labelCls}>Completed Match</label>
        {matchesLoading ? (
          <div className="h-9 rounded bg-slate-800 animate-pulse" />
        ) : matchesError ? (
          <p className="text-xs text-rose-400">{matchesError}</p>
        ) : completedMatches.length === 0 ? (
          <p className="text-xs text-slate-500">No completed matches found.</p>
        ) : (
          <select
            className={selectCls}
            value={selectedMatchId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedMatchId(val ? Number(val) : null);
              setResult(null);
              setResolveError(null);
            }}
          >
            <option value="">Select a match…</option>
            {completedMatches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {matchLabel(m)}
              </option>
            ))}
          </select>
        )}
      </div>

      {resolveError && (
        <p className="text-sm text-rose-400">{resolveError}</p>
      )}

      {result && (
        <div className="rounded-lg bg-emerald-900/30 border border-emerald-500/20 px-4 py-3 text-sm">
          <p className="font-semibold text-emerald-400">
            {result.resolved} prediction{result.resolved !== 1 ? "s" : ""} resolved
          </p>
          {result.skipped > 0 && (
            <p className="text-xs text-slate-400 mt-0.5">
              {result.skipped} had no prior result.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleResolve()}
        disabled={!selectedMatchId || resolving}
        className="w-full rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        {resolving ? "Resolving…" : "Force Re-resolve Predictions"}
      </button>
    </div>
  );
}
