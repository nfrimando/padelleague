"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
  useParams,
} from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import MatchCard from "@/components/MatchCard";
import MatchFiltersCard from "@/components/MatchFiltersCard";
import RatingSparkline from "@/components/RatingSparkline";
import ImageLightbox from "@/components/ImageLightbox";
import { formatEventOptionLabel } from "@/lib/eventLabels";
import { ALL_MATCH_FILTER, getEventsFromMatches } from "@/lib/matches";
import { useEventMap } from "@/lib/useEventMap";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerProfileStats } from "@/lib/usePlayerProfileStats";
import { useMatchSetsLoader } from "@/lib/useMatchSetsLoader";
import { supabase } from "@/lib/supabase";
import { countryToFlag } from "@/lib/utils";
import { COUNTRY_LIST } from "@/lib/countries";
import type { MatchWithTeams } from "@/lib/types";

const PAGE_SIZE = 15;

function StatPill({
  label,
  value,
  highlight,
  small,
  tooltip,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  small?: boolean;
  tooltip?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-4 px-2">
      <span
        className={`${small ? "text-sm font-black leading-snug text-center px-1" : "text-3xl font-black tracking-tighter"} ${highlight ? "text-[#00C8DC]" : "text-white"}`}
      >
        {value}
      </span>
      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
        {label}
        {tooltip && (
          <span className="relative group/tip cursor-help">
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[#687FA3]/50 fill-current"><circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1" fill="none"/><text x="6" y="9" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">i</text></svg>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-2 text-[9px] font-normal normal-case tracking-normal text-slate-300 leading-relaxed opacity-0 group-hover/tip:opacity-100 transition-opacity z-20 text-center whitespace-normal">
              {tooltip}
            </span>
          </span>
        )}
      </span>
    </div>
  );
}

function PlayerProfilePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeParams = useParams<{ id: string }>();
  const searchParamsString = searchParams.toString();
  const playerId = String(routeParams?.id || "");

  const [eventFilter, setEventFilter] = useState<
    number | typeof ALL_MATCH_FILTER
  >(ALL_MATCH_FILTER);
  const [selectedTypeFilter, setSelectedTypeFilter] =
    useState<string>(ALL_MATCH_FILTER);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [viewerIsMember, setViewerIsMember] = useState(false);
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false);
  const [playerOverlay, setPlayerOverlay] = useState<{
    country: string | null;
    phone_country_code: string | null;
    phone_number: string | null;
    is_public: boolean;
    preferred_side: "left" | "right" | "both" | null;
  } | null>(null);

  const { players, loading: loadingPlayers } = usePlayers({
    onlyActivePlayers: true,
  });
  const selectedPlayer = useMemo(
    () => players.find((p) => String(p.player_id) === playerId) ?? null,
    [players, playerId],
  );
  const effectivePlayer = useMemo(
    () =>
      selectedPlayer && playerOverlay
        ? { ...selectedPlayer, ...playerOverlay }
        : selectedPlayer,
    [selectedPlayer, playerOverlay],
  );

  const {
    lightMatches,
    teamsByMatchId,
    matchCount,
    wins,
    winRate,
    partnerStats,
    latestRating,
    ratingHistory,
    loading: loadingStats,
  } = usePlayerProfileStats(playerId);

  const { eventMap, events } = useEventMap();

  // ── URL state sync ─────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const eventParam = params.get("event") ?? params.get("season");
    const parsedEvent = eventParam ? Number(eventParam) : Number.NaN;

    const nextEvent: number | typeof ALL_MATCH_FILTER =
      eventParam === ALL_MATCH_FILTER
        ? ALL_MATCH_FILTER
        : !Number.isNaN(parsedEvent)
          ? parsedEvent
          : ALL_MATCH_FILTER;

    const typeParam = params.get("type");
    const nextType =
      typeParam && typeParam !== ALL_MATCH_FILTER
        ? typeParam
        : ALL_MATCH_FILTER;

    setEventFilter((curr) => (curr === nextEvent ? curr : nextEvent));
    setSelectedTypeFilter((curr) => (curr === nextType ? curr : nextType));
  }, [searchParamsString]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    params.set("event", String(eventFilter));
    params.delete("season");
    params.set("type", selectedTypeFilter);
    const nextQuery = params.toString();
    if (nextQuery === searchParamsString) return;
    router.replace(`${pathname}?${nextQuery}`, { scroll: false });
  }, [pathname, router, searchParamsString, eventFilter, selectedTypeFilter]);

  // Reset visible count on filter or player change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [eventFilter, selectedTypeFilter, playerId]);

  // Check if the current viewer is a league member (has a players row)
  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user?.email) return;
      const { data } = await supabase
        .from("players")
        .select("player_id")
        .eq("email", session.user.email)
        .maybeSingle();
      if (data) setViewerIsMember(true);
    });
  }, []);

  // Fetch profile fields not included in the active_players view
  useEffect(() => {
    if (!playerId) return;
    void supabase
      .from("players")
      .select("country, phone_country_code, phone_number, is_public, preferred_side")
      .eq("player_id", playerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPlayerOverlay(data as typeof playerOverlay);
      });
  }, [playerId]);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filteredLightMatches = useMemo(() => {
    return lightMatches.filter((match) => {
      if (match.status === "cancelled") return false;
      if (
        eventFilter !== ALL_MATCH_FILTER &&
        Number.isFinite(eventFilter) &&
        match.event_id != null &&
        match.event_id !== eventFilter
      )
        return false;
      if (
        selectedTypeFilter !== ALL_MATCH_FILTER &&
        match.type !== selectedTypeFilter
      )
        return false;
      return true;
    });
  }, [lightMatches, eventFilter, selectedTypeFilter]);

  // ── Pagination ─────────────────────────────────────────────────────────────

  const visibleLightMatches = filteredLightMatches.slice(0, visibleCount);
  const visibleMatchIds = visibleLightMatches.map((m) => String(m.match_id));
  const hasMore = visibleCount < filteredLightMatches.length;

  const { setsByMatchId, loading: loadingSets } = useMatchSetsLoader(
    playerId,
    visibleMatchIds,
  );

  // Assemble MatchWithTeams for display (no pre-match ratings shown — privacy)
  const displayMatches = useMemo((): MatchWithTeams[] => {
    return visibleLightMatches.map((match) => {
      const matchKey = String(match.match_id);
      const teams = (teamsByMatchId.get(matchKey) ?? []).map((team) => ({
        uuid: team.uuid,
        team_number: team.team_number,
        sets_won: team.sets_won,
        player_1: team.player_1,
        player_2: team.player_2,
      }));
      const sets = setsByMatchId.get(matchKey) ?? [];
      return { ...match, teams, sets };
    });
  }, [visibleLightMatches, teamsByMatchId, setsByMatchId]);

  // ── Event filter options ───────────────────────────────────────────────────

  const eventOptions = useMemo(() => {
    const eventRowsById = new Map(
      events.map((e) => [Number(e.event_id), e] as const),
    );
    const toStartTime = (id: number) => {
      const raw = eventRowsById.get(id)?.start_date;
      if (!raw) return Number.NEGATIVE_INFINITY;
      const parsed = Date.parse(raw);
      return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    };
    return [...getEventsFromMatches(lightMatches)]
      .sort((a, b) => toStartTime(b) - toStartTime(a) || b - a)
      .map((id) => ({
        id,
        label: formatEventOptionLabel(
          eventRowsById.get(id) ?? {
            event_id: id,
            name: eventMap[id] ?? null,
            start_date: null,
            end_date: null,
          },
        ),
      }));
  }, [lightMatches, events, eventMap]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const mostRecentEventLabel = useMemo(() => {
    const match = lightMatches.find((m) => m.event_id != null);
    if (!match?.event_id) return null;
    return eventMap[match.event_id] ?? `Event ${match.event_id}`;
  }, [lightMatches, eventMap]);

  const topPartners = useMemo(
    () =>
      [...partnerStats]
        .sort(
          (a, b) => b.matchesPlayed - a.matchesPlayed || b.winRate - a.winRate,
        )
        .slice(0, 5),
    [partnerStats],
  );

  // ── Infinite scroll ────────────────────────────────────────────────────────

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingSets) {
          setVisibleCount((v) => v + PAGE_SIZE);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingSets]);

  // ── Player profile link helper ─────────────────────────────────────────────

  const getPlayerHref = (pid: string | number) => {
    const params = new URLSearchParams(searchParamsString);
    const q = params.toString();
    const base = `/players/${encodeURIComponent(String(pid))}`;
    return q ? `${base}?${q}` : base;
  };

  // ── Loading / not-found states ─────────────────────────────────────────────

  if (loadingPlayers) {
    return (
      <div className="min-h-screen bg-[#0E1523]">
        <SiteHeader />
        <div className="max-w-3xl mx-auto py-6 md:py-10">
          {/* Back link placeholder */}
          <div className="h-3 w-20 rounded bg-[#1a2540] animate-pulse mb-4 mx-4 sm:mx-6" />

          {/* Hero skeleton */}
          <div className="bg-[#162032] border-y sm:border border-[#687FA3]/10 sm:rounded-3xl overflow-hidden mb-4 sm:mb-6 sm:mx-6">
            <div className="px-6 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-full bg-[#1a2540] animate-pulse shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="h-2.5 w-24 rounded bg-[#1a2540] animate-pulse" />
                <div className="h-7 w-48 rounded bg-[#1a2540] animate-pulse" />
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                <div className="h-8 w-20 rounded-lg bg-[#1a2540] animate-pulse" />
                <div className="h-2 w-16 rounded bg-[#1a2540] animate-pulse" />
              </div>
            </div>

            {/* Stats row */}
            <div className="border-t border-[#687FA3]/10 grid grid-cols-3 divide-x divide-[#687FA3]/10">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-1 py-4 px-2"
                >
                  <div className="h-8 w-12 rounded bg-[#1a2540] animate-pulse" />
                  <div className="h-2 w-10 rounded bg-[#1a2540] animate-pulse" />
                </div>
              ))}
            </div>
          </div>

          {/* Partners skeleton */}
          <div className="bg-[#162032] border-y sm:border border-[#687FA3]/10 sm:rounded-3xl mb-4 sm:mb-6 sm:mx-6">
            <div className="px-6 pt-5 pb-3">
              <div className="h-2.5 w-36 rounded bg-[#1a2540] animate-pulse" />
            </div>
            <div className="flex gap-2 px-6 pb-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-9 w-28 rounded-full bg-[#1a2540] animate-pulse shrink-0"
                />
              ))}
            </div>
          </div>

          {/* Match history skeleton */}
          <div className="px-4 sm:px-6">
            <div className="h-2.5 w-28 rounded bg-[#1a2540] animate-pulse mb-4" />
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-[#162032] border border-[#687FA3]/10 animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedPlayer || !effectivePlayer) {
    return (
      <div className="min-h-screen bg-[#0E1523] flex flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-xl font-black text-white">Player not found</h1>
        <p className="text-sm text-[#687FA3]">
          This player does not exist or is not currently active.
        </p>
        <Link
          href="/players"
          className="text-sm text-[#00C8DC] hover:underline"
        >
          ← Back to players
        </Link>
      </div>
    );
  }

  const initials = effectivePlayer.name
    ? effectivePlayer.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "?";

  const canSeePrivateDetails =
    viewerIsMember || (effectivePlayer.is_public ?? false);

  const countryEntry = effectivePlayer.country
    ? COUNTRY_LIST.find((c) => c.code === effectivePlayer.country) ?? null
    : null;

  const displayRating =
    latestRating !== null
      ? latestRating.toFixed(2)
      : effectivePlayer.latest_rating != null
        ? Number(effectivePlayer.latest_rating).toFixed(2)
        : null;

  return (
    <div className="min-h-screen bg-[#0E1523]">
      <SiteHeader />

      <div className="max-w-3xl mx-auto py-6 md:py-10">
        {/* Back link */}
        <Link
          href="/players"
          className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3] hover:text-[#00C8DC] transition-colors mb-4 px-4 sm:px-6"
        >
          ← Players
        </Link>

        {/* ── Hero section ── */}
        <div className="bg-[#162032] border-y sm:border border-[#687FA3]/10 sm:rounded-3xl overflow-hidden mb-4 sm:mb-6 sm:mx-6">
          {/* Player identity */}
          <div className="px-6 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="shrink-0">
              {canSeePrivateDetails && effectivePlayer.image_link ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAvatarLightboxOpen(true)}
                    className="cursor-zoom-in block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00C8DC]/60"
                    aria-label="View enlarged photo"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={effectivePlayer.image_link}
                      alt={effectivePlayer.name}
                      className="w-16 h-16 rounded-full border-2 border-[#00C8DC]/30 shadow-lg object-cover"
                    />
                  </button>
                  <ImageLightbox
                    isOpen={avatarLightboxOpen}
                    onClose={() => setAvatarLightboxOpen(false)}
                    src={effectivePlayer.image_link}
                    alt={effectivePlayer.name}
                  />
                </>
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#1a2540] border border-[#687FA3]/20 flex items-center justify-center">
                  <span className="text-xl font-black text-[#687FA3]">
                    {initials}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[#687FA3] text-[10px] font-black uppercase tracking-[0.3em] mb-1">
                Player Profile
              </p>
              <h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter leading-none truncate text-white">
                {effectivePlayer.name}
              </h1>
              {(effectivePlayer.nickname ||
                (canSeePrivateDetails && effectivePlayer.preferred_side)) && (
                <p className="text-[#687FA3] text-sm mt-1 flex items-center gap-1.5 flex-wrap">
                  {effectivePlayer.nickname && (
                    <span>&ldquo;{effectivePlayer.nickname}&rdquo;</span>
                  )}
                  {effectivePlayer.nickname &&
                    canSeePrivateDetails &&
                    effectivePlayer.preferred_side && (
                      <span className="text-[#687FA3]/40">·</span>
                    )}
                  {canSeePrivateDetails && effectivePlayer.preferred_side && (
                    <span>
                      {effectivePlayer.preferred_side.charAt(0).toUpperCase() +
                        effectivePlayer.preferred_side.slice(1)}{" "}
                      side
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Rating + sparkline */}
            {(displayRating || loadingStats) && (
              <div className="shrink-0 flex flex-col items-end gap-2">
                {loadingStats ? (
                  <div className="h-8 w-20 rounded-lg bg-[#1a2540] animate-pulse" />
                ) : displayRating ? (
                  <p className="text-[#00C8DC] text-3xl font-black tracking-tighter leading-none">
                    {displayRating}
                  </p>
                ) : null}
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
                  Current Rating
                </p>
                {ratingHistory.length >= 2 && (
                  <RatingSparkline history={ratingHistory} />
                )}
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="border-t border-[#687FA3]/10 grid grid-cols-3 divide-x divide-[#687FA3]/10">
            <StatPill
              label="Matches"
              value={loadingStats ? "…" : String(matchCount)}
              tooltip="Only completed matches are counted. Forfeited and cancelled matches are excluded."
            />
            <StatPill label="Wins" value={loadingStats ? "…" : String(wins)} />
            <StatPill
              label="Win Rate"
              value={loadingStats ? "…" : `${winRate}%`}
              highlight
            />
          </div>

          {/* Most recent event */}
          {(mostRecentEventLabel || loadingStats) && (
            <div className="border-t border-[#687FA3]/10 px-6 py-3">
              {loadingStats ? (
                <div className="h-4 w-40 rounded bg-[#1a2540] animate-pulse" />
              ) : mostRecentEventLabel ? (
                <p className="text-xs text-[#687FA3]">
                  <span className="font-black uppercase tracking-[0.15em]">
                    Most Recent ·{" "}
                  </span>
                  <span className="font-bold text-white/70">
                    {mostRecentEventLabel}
                  </span>
                </p>
              ) : null}
            </div>
          )}

          {/* Country + phone (gated by privacy) */}
          {canSeePrivateDetails &&
            (countryEntry ||
              (effectivePlayer.phone_country_code && effectivePlayer.phone_number)) && (
              <div className="border-t border-[#687FA3]/10 px-6 py-3 flex items-center gap-3 flex-wrap">
                {countryEntry && (
                  <span className="text-xs text-[#687FA3] flex items-center gap-1.5">
                    <span>{countryToFlag(countryEntry.code)}</span>
                    <span>{countryEntry.name}</span>
                  </span>
                )}
                {countryEntry && effectivePlayer.phone_country_code && effectivePlayer.phone_number && (
                  <span className="text-[#687FA3]/40 text-xs">·</span>
                )}
                {effectivePlayer.phone_country_code && effectivePlayer.phone_number && (
                  <a
                    href={`https://wa.me/${effectivePlayer.phone_country_code.replace("+", "")}${effectivePlayer.phone_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#687FA3] hover:text-[#00C8DC] transition-colors cursor-pointer"
                  >
                    {effectivePlayer.phone_country_code} {effectivePlayer.phone_number}
                  </a>
                )}
              </div>
            )}
        </div>

        {/* ── Partners section ── */}
        {(loadingStats || topPartners.length > 0) && (
          <div className="bg-[#162032] border-y sm:border border-[#687FA3]/10 sm:rounded-3xl mb-4 sm:mb-6 sm:mx-6">
            <div className="px-6 pt-5 pb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#687FA3]">
                Most Played Partners
              </span>
            </div>

            {loadingStats ? (
              <div
                className="flex gap-2 px-6 pb-5 overflow-x-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-9 w-28 rounded-full bg-[#1a2540] animate-pulse shrink-0"
                  />
                ))}
              </div>
            ) : (
              <div
                className="flex gap-2 px-6 pb-5 overflow-x-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {topPartners.map((stat) => {
                  const p = stat.player as {
                    player_id: string | number;
                    name: string;
                    nickname?: string | null;
                    image_link?: string | null;
                  };
                  const href = getPlayerHref(p.player_id);
                  const initial = (
                    (p.nickname || p.name || "?")[0] ?? "?"
                  ).toUpperCase();
                  return (
                    <Link
                      key={String(p.player_id)}
                      href={href}
                      className="shrink-0 flex items-center gap-2 bg-[#1a2540] border border-[#687FA3]/10 hover:border-[#00C8DC]/30 rounded-full pl-2 pr-3 py-1.5 transition-colors group"
                    >
                      {p.image_link ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_link}
                          alt={p.name}
                          className="w-6 h-6 rounded-full object-cover border border-[#687FA3]/20 shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[#162032] border border-[#687FA3]/20 flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-black text-[#687FA3]">
                            {initial}
                          </span>
                        </div>
                      )}
                      <span className="text-xs font-bold text-white/80 group-hover:text-[#00C8DC] transition-colors whitespace-nowrap">
                        {p.nickname || p.name}
                      </span>
                      <span className="text-[10px] text-[#687FA3] whitespace-nowrap">
                        {stat.matchesPlayed}x
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Match history section ── */}
        <div className="px-4 sm:px-6">
          <div className="mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#687FA3] mb-3">
              Match History
            </p>
            <MatchFiltersCard
              eventFilter={eventFilter}
              events={eventOptions}
              selectedTypeFilter={selectedTypeFilter}
              onEventChange={(value) => setEventFilter(value)}
              onTypeChange={(value) => setSelectedTypeFilter(value)}
              variant="dark"
            />
          </div>

          <div className="relative min-h-[180px]">
            {/* Initial loading state */}
            {loadingStats && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loadingStats && filteredLightMatches.length === 0 && (
              <div className="text-center py-12 text-[#687FA3] text-sm">
                No matches found for the selected filters.
              </div>
            )}

            {!loadingStats && filteredLightMatches.length > 0 && (
              <div className="space-y-4">
                {displayMatches.map((match) => (
                  <MatchCard
                    key={match.match_id}
                    match={match}
                    highlightPlayerId={effectivePlayer.player_id}
                    seasonLabel={
                      match.event_id != null
                        ? (eventMap[match.event_id] ?? undefined)
                        : undefined
                    }
                  />
                ))}

                {/* Infinite scroll sentinel */}
                <div ref={sentinelRef} className="h-4" />

                {/* Loading more indicator */}
                {loadingSets && hasMore && (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {!hasMore && filteredLightMatches.length > PAGE_SIZE && (
                  <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3] py-4">
                    All {filteredLightMatches.length} matches loaded
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlayerProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0E1523] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PlayerProfilePageContent />
    </Suspense>
  );
}
