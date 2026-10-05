"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import PlayerSlotPicker from "@/components/PlayerSlotPicker";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";
import type { AdminDuoList } from "@/app/api/admin/ladder/duos/route";
import {
  SCHEDULE_MATCH_TYPE_OPTIONS,
  SCHEDULE_MATCH_VENUE_OPTIONS,
} from "./constants";

type SlotKey = "t1p1" | "t1p2" | "t2p1" | "t2p2";
type SlotState = { search: string; player: Player | null };

const EMPTY_SLOTS: Record<SlotKey, SlotState> = {
  t1p1: { search: "", player: null },
  t1p2: { search: "", player: null },
  t2p1: { search: "", player: null },
  t2p2: { search: "", player: null },
};

type LadderMode = "none" | "solo" | "duo";

const LADDER_MODE_OPTIONS: Array<{ value: LadderMode; label: string; description: string }> = [
  { value: "none", label: "Not ladder", description: "A regular match — no ladder stars move." },
  { value: "solo", label: "Solo ladder", description: "Each player's own tier stars move (own-tier match)." },
  { value: "duo", label: "Duo ladder", description: "Each team must be a duo; only the duos' stars move." },
];

// What Schedule Match knows about a team in duo mode: its active duo, or that it has none yet.
type TeamDuoStatus =
  | { state: "loading" }
  | { state: "active"; label: string; tierName: string | null; stars: number | null }
  | { state: "none"; detail: string }
  | { state: "error"; detail: string };

const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";
const inputCls =
  "block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";

export function ScheduleMatchTab() {
  const {
    players,
    playersLoading,
    playersError,
    matchSeasons,
    matchSeasonsLoading,
    matchSeasonsError,
    refreshScheduledMatches,
  } = useAdminDataContext();

  const [eventId, setEventId] = useState("");
  const [dateLocal, setDateLocal] = useState("");
  const [timeLocal, setTimeLocal] = useState("");
  const [venue, setVenue] = useState("");
  const [matchType, setMatchType] = useState("");
  const [ladderMode, setLadderMode] = useState<LadderMode>("solo");
  const [createMissingDuos, setCreateMissingDuos] = useState(false);
  const [teamDuos, setTeamDuos] = useState<{ 1: TeamDuoStatus | null; 2: TeamDuoStatus | null }>({
    1: null,
    2: null,
  });
  const [slots, setSlots] = useState<Record<SlotKey, SlotState>>(EMPTY_SLOTS);
  type EmailNotifResult = {
    sent: Array<{ player_id: number; displayName: string }>;
    skipped: Array<{ player_id: number; displayName: string; reason: string }>;
  } | null;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [emailResult, setEmailResult] = useState<EmailNotifResult>(null);
  const [ladderWarning, setLadderWarning] = useState<string | null>(null);

  const sortedSeasons = useMemo(
    () => matchSeasons.slice().sort((a, b) => b.id - a.id),
    [matchSeasons],
  );

  const selectedIds = useMemo(
    () =>
      new Set(
        Object.values(slots)
          .map((s) => (s.player ? String(s.player.player_id) : ""))
          .filter(Boolean),
      ),
    [slots],
  );

  const updateSlot = (key: SlotKey, patch: Partial<SlotState>) =>
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  // Duo mode: look up whether each team is already an active duo, for the chips under the selector.
  const team1Ids = [slots.t1p1.player?.player_id, slots.t1p2.player?.player_id];
  const team2Ids = [slots.t2p1.player?.player_id, slots.t2p2.player?.player_id];
  const team1Key = team1Ids.every(Boolean) ? team1Ids.join(",") : null;
  const team2Key = team2Ids.every(Boolean) ? team2Ids.join(",") : null;
  useEffect(() => {
    if (ladderMode !== "duo") return;
    let cancelled = false;

    async function lookup(pair: string | null): Promise<TeamDuoStatus | null> {
      if (!pair) return null;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(`/api/admin/ladder/duos?pair=${pair}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        const json = (await res.json()) as AdminDuoList & { error?: string };
        if (!res.ok) return { state: "error", detail: json.error ?? "Lookup failed." };
        if (!json.available) return { state: "error", detail: "The duo ladder isn't enabled yet." };
        const duo = json.duos[0];
        if (!duo) return { state: "none", detail: "Not a duo yet." };
        if (duo.status !== "active") return { state: "none", detail: `Duo is ${duo.status}.` };
        return {
          state: "active",
          label: duo.label,
          tierName: json.tiers.find((t) => t.id === duo.tierId)?.name ?? null,
          stars: duo.stars,
        };
      } catch {
        return { state: "error", detail: "Lookup failed." };
      }
    }

    setTeamDuos({ 1: team1Key ? { state: "loading" } : null, 2: team2Key ? { state: "loading" } : null });
    void Promise.all([lookup(team1Key), lookup(team2Key)]).then(([t1, t2]) => {
      if (!cancelled) setTeamDuos({ 1: t1, 2: t2 });
    });
    return () => {
      cancelled = true;
    };
  }, [ladderMode, team1Key, team2Key]);

  const excludeFor = (key: SlotKey): Set<string> => {
    const own = slots[key].player
      ? String(slots[key].player!.player_id)
      : null;
    return new Set([...selectedIds].filter((id) => id !== own));
  };

  // One call per slot — hooks must be called unconditionally at top level.
  const t1p1Sugg = usePlayerSearch(players, slots.t1p1.search);
  const t1p2Sugg = usePlayerSearch(players, slots.t1p2.search);
  const t2p1Sugg = usePlayerSearch(players, slots.t2p1.search);
  const t2p2Sugg = usePlayerSearch(players, slots.t2p2.search);

  const filterSugg = (sugg: Player[], excludeIds: Set<string>) =>
    sugg.filter((p) => !excludeIds.has(String(p.player_id)));

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    setEmailResult(null);
    setLadderWarning(null);

    const playerIds = [
      slots.t1p1.player?.player_id,
      slots.t1p2.player?.player_id,
      slots.t2p1.player?.player_id,
      slots.t2p2.player?.player_id,
    ];

    if (playerIds.some((id) => !id)) {
      setError("All four player slots are required.");
      return;
    }
    if (new Set(playerIds.map(String)).size !== 4) {
      setError("All four players must be unique.");
      return;
    }

    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setError("No active session found. Please sign in again.");
        return;
      }

      const response = await fetch("/api/admin/matches/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          eventId: eventId ? Number.parseInt(eventId, 10) : null,
          dateLocal: dateLocal || null,
          timeLocal: timeLocal || null,
          venue: venue.trim() || null,
          type: matchType.trim() || null,
          ladderMode,
          createMissingDuos: ladderMode === "duo" && createMissingDuos,
          team1: {
            player1Id: String(slots.t1p1.player!.player_id),
            player2Id: String(slots.t1p2.player!.player_id),
          },
          team2: {
            player1Id: String(slots.t2p1.player!.player_id),
            player2Id: String(slots.t2p2.player!.player_id),
          },
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        match?: { match_id: number };
        message?: string;
        emails?: EmailNotifResult;
        ladderWarning?: string | null;
      };

      if (!response.ok) {
        setError(
          result.details?.join(" ") ||
            result.error ||
            "Failed to create match.",
        );
        return;
      }

      setSlots(EMPTY_SLOTS);
      setDateLocal("");
      setTimeLocal("");
      setVenue("");
      setMatchType("");
      setEventId("");
      setLadderMode("solo");
      setCreateMissingDuos(false);
      setSuccess(
        result.message ||
          `Match #${result.match?.match_id ?? ""} created successfully.`,
      );
      setEmailResult(result.emails ?? null);
      setLadderWarning(result.ladderWarning ?? null);
      refreshScheduledMatches();
    } catch {
      setError("Unexpected error while creating match.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Schedule a Match
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Assign players to teams and set match details.
        </p>
      </div>

      {/* Match Details */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Match Details
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="sched-event">
              Event
            </label>
            <select
              id="sched-event"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className={inputCls}
              disabled={matchSeasonsLoading}
            >
              <option value="">
                {matchSeasonsLoading ? "Loading…" : "No event (optional)"}
              </option>
              {sortedSeasons.map((season) => (
                <option key={season.id} value={String(season.id)}>
                  {season.label}
                </option>
              ))}
            </select>
            {matchSeasonsError && (
              <p className="mt-1 text-xs text-rose-500">{matchSeasonsError}</p>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="sched-date">
              Date
            </label>
            <input
              id="sched-date"
              type="date"
              value={dateLocal}
              onChange={(e) => setDateLocal(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="sched-time">
              Time{" "}
              <span className="normal-case tracking-normal font-normal text-slate-400">
                (optional)
              </span>
            </label>
            <input
              id="sched-time"
              type="time"
              value={timeLocal}
              onChange={(e) => setTimeLocal(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="sched-venue">
              Venue
            </label>
            <input
              id="sched-venue"
              type="text"
              list="sched-venue-options"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Select or type venue"
              className={inputCls}
            />
            <datalist id="sched-venue-options">
              {SCHEDULE_MATCH_VENUE_OPTIONS.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          <div>
            <label className={labelCls} htmlFor="sched-type">
              Match Type
            </label>
            <select
              id="sched-type"
              value={matchType}
              onChange={(e) => setMatchType(e.target.value)}
              className={inputCls}
            >
              <option value="">Select type</option>
              {SCHEDULE_MATCH_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className={labelCls}>Ladder</span>
          <div className="flex flex-col sm:flex-row gap-2">
            {LADDER_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLadderMode(opt.value)}
                aria-pressed={ladderMode === opt.value}
                className={`flex-1 rounded border px-3 py-2 text-left text-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40 ${
                  ladderMode === opt.value
                    ? "border-[#00C8DC]/60 bg-[#00C8DC]/10 text-slate-100"
                    : "border-slate-700 text-slate-400 hover:border-slate-500"
                }`}
              >
                <span className="block font-medium">{opt.label}</span>
                <span className="block text-xs text-slate-500">{opt.description}</span>
              </button>
            ))}
          </div>

          {ladderMode === "duo" && (
            <div className="mt-3 space-y-1.5 text-sm">
              {([1, 2] as const).map((team) => {
                const status = teamDuos[team];
                return (
                  <p key={team} className="text-slate-400 break-words">
                    <span className="text-slate-500">Team {team}: </span>
                    {!status ? (
                      "pick both players"
                    ) : status.state === "loading" ? (
                      "checking…"
                    ) : status.state === "active" ? (
                      <span className="text-emerald-300">
                        Active duo: {status.label}
                        {status.tierName ? ` (${status.tierName} ${status.stars ?? 0}★)` : " (not placed yet)"}
                      </span>
                    ) : (
                      <span className={status.state === "error" ? "text-rose-300" : "text-amber-300"}>
                        {status.detail}
                      </span>
                    )}
                  </p>
                );
              })}
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createMissingDuos}
                  onChange={(e) => setCreateMissingDuos(e.target.checked)}
                  className="cursor-pointer"
                />
                Create the duo on save for any team that isn&apos;t one yet
              </label>
            </div>
          )}
        </div>
      </section>

      {/* Team Assignment */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Team 1 */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Team 1
          </h3>
          {playersLoading ? (
            <p className="text-sm text-slate-400">Loading players…</p>
          ) : (
            <>
              <PlayerSlotPicker
                label="Player 1"
                suggestions={filterSugg(t1p1Sugg, excludeFor("t1p1"))}
                selectedPlayer={slots.t1p1.player}
                search={slots.t1p1.search}
                onSearchChange={(v) => updateSlot("t1p1", { search: v })}
                onSelect={(p) => updateSlot("t1p1", { player: p, search: "" })}
                onClear={() => updateSlot("t1p1", { player: null, search: "" })}
              />
              <PlayerSlotPicker
                label="Player 2"
                suggestions={filterSugg(t1p2Sugg, excludeFor("t1p2"))}
                selectedPlayer={slots.t1p2.player}
                search={slots.t1p2.search}
                onSearchChange={(v) => updateSlot("t1p2", { search: v })}
                onSelect={(p) => updateSlot("t1p2", { player: p, search: "" })}
                onClear={() => updateSlot("t1p2", { player: null, search: "" })}
              />
            </>
          )}
        </section>

        {/* Team 2 */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Team 2
          </h3>
          {playersLoading ? (
            <p className="text-sm text-slate-400">Loading players…</p>
          ) : (
            <>
              <PlayerSlotPicker
                label="Player 1"
                suggestions={filterSugg(t2p1Sugg, excludeFor("t2p1"))}
                selectedPlayer={slots.t2p1.player}
                search={slots.t2p1.search}
                onSearchChange={(v) => updateSlot("t2p1", { search: v })}
                onSelect={(p) => updateSlot("t2p1", { player: p, search: "" })}
                onClear={() => updateSlot("t2p1", { player: null, search: "" })}
              />
              <PlayerSlotPicker
                label="Player 2"
                suggestions={filterSugg(t2p2Sugg, excludeFor("t2p2"))}
                selectedPlayer={slots.t2p2.player}
                search={slots.t2p2.search}
                onSearchChange={(v) => updateSlot("t2p2", { search: v })}
                onSelect={(p) => updateSlot("t2p2", { player: p, search: "" })}
                onClear={() => updateSlot("t2p2", { player: null, search: "" })}
              />
            </>
          )}
        </section>
      </div>

      {/* Feedback */}
      {playersError && (
        <p className="text-sm text-rose-500">
          Error loading players: {playersError}
        </p>
      )}
      {error && (
        <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 space-y-2">
          <p className="font-medium">{success}</p>
          {ladderWarning && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {ladderWarning}
            </p>
          )}
          {emailResult && (
            <div className="pt-1 border-t border-emerald-200 dark:border-emerald-800/40">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1.5">
                Emails: {emailResult.sent.length} / {emailResult.sent.length + emailResult.skipped.length} sent
              </p>
              <ul className="space-y-0.5">
                {emailResult.sent.map((p) => (
                  <li key={p.player_id} className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                    <span className="text-emerald-500">✓</span>
                    <span>{p.displayName}</span>
                  </li>
                ))}
                {emailResult.skipped.map((p) => (
                  <li key={p.player_id} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="text-rose-400">✗</span>
                    <span>{p.displayName}</span>
                    <span className="text-slate-400 dark:text-slate-500">
                      — {p.reason === "no_email" ? "no email on file" : p.reason === "unsubscribed" ? "unsubscribed" : "opted out"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || playersLoading}
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Scheduling…" : "Schedule Match"}
        </button>
      </div>
    </div>
  );
}
