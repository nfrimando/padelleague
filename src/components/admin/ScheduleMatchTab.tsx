"use client";

import { useMemo, useState } from "react";
import { useAdminDataContext } from "@/components/admin/AdminDataContext";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import PlayerCard from "@/components/PlayerCard";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";
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

const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";
const inputCls =
  "block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";

type PlayerSlotPickerProps = {
  label: string;
  suggestions: Player[];
  selectedPlayer: Player | null;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (player: Player) => void;
  onClear: () => void;
};

function PlayerSlotPicker({
  label,
  suggestions,
  selectedPlayer,
  search,
  onSearchChange,
  onSelect,
  onClear,
}: PlayerSlotPickerProps) {
  return (
    <div className="space-y-1.5">
      <span className={labelCls}>{label}</span>
      {selectedPlayer ? (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-2">
          <div className="flex-1 min-w-0">
            <PlayerCard
              player={selectedPlayer}
              size="sm"
              disableLink
              showLatestRating={false}
            />
          </div>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[11px] font-medium text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20"
          >
            Change
          </button>
        </div>
      ) : (
        <PlayerSearchBox
          value={search}
          suggestions={suggestions}
          onValueChange={onSearchChange}
          onSelectPlayer={(p) => {
            onSelect(p);
            onSearchChange("");
          }}
          onClear={() => onSearchChange("")}
          placeholder="Search by name or nickname..."
          maxSuggestions={6}
        />
      )}
    </div>
  );
}

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
  const [slots, setSlots] = useState<Record<SlotKey, SlotState>>(EMPTY_SLOTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      setSuccess(
        result.message ||
          `Match #${result.match?.match_id ?? ""} created successfully.`,
      );
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
            <select
              id="sched-venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className={inputCls}
            >
              <option value="">Select venue</option>
              {SCHEDULE_MATCH_VENUE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
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
        <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
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
