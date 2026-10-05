"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PlayerSlotPicker from "@/components/PlayerSlotPicker";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import { supabase } from "@/lib/supabase";
import type { Player } from "@/lib/types";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { formatPlayBy } from "@/lib/ladder/ladderQueueShared";
import { DUO_NAME_MAX_LENGTH } from "@/lib/ladder/ladderDuoShared";
import type { AdminDuoList, AdminDuoRow } from "@/app/api/admin/ladder/duos/route";
import type { AdminDuoQueueOverview } from "@/app/api/admin/ladder/duo-queue/route";

const buttonCls =
  "rounded px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40 disabled:cursor-not-allowed disabled:opacity-50";
const smallButtonCls = `${buttonCls} px-2 py-0.5 text-xs`;
const sectionCls = "rounded-lg border border-slate-800 bg-slate-900/40 p-4";
const headingCls = "text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3";
const inputCls =
  "block w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";

const REQUEUE_LABEL: Record<string, string> = {
  opponent_backout: "requeued · opponent backed out",
  admin_cancelled: "requeued · admin",
};

type StatusFilter = "active" | "pending" | "expired" | "dissolved" | "all";

async function adminFetch(path: string, init?: { method: "POST" | "PATCH"; body: unknown }) {
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

// Admin controls for the Duo Ladder: the duo queue (waiting, overdue matches, strikes), every duo
// with its standing and the per-duo tools (±1★, rename, dissolve), and direct duo creation.
export function LadderDuosTab({ enabled }: { enabled: boolean }) {
  const { players } = useAdminDataContext();
  const [list, setList] = useState<AdminDuoList | null>(null);
  const [queue, setQueue] = useState<AdminDuoQueueOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [forceDissolve, setForceDissolve] = useState(false);
  const [confirmDissolveId, setConfirmDissolveId] = useState<number | null>(null);
  const [confirmExpireId, setConfirmExpireId] = useState<number | null>(null);

  const [playerA, setPlayerA] = useState<Player | null>(null);
  const [playerB, setPlayerB] = useState<Player | null>(null);
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [newName, setNewName] = useState("");
  const suggestionsA = usePlayerSearch(players, searchA);
  const suggestionsB = usePlayerSearch(players, searchB);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [duos, q] = await Promise.all([
        adminFetch("/api/admin/ladder/duos?status=all"),
        adminFetch("/api/admin/ladder/duo-queue"),
      ]);
      setList(duos as unknown as AdminDuoList);
      setQueue(q as unknown as AdminDuoQueueOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load duos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  async function run(
    path: string,
    init: { method: "POST" | "PATCH"; body: unknown },
    success: (json: Record<string, unknown>) => string,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const json = await adminFetch(path, init);
      setNotice(success(json));
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const tierName = useCallback(
    (tierId: number | null) => list?.tiers.find((t) => t.id === tierId)?.name ?? "—",
    [list],
  );

  const visibleDuos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list?.duos ?? []).filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.label.toLowerCase().includes(q) || d.players.some((p) => p.name.toLowerCase().includes(q))
      );
    });
  }, [list, statusFilter, query]);

  function openManage(duo: AdminDuoRow) {
    if (expandedId === duo.duoId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(duo.duoId);
    setReason("");
    setRenameValue(duo.name ?? "");
    setForceDissolve(false);
    setConfirmDissolveId(null);
  }

  if (list && !list.available) {
    return (
      <p className="text-sm text-slate-400">
        The duo ladder isn&apos;t enabled yet — apply the 20261005* migrations to turn it on.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Duo Ladder</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Fixed pairs formed by invite (or created here). Two duos waiting in a tier are matched with
            a 10-day deadline. Duo matches only move the duo&apos;s stars; ratings update as normal.
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

      <div className={`space-y-6 ${loading && list ? "opacity-60" : ""}`}>
        {/* ---- Duo queue ---- */}
        <section className={sectionCls}>
          <h3 className={headingCls}>Duo queue</h3>
          {!queue ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !queue.cycleId ? (
            <p className="text-sm text-slate-500">No active ladder cycle.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {queue.tiers.map((tier) => {
                  const rows = queue.waiting.filter((w) => w.tierId === tier.id);
                  return (
                    <div key={tier.id}>
                      <p className="text-sm font-medium text-slate-200">
                        {tier.name} <span className="text-slate-500">· {rows.length}/2</span>
                      </p>
                      {rows.length === 0 ? (
                        <p className="mt-1 text-xs text-slate-500">No duos waiting.</p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {rows.map((w) => (
                            <li key={w.duoId} className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate text-slate-300">
                                {w.label}
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
                                    "/api/admin/ladder/duo-queue/remove",
                                    { method: "POST", body: { duoId: w.duoId } },
                                    () => `${w.label} removed from the duo queue.`,
                                  )
                                }
                                className={`${smallButtonCls} shrink-0 text-slate-400 hover:text-rose-300`}
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

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Open duo queue matches</p>
                {queue.openMatches.length === 0 ? (
                  <p className="text-sm text-slate-500">None.</p>
                ) : (
                  <ul className="space-y-2">
                    {queue.openMatches.map((m) => {
                      const overdue = !!m.playByAt && new Date(m.playByAt).getTime() < Date.now();
                      const confirming = confirmExpireId === m.matchId;
                      return (
                        <li
                          key={m.matchId}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 text-sm"
                        >
                          <span className="min-w-0 text-slate-300 break-words">
                            #{m.matchId} · {m.duos.join(" vs ")}
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
                                  <span className="text-slate-400">Expire? Neither duo is requeued.</span>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setConfirmExpireId(null);
                                      void run(
                                        `/api/admin/ladder/duo-queue/matches/${m.matchId}/expire`,
                                        { method: "POST", body: {} },
                                        () => `Match #${m.matchId} expired. Use ±1★ below to penalize the duo at fault.`,
                                      );
                                    }}
                                    className={`${smallButtonCls} border border-rose-500/40 text-rose-300 hover:bg-rose-500/10`}
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmExpireId(null)}
                                    className={`${smallButtonCls} text-slate-400 hover:text-slate-200`}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setConfirmExpireId(m.matchId)}
                                  className={`${smallButtonCls} border border-amber-500/40 text-amber-300 hover:bg-amber-500/10`}
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
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Strikes (duo backouts this cycle)
                </p>
                {queue.strikes.length === 0 ? (
                  <p className="text-sm text-slate-500">No backouts yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {queue.strikes.map((s) => (
                      <li key={s.duoId} className="flex justify-between gap-2 text-sm">
                        <span className="text-slate-300">{s.label}</span>
                        <span className="text-slate-400">{s.backouts}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ---- Duos ---- */}
        <section className={sectionCls}>
          <h3 className={headingCls}>Duos</h3>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by duo or player name"
              className={inputCls}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40"
            >
              <option value="active">Active</option>
              <option value="pending">Pending invites</option>
              <option value="expired">Expired invites</option>
              <option value="dissolved">Dissolved</option>
              <option value="all">All</option>
            </select>
          </div>

          {!list ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : visibleDuos.length === 0 ? (
            <p className="text-sm text-slate-500">No duos match.</p>
          ) : (
            <ul className="space-y-2">
              {visibleDuos.map((d) => {
                const expanded = expandedId === d.duoId;
                return (
                  <li key={d.duoId} className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 break-words">
                          {d.label}
                          <span className="ml-2 text-xs text-slate-500">#{d.duoId}</span>
                        </p>
                        <p className="text-xs text-slate-500 break-words">
                          {d.players.map((p) => p.name).join(" & ")} · {d.status}
                          {d.createdByAdmin ? " · admin-created" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-slate-400">
                        {d.tierId != null && (
                          <span>
                            {tierName(d.tierId)} · {d.stars}★{d.cushionAvailable ? " · cushion" : ""}
                          </span>
                        )}
                        {d.strikes > 0 && <span className="text-amber-300">{d.strikes} strike{d.strikes === 1 ? "" : "s"}</span>}
                        {d.waiting && <span className="text-[#00C8DC]">queued</span>}
                        {d.openMatchId && <span className="text-blue-300">match #{d.openMatchId}</span>}
                        {d.status === "active" && (
                          <button
                            type="button"
                            onClick={() => openManage(d)}
                            className={`${smallButtonCls} border border-slate-700 text-slate-300 hover:border-slate-500`}
                          >
                            {expanded ? "Close" : "Manage"}
                          </button>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Adjust stars</p>
                          <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason (required) — e.g. backed out of #123"
                            className={inputCls}
                          />
                          <div className="flex flex-col sm:flex-row gap-2">
                            {([-1, 1] as const).map((delta) => (
                              <button
                                key={delta}
                                type="button"
                                disabled={busy || !reason.trim()}
                                onClick={() =>
                                  void run(
                                    "/api/admin/ladder/duo-standings/adjust",
                                    { method: "POST", body: { duoId: d.duoId, delta, reason: reason.trim() } },
                                    () => `${delta === 1 ? "+1★" : "−1★"} applied to ${d.label}.`,
                                  ).then((ok) => ok && setReason(""))
                                }
                                className={`${buttonCls} border ${
                                  delta === -1
                                    ? "border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                                    : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                                }`}
                              >
                                {delta === -1 ? "−1★ (penalty)" : "+1★"}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rename</p>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={renameValue}
                              maxLength={DUO_NAME_MAX_LENGTH}
                              onChange={(e) => setRenameValue(e.target.value)}
                              placeholder="Duo name (empty clears it)"
                              className={inputCls}
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  `/api/admin/ladder/duos/${d.duoId}`,
                                  { method: "PATCH", body: { name: renameValue } },
                                  () => "Duo renamed.",
                                )
                              }
                              className={`${buttonCls} shrink-0 border border-slate-700 text-slate-300 hover:border-slate-500`}
                            >
                              Save name
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dissolve</p>
                          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={forceDissolve}
                              onChange={(e) => setForceDissolve(e.target.checked)}
                              className="cursor-pointer"
                            />
                            Force — cancel an open queue match (the opponent is requeued)
                          </label>
                          {confirmDissolveId === d.duoId ? (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-slate-400">Dissolve {d.label}? Both players are emailed.</span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setConfirmDissolveId(null);
                                  void run(
                                    `/api/admin/ladder/duos/${d.duoId}/dissolve`,
                                    { method: "POST", body: { force: forceDissolve } },
                                    (json) => {
                                      const warnings = (json.warnings as string[] | undefined) ?? [];
                                      return `${d.label} dissolved.${warnings.length ? ` ${warnings.join(" ")}` : ""}`;
                                    },
                                  ).then((ok) => ok && setExpandedId(null));
                                }}
                                className={`${smallButtonCls} border border-rose-500/40 text-rose-300 hover:bg-rose-500/10`}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDissolveId(null)}
                                className={`${smallButtonCls} text-slate-400 hover:text-slate-200`}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmDissolveId(d.duoId)}
                              className={`${buttonCls} border border-rose-500/40 text-rose-300 hover:bg-rose-500/10`}
                            >
                              Dissolve duo
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---- Create ---- */}
        <section className={sectionCls}>
          <h3 className={headingCls}>Create a duo</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PlayerSlotPicker
              label="Player 1"
              suggestions={suggestionsA}
              selectedPlayer={playerA}
              search={searchA}
              onSearchChange={setSearchA}
              onSelect={setPlayerA}
              onClear={() => setPlayerA(null)}
            />
            <PlayerSlotPicker
              label="Player 2"
              suggestions={suggestionsB}
              selectedPlayer={playerB}
              search={searchB}
              onSearchChange={setSearchB}
              onSelect={setPlayerB}
              onClear={() => setPlayerB(null)}
            />
          </div>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newName}
              maxLength={DUO_NAME_MAX_LENGTH}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Duo name (optional)"
              className={inputCls}
            />
            <button
              type="button"
              disabled={busy || !playerA || !playerB || playerA.player_id === playerB.player_id}
              onClick={() =>
                void run(
                  "/api/admin/ladder/duos",
                  {
                    method: "POST",
                    body: {
                      playerA: Number(playerA?.player_id),
                      playerB: Number(playerB?.player_id),
                      name: newName.trim() || null,
                    },
                  },
                  (json) =>
                    json.created === false
                      ? "Those two are already an active duo."
                      : `Duo created.${json.ladderWarning ? ` ${json.ladderWarning as string}` : ""}`,
                ).then((ok) => {
                  if (!ok) return;
                  setPlayerA(null);
                  setPlayerB(null);
                  setNewName("");
                })
              }
              className={`${buttonCls} shrink-0 bg-[#00C8DC] text-[#0E1523] hover:bg-white`}
            >
              Create duo
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Skips the invite — the duo is active immediately and placed by its average rating. Re-creating
            a dissolved pair revives it with its standing this cycle.
          </p>
        </section>
      </div>
    </div>
  );
}
