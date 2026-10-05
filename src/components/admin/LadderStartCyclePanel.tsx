"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { StarBadge, tierIconSrc } from "@/components/LadderTierBadge";

const buttonCls =
  "rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40 disabled:cursor-not-allowed disabled:opacity-50";

type TierRow = { id: number; name: string; rank: number; elo_floor: number };

type PlacementDraft = {
  player_id: number;
  rating: number;
  tier_id: number;
  tier_name: string;
  tier_rank: number;
  stars: number;
  previous_tier_id: number | null;
  previous_tier_name: string | null;
  previous_stars: number | null;
};

type TierDistribution = {
  tier_id: number;
  tier_name: string;
  tier_rank: number;
  elo_floor: number;
  star_band: number;
  count: number;
};

type DuoPlacementDraft = {
  duo_id: number;
  rating: number;
  tier_id: number;
  tier_name: string;
  tier_rank: number;
  stars: number;
  previous_tier_id: number | null;
  previous_tier_name: string | null;
  previous_stars: number | null;
};

type StartResponse = {
  cycle?: { id: number | null; label: string; status: string; starts_at: string };
  written?: boolean;
  placements?: PlacementDraft[];
  namesByPlayer?: Record<string, string>;
  distribution?: TierDistribution[];
  previousCycle?: { id: number; label: string } | null;
  placed?: number;
  duoAvailable?: boolean;
  duoPlacements?: DuoPlacementDraft[];
  duoLabels?: Record<string, string>;
  duoDistribution?: TierDistribution[];
  warnings?: string[];
  error?: string;
};

function todayInputValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatBand(band: number): string {
  return Number(band.toFixed(3)).toString();
}

// Mirrors the server guards in startLadderCycle so the admin sees the problem before a round trip.
function validateThresholds(
  tiers: TierRow[],
  values: Record<number, string>,
): string | null {
  if (tiers.length === 0) return "No ladder tiers configured.";

  const parsed: Array<{ name: string; floor: number }> = [];
  for (const tier of tiers) {
    const raw = (values[tier.id] ?? "").trim();
    if (raw === "") return `Enter a threshold for ${tier.name}.`;
    const floor = Number(raw);
    if (!Number.isFinite(floor) || floor < 0) {
      return `${tier.name}'s threshold must be a number of 0 or more.`;
    }
    parsed.push({ name: tier.name, floor });
  }

  if (parsed[0].floor !== 0) {
    return `The lowest tier (${parsed[0].name}) must be 0 so every rating can be placed.`;
  }
  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i].floor <= parsed[i - 1].floor) {
      return `${parsed[i].name} (${parsed[i].floor}) must be above ${parsed[i - 1].name} (${parsed[i - 1].floor}).`;
    }
  }
  return null;
}

// Star bands the entered floors produce — mirrors tierWidth in ladderPlacement.ts, shown so the
// admin can see what their numbers mean before previewing. Empty while the floors are invalid.
function computeBands(
  tiers: TierRow[],
  values: Record<number, string>,
  invalid: boolean,
): Record<number, number> {
  if (invalid) return {};
  const sorted = [...tiers].sort((a, b) => a.rank - b.rank);
  const out: Record<number, number> = {};
  sorted.forEach((tier, i) => {
    const self = Number(values[tier.id]);
    const next = sorted[i + 1] ? Number(values[sorted[i + 1].id]) : null;
    const below = sorted[i - 1] ? Number(values[sorted[i - 1].id]) : null;
    const width = next !== null ? next - self : below !== null ? self - below : 1.5;
    out[tier.id] = width / 3;
  });
  return out;
}

function ThresholdGrid({
  tiers,
  values,
  bands,
  onChange,
}: {
  tiers: TierRow[];
  values: Record<number, string>;
  bands: Record<number, number>;
  onChange: (tierId: number, value: string) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {tiers.map((tier) => (
        <label
          key={tier.id}
          className="flex items-center gap-2 rounded border border-slate-700/50 bg-slate-950/40 px-2.5 py-2"
        >
          <Image src={tierIconSrc(tier.name)} alt="" width={20} height={20} className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-slate-100">{tier.name}</span>
            {bands[tier.id] !== undefined && (
              <span className="block text-[10px] text-slate-500">{formatBand(bands[tier.id])} per star</span>
            )}
          </span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={values[tier.id] ?? ""}
            onChange={(e) => onChange(tier.id, e.target.value)}
            className="w-20 shrink-0 rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-right text-sm tabular-nums text-slate-100 focus:border-[#00C8DC]/50 focus:outline-none"
          />
        </label>
      ))}
    </div>
  );
}

export function LadderStartCyclePanel({
  enabled,
  hasActiveCycle,
  nextCycleNumber,
  onStarted,
}: {
  enabled: boolean;
  hasActiveCycle: boolean;
  nextCycleNumber: number;
  onStarted: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [floors, setFloors] = useState<Record<number, string>>({});
  // Duo ladder floors. duoAvailable stays false until the duo migrations are applied.
  const [duoFloors, setDuoFloors] = useState<Record<number, string>>({});
  const [duoAvailable, setDuoAvailable] = useState(false);
  const [loadingTiers, setLoadingTiers] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Default the label to the next cycle number, but stop tracking it the moment the admin types
  // their own — the tab reloads its cycle list after a start, which would otherwise clobber it.
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState(todayInputValue());
  const label = customLabel ?? `Cycle ${nextCycleNumber}`;

  const [preview, setPreview] = useState<StartResponse | null>(null);
  const [startResult, setStartResult] = useState<StartResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Prefill from the most recent cycle's snapshot, falling back to the global ladder_tiers floors
  // for cycles that predate ladder_cycle_tiers.
  const loadTiers = useCallback(async () => {
    setLoadingTiers(true);
    setLoadError(null);

    const { data: tierData, error: tierError } = await supabase
      .from("ladder_tiers")
      .select("id, name, rank, elo_floor")
      .order("rank", { ascending: true });

    if (tierError) {
      setLoadError(tierError.message);
      setLoadingTiers(false);
      return;
    }

    const rows = ((tierData ?? []) as Array<TierRow & { elo_floor: number | string }>).map((t) => ({
      id: t.id,
      name: t.name,
      rank: t.rank,
      elo_floor: Number(t.elo_floor),
    }));
    setTiers(rows);

    const { data: latestCycle } = await supabase
      .from("ladder_cycles")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapshot = new Map<number, number>();
    if (latestCycle?.id) {
      const { data: snapshotRows } = await supabase
        .from("ladder_cycle_tiers")
        .select("tier_id, elo_floor")
        .eq("cycle_id", latestCycle.id);

      for (const row of (snapshotRows ?? []) as Array<{
        tier_id: number;
        elo_floor: number | string;
      }>) {
        snapshot.set(Number(row.tier_id), Number(row.elo_floor));
      }
    }

    const next: Record<number, string> = {};
    for (const tier of rows) {
      next[tier.id] = String(snapshot.get(tier.id) ?? tier.elo_floor);
    }
    setFloors(next);

    // Duo floors: the latest cycle's duo snapshot, else the solo floors just loaded. A missing table
    // means the duo ladder isn't enabled yet, so the duo grid stays hidden.
    const { data: duoRows, error: duoError } = latestCycle?.id
      ? await supabase.from("ladder_cycle_duo_tiers").select("tier_id, elo_floor").eq("cycle_id", latestCycle.id)
      : await supabase.from("ladder_cycle_duo_tiers").select("tier_id, elo_floor").limit(0);
    setDuoAvailable(!duoError);
    const duoSnapshot = new Map<number, number>();
    for (const row of (duoRows ?? []) as Array<{ tier_id: number; elo_floor: number | string }>) {
      duoSnapshot.set(Number(row.tier_id), Number(row.elo_floor));
    }
    const nextDuo: Record<number, string> = {};
    for (const tier of rows) {
      nextDuo[tier.id] = duoSnapshot.has(tier.id) ? String(duoSnapshot.get(tier.id)) : next[tier.id];
    }
    setDuoFloors(nextDuo);
    setLoadingTiers(false);
  }, []);

  useEffect(() => {
    if (enabled && open && tiers.length === 0) void loadTiers();
  }, [enabled, open, tiers.length, loadTiers]);

  const validationError = useMemo(
    () => (tiers.length === 0 ? null : validateThresholds(tiers, floors)),
    [tiers, floors],
  );

  const bands = useMemo(
    () => computeBands(tiers, floors, !!validationError),
    [tiers, floors, validationError],
  );

  const duoValidationError = useMemo(() => {
    if (!duoAvailable || tiers.length === 0) return null;
    const error = validateThresholds(tiers, duoFloors);
    return error ? `Duo floors: ${error}` : null;
  }, [duoAvailable, tiers, duoFloors]);

  const duoBands = useMemo(
    () => computeBands(tiers, duoFloors, !!duoValidationError),
    [tiers, duoFloors, duoValidationError],
  );

  async function callStart(dryRun: boolean): Promise<StartResponse | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setActionError("No active session. Please sign in again.");
      return null;
    }

    const response = await fetch("/api/admin/ladder/cycles/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        label,
        startsAt: new Date(`${startsAt}T00:00:00`).toISOString(),
        thresholds: tiers.map((t) => ({ tierId: t.id, eloFloor: Number(floors[t.id]) })),
        ...(duoAvailable
          ? { duoThresholds: tiers.map((t) => ({ tierId: t.id, eloFloor: Number(duoFloors[t.id]) })) }
          : {}),
        dryRun,
      }),
    });

    const result = (await response.json()) as StartResponse;
    if (!response.ok) {
      setActionError(result.error || "Request failed.");
      return null;
    }
    return result;
  }

  async function handlePreview() {
    setActionError(null);
    setPreview(null);
    setStartResult(null);
    setConfirming(false);
    setBusy(true);
    try {
      const result = await callStart(true);
      if (result) setPreview(result);
    } catch {
      setActionError("Unexpected error while previewing the allocation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    setActionError(null);
    setBusy(true);
    try {
      const result = await callStart(false);
      if (result) {
        setStartResult(result);
        setPreview(null);
        setConfirming(false);
        setTiers([]); // force a reload so the next prefill uses the cycle just created
        await onStarted();
      }
    } catch {
      setActionError("Unexpected error while starting the cycle.");
    } finally {
      setBusy(false);
    }
  }

  if (hasActiveCycle) {
    return (
      <p className="rounded border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
        A cycle is still active. Close it above before starting the next one — closing freezes its
        results, so they&apos;d be lost if the next cycle were seeded on top.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-3 text-left"
      >
        <span>
          <span className="font-semibold text-slate-100">Start a new cycle</span>
          <span className="mt-0.5 block text-xs text-slate-400">
            Set a rating threshold per tier, then allocate every rated player.
          </span>
        </span>
        <span className="shrink-0 text-xs text-slate-400">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-slate-700/60 px-3 py-3">
          {loadError && (
            <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {loadError}
            </p>
          )}

          {loadingTiers && tiers.length === 0 ? (
            <p className="text-sm text-slate-400">Loading tiers…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-300">Label</span>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    className="rounded border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-sm text-slate-100 focus:border-[#00C8DC]/50 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-300">Starts</span>
                  <input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="rounded border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-sm text-slate-100 focus:border-[#00C8DC]/50 focus:outline-none"
                  />
                </label>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-300">Rating thresholds</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Each tier starts at its threshold and is split into equal thirds for 0★ / 1★ / 2★.
                  The lowest tier must be 0.
                </p>
                <ThresholdGrid
                  tiers={tiers}
                  values={floors}
                  bands={bands}
                  onChange={(tierId, value) => setFloors((prev) => ({ ...prev, [tierId]: value }))}
                />
              </div>

              {duoAvailable && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-300">Duo ladder thresholds</p>
                    <button
                      type="button"
                      onClick={() => setDuoFloors({ ...floors })}
                      className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-100"
                    >
                      Copy solo thresholds
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Duos are placed by the average of their two players&apos; ratings against these. Same
                    rules: the lowest tier must be 0.
                  </p>
                  <ThresholdGrid
                    tiers={tiers}
                    values={duoFloors}
                    bands={duoBands}
                    onChange={(tierId, value) => setDuoFloors((prev) => ({ ...prev, [tierId]: value }))}
                  />
                </div>
              )}

              {(validationError || duoValidationError) && (
                <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {validationError ?? duoValidationError}
                </p>
              )}

              {actionError && (
                <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {actionError}
                </p>
              )}

              {startResult && (
                <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  <p>
                    Started {startResult.cycle?.label} — {startResult.placed} player
                    {startResult.placed === 1 ? "" : "s"} placed
                    {startResult.duoAvailable
                      ? `, ${startResult.duoPlacements?.length ?? 0} duo${(startResult.duoPlacements?.length ?? 0) === 1 ? "" : "s"} placed`
                      : ""}
                    .
                  </p>
                  {(startResult.warnings ?? []).length > 0 && (
                    <p className="mt-1 text-amber-300">{startResult.warnings?.join(" ")}</p>
                  )}
                </div>
              )}

              {!preview && !startResult && (
                <div>
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={busy || !!validationError || !!duoValidationError || !label.trim()}
                    className={`${buttonCls} bg-slate-700 text-slate-100 hover:bg-slate-600`}
                  >
                    {busy ? "Working…" : "Preview allocation"}
                  </button>
                </div>
              )}

              {preview && (
                <AllocationPreview
                  preview={preview}
                  busy={busy}
                  confirming={confirming}
                  label={label}
                  onAskConfirm={() => setConfirming(true)}
                  onCancel={() => {
                    setConfirming(false);
                    setPreview(null);
                  }}
                  onCommit={handleCommit}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AllocationPreview({
  preview,
  busy,
  confirming,
  label,
  onAskConfirm,
  onCancel,
  onCommit,
}: {
  preview: StartResponse;
  busy: boolean;
  confirming: boolean;
  label: string;
  onAskConfirm: () => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const placements = preview.placements ?? [];
  const names = preview.namesByPlayer ?? {};
  const distribution = [...(preview.distribution ?? [])].sort((a, b) => b.tier_rank - a.tier_rank);

  // Highest tier first, then stars, so the preview reads top-down like the ladder does.
  const sorted = [...placements].sort((a, b) => {
    if (b.tier_rank !== a.tier_rank) return b.tier_rank - a.tier_rank;
    if (b.stars !== a.stars) return b.stars - a.stars;
    return (names[String(a.player_id)] ?? "").localeCompare(names[String(b.player_id)] ?? "");
  });

  const moved = sorted.filter(
    (p) => p.previous_tier_id !== null && p.previous_tier_id !== p.tier_id,
  ).length;
  const unplaced = sorted.filter((p) => p.previous_tier_id === null).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-400">
        {placements.length} player{placements.length === 1 ? "" : "s"} would be placed ·{" "}
        <span className="text-slate-200">{moved} change tier</span>
        {preview.previousCycle ? ` from ${preview.previousCycle.label}` : ""}
        {unplaced > 0 ? ` · ${unplaced} new to the ladder` : ""}
      </p>

      {(preview.warnings ?? []).length > 0 && (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {preview.warnings?.join(" ")}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {distribution.map((d) => (
          <div
            key={d.tier_id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-slate-700/40 bg-slate-900/60 px-2.5 py-1.5 text-xs"
          >
            <Image
              src={tierIconSrc(d.tier_name)}
              alt=""
              width={18}
              height={18}
              className="h-[18px] w-[18px] shrink-0"
            />
            <span className="min-w-0 flex-1 truncate text-slate-100">{d.tier_name}</span>
            <span className="shrink-0 tabular-nums text-slate-400">
              {d.elo_floor}+ · {formatBand(d.star_band)}/★
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-200">
              {d.count} player{d.count === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>

      {preview.duoAvailable && <DuoAllocationPreview preview={preview} />}

      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer hover:text-slate-200">
          Per-player allocation ({sorted.length})
        </summary>
        <div className="mt-1 flex flex-col gap-1">
          {sorted.map((p) => (
            <div
              key={p.player_id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-slate-700/30 px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-slate-200">
                {names[String(p.player_id)] || `Player ${p.player_id}`}
              </span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {p.rating.toFixed(2)}
              </span>
              <span className="shrink-0 text-slate-500">
                {p.previous_tier_name
                  ? `${p.previous_tier_name} ${p.previous_stars ?? 0}★`
                  : "unplaced"}
              </span>
              <span className="shrink-0 text-slate-600">→</span>
              <span className="flex shrink-0 items-center gap-1.5 text-slate-100">
                {p.tier_name}
                <StarBadge stars={p.stars} />
              </span>
            </div>
          ))}
        </div>
      </details>

      {confirming ? (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-200">
            This creates <strong>{label}</strong>, makes it the active cycle, and writes a starting
            tier and star count for all {placements.length} players
            {preview.duoAvailable ? ` and ${preview.duoPlacements?.length ?? 0} duos` : ""}. Everyone&apos;s
            climb restarts from these placements. Continue?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCommit}
              disabled={busy}
              className={`${buttonCls} bg-[#00C8DC] text-slate-900 hover:bg-[#00C8DC]/80`}
            >
              {busy ? "Working…" : "Yes, start cycle"}
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAskConfirm}
            disabled={busy || placements.length === 0}
            className={`${buttonCls} bg-[#00C8DC] text-slate-900 hover:bg-[#00C8DC]/80`}
          >
            Start cycle
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`${buttonCls} bg-slate-700 text-slate-100 hover:bg-slate-600`}
          >
            Change thresholds
          </button>
        </div>
      )}
    </div>
  );
}

function DuoAllocationPreview({ preview }: { preview: StartResponse }) {
  const placements = preview.duoPlacements ?? [];
  const labels = preview.duoLabels ?? {};
  const distribution = [...(preview.duoDistribution ?? [])].sort((a, b) => b.tier_rank - a.tier_rank);
  const sorted = [...placements].sort(
    (a, b) =>
      b.tier_rank - a.tier_rank ||
      b.stars - a.stars ||
      (labels[String(a.duo_id)] ?? "").localeCompare(labels[String(b.duo_id)] ?? ""),
  );

  return (
    <div className="flex flex-col gap-1.5 rounded border border-slate-700/40 bg-slate-950/30 p-2.5">
      <p className="text-xs font-medium text-slate-300">
        Duo ladder · {placements.length} active duo{placements.length === 1 ? "" : "s"} would be placed
      </p>
      {distribution.map((d) => (
        <div key={d.tier_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
          <Image src={tierIconSrc(d.tier_name)} alt="" width={16} height={16} className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-slate-100">{d.tier_name}</span>
          <span className="shrink-0 tabular-nums text-slate-400">
            {d.elo_floor}+ · {formatBand(d.star_band)}/★
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-200">
            {d.count} duo{d.count === 1 ? "" : "s"}
          </span>
        </div>
      ))}
      {sorted.length > 0 && (
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer hover:text-slate-200">Per-duo allocation ({sorted.length})</summary>
          <div className="mt-1 flex flex-col gap-1">
            {sorted.map((p) => (
              <div
                key={p.duo_id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-slate-700/30 px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-slate-200">
                  {labels[String(p.duo_id)] || `Duo ${p.duo_id}`}
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">avg {p.rating.toFixed(2)}</span>
                <span className="shrink-0 text-slate-500">
                  {p.previous_tier_name ? `${p.previous_tier_name} ${p.previous_stars ?? 0}★` : "new"}
                </span>
                <span className="shrink-0 text-slate-600">→</span>
                <span className="flex shrink-0 items-center gap-1.5 text-slate-100">
                  {p.tier_name}
                  <StarBadge stars={p.stars} />
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
