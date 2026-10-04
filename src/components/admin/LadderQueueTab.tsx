"use client";

import { useCallback, useEffect, useState } from "react";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { supabase } from "@/lib/supabase";
import type { Player } from "@/lib/types";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { formatPlayBy } from "@/lib/ladder/ladderQueueShared";
import type { AdminQueueOverview } from "@/app/api/admin/ladder/queue/route";

const buttonCls =
  "rounded px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40 disabled:cursor-not-allowed disabled:opacity-50";
const sectionCls = "rounded-lg border border-slate-800 bg-slate-900/40 p-4";
const headingCls = "text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3";

const REQUEUE_LABEL: Record<string, string> = {
  partner_backout: "requeued · backout",
  deadline_expired: "requeued · expired",
  admin_cancelled: "requeued · admin",
};

async function adminFetch(path: string, init?: { method: "POST"; body: unknown }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No session.");
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(init ? { "Content-Type": "application/json" } : {}),
    },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) || `Request failed (${res.status})`);
  return json;
}

// Admin view of the self-serve ladder queue: who's waiting per tier, open queue matches and their
// deadlines, backout (strike) counts, and the manual ±1★ tool for case-by-case penalties.
export function LadderQueueTab({ enabled }: { enabled: boolean }) {
  const { players } = useAdminDataContext();
  const [overview, setOverview] = useState<AdminQueueOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Player | null>(null);
  const [reason, setReason] = useState("");
  const [confirmExpireId, setConfirmExpireId] = useState<number | null>(null);
  const suggestions = usePlayerSearch(players, search);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview((await adminFetch("/api/admin/ladder/queue")) as unknown as AdminQueueOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  async function run(path: string, body: unknown, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await adminFetch(path, { method: "POST", body });
      setNotice(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  function adjust(delta: 1 | -1) {
    if (!selected) return;
    const name = selected.nickname || selected.name || `#${selected.player_id}`;
    void run(
      "/api/admin/ladder/standings/adjust",
      { playerId: Number(selected.player_id), delta, reason: reason.trim() },
      `${delta === 1 ? "+1★" : "−1★"} applied to ${name}.`,
    ).then(() => setReason(""));
  }

  if (overview && !overview.cycleId) {
    return <p className="text-sm text-slate-400">No active ladder cycle.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Ladder Queue</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Players queue themselves; every 4 in a tier are matched with a 10-day deadline. Backouts
            count as strikes, and overdue matches are expired by hand here — apply penalties
            manually below.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={`${buttonCls} border border-slate-700 text-slate-300 hover:border-slate-500`}
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}

      <div className={`relative space-y-6 ${loading && overview ? "opacity-60" : ""}`}>
        <section className={sectionCls}>
          <h3 className={headingCls}>Waiting</h3>
          {!overview ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {overview.tiers.map((tier) => {
                const rows = overview.waiting.filter((w) => w.tierId === tier.id);
                return (
                  <div key={tier.id}>
                    <p className="text-sm font-medium text-slate-200">
                      {tier.name} <span className="text-slate-500">· {rows.length}/4</span>
                    </p>
                    {rows.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">Nobody waiting.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {rows.map((w) => (
                          <li key={w.playerId} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate text-slate-300">
                              {w.name}
                              {w.requeueReason && (
                                <span className="ml-2 text-xs text-slate-500">
                                  {REQUEUE_LABEL[w.requeueReason] ?? "requeued"}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  "/api/admin/ladder/queue/remove",
                                  { playerId: w.playerId },
                                  `${w.name} removed from the queue.`,
                                )
                              }
                              className={`${buttonCls} shrink-0 px-2 py-0.5 text-xs text-slate-400 hover:text-rose-300`}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={sectionCls}>
          <h3 className={headingCls}>Open queue matches</h3>
          {!overview || overview.openMatches.length === 0 ? (
            <p className="text-sm text-slate-500">{overview ? "None." : "Loading…"}</p>
          ) : (
            <ul className="space-y-2">
              {overview.openMatches.map((m) => {
                const overdue = !!m.playByAt && new Date(m.playByAt).getTime() < Date.now();
                const confirming = confirmExpireId === m.matchId;
                return (
                  <li key={m.matchId} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 text-sm">
                    <span className="min-w-0 text-slate-300 break-words">
                      #{m.matchId} · {m.players.join(" vs ")}
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>
                        {m.status}
                        {m.dateLocal ? ` ${m.dateLocal}` : ""} · play by {formatPlayBy(m.playByAt)}
                      </span>
                      {overdue && <span className="font-semibold text-amber-300">Overdue</span>}
                      {overdue &&
                        (confirming ? (
                          <>
                            <span className="text-slate-400">Expire #{m.matchId}? Nobody is requeued.</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setConfirmExpireId(null);
                                void run(
                                  `/api/admin/ladder/queue/matches/${m.matchId}/expire`,
                                  {},
                                  `Match #${m.matchId} expired. Use Adjust stars to penalize whoever was at fault.`,
                                );
                              }}
                              className={`${buttonCls} px-2 py-0.5 text-xs border border-rose-500/40 text-rose-300 hover:bg-rose-500/10`}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmExpireId(null)}
                              className={`${buttonCls} px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200`}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmExpireId(m.matchId)}
                            className={`${buttonCls} px-2 py-0.5 text-xs border border-amber-500/40 text-amber-300 hover:bg-amber-500/10`}
                          >
                            Expire
                          </button>
                        ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Nothing expires on its own. <strong className="text-slate-400">Expire</strong> an overdue
            match to cancel it with nobody requeued, then use Adjust stars to penalize whoever was at
            fault. (Cancelling via Update Match instead requeues all 4.)
          </p>
        </section>

        <section className={sectionCls}>
          <h3 className={headingCls}>Strikes (backouts this cycle)</h3>
          {!overview || overview.strikes.length === 0 ? (
            <p className="text-sm text-slate-500">{overview ? "No backouts yet." : "Loading…"}</p>
          ) : (
            <ul className="space-y-1">
              {overview.strikes.map((s) => (
                <li key={s.playerId} className="flex justify-between gap-2 text-sm">
                  <span className="text-slate-300">{s.name}</span>
                  <span className="text-slate-400">{s.backouts}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={sectionCls}>
          <h3 className={headingCls}>Adjust stars</h3>
          <div className="space-y-3">
            <PlayerSearchBox
              value={search}
              suggestions={suggestions}
              maxSuggestions={7}
              selectedPlayerName={selected?.name || null}
              onValueChange={setSearch}
              onSelectPlayer={(p) => {
                setSelected(p);
                setSearch(p.name || "");
              }}
              onClear={() => {
                setSearch("");
                setSelected(null);
              }}
            />
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required) — e.g. backed out of #123 twice"
              className="block w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={busy || !selected || !reason.trim()}
                onClick={() => adjust(-1)}
                className={`${buttonCls} border border-rose-500/40 text-rose-300 hover:bg-rose-500/10`}
              >
                −1★ (penalty)
              </button>
              <button
                type="button"
                disabled={busy || !selected || !reason.trim()}
                onClick={() => adjust(1)}
                className={`${buttonCls} border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`}
              >
                +1★
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Recorded in the ladder ledger. Follows normal match rules: −1★ at 0★ spends an unused
              cushion before demoting; +1★ at 2★ promotes.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
