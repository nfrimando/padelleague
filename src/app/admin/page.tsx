"use client";

import { useEffect, useState } from "react";
import BackToHome from "@/components/BackToHome";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";
import { useMatchSeasons } from "@/lib/useMatchSeasons";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { usePlayers } from "@/lib/usePlayers";

const ADMIN_PLAYER_TABS = [
  { value: "CREATE", label: "Create Player" },
  { value: "EDIT", label: "Edit Player" },
  { value: "SCHEDULE_MATCH", label: "Schedule Match" },
  { value: "COMPLETE_MATCH", label: "Complete Match" },
  { value: "UPDATE_MATCH", label: "Update Match" },
] as const;
const MATCH_STATUS_OPTIONS = [
  "completed",
  "scheduled",
  "forfeit",
  "cancelled",
] as const;
const UPDATE_MATCH_STATUS_OPTIONS = [
  "scheduled",
  "forfeit",
  "cancelled",
] as const;
const SCHEDULE_MATCH_TYPE_OPTIONS = [
  "duel",
  "kotc",
  "group",
  "finals",
] as const;
const SCHEDULE_MATCH_VENUE_OPTIONS = [
  "ACC",
  "Manila Polo Club",
  "MPC Arcovia",
  "MPC BGC",
  "Padel 300",
  "Palm Beach",
  "Play Padel",
  "Play Padel Pavilion",
  "Unilab",
  "Warehouse 71",
] as const;

type MatchStatusValue = (typeof MATCH_STATUS_OPTIONS)[number];

type MatchPlayerSummary = {
  player_id: number;
  name: string | null;
  nickname: string | null;
};

type LoadedMatchDetails = {
  matchId: number;
  status: MatchStatusValue;
  seasonId: number | null;
  dateLocal: string | null;
  timeLocal: string | null;
  venue: string | null;
  type: string | null;
  winnerTeam: number | null;
  team1SetsWon: number | null;
  team2SetsWon: number | null;
  team1: {
    player1: MatchPlayerSummary | null;
    player2: MatchPlayerSummary | null;
  };
  team2: {
    player1: MatchPlayerSummary | null;
    player2: MatchPlayerSummary | null;
  };
  preRatingsV3: Record<number, number | null>;
};

type ScheduledMatchOption = {
  match_id: number;
  date_local: string | null;
  time_local: string | null;
  venue: string | null;
  type: string | null;
  team1Player1Id: number | null;
  team1Player2Id: number | null;
  team2Player1Id: number | null;
  team2Player2Id: number | null;
};

const AUTH_BOX_CLASS =
  "w-full md:w-[24rem] md:max-w-[24rem] min-h-[188px] mx-auto rounded-lg border border-slate-200 dark:border-slate-700 p-4";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activePlayerTab, setActivePlayerTab] =
    useState<(typeof ADMIN_PLAYER_TABS)[number]["value"]>("SCHEDULE_MATCH");
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [editName, setEditName] = useState("");
  const [editNickname, setEditNickname] = useState("");
  const [editImageLink, setEditImageLink] = useState("");
  const [editInitialRating, setEditInitialRating] = useState("");
  const [createName, setCreateName] = useState("");
  const [createNickname, setCreateNickname] = useState("");
  const [createImageLink, setCreateImageLink] = useState("");
  const [createInitialRating, setCreateInitialRating] = useState("");
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [savePlayerError, setSavePlayerError] = useState<string | null>(null);
  const [savePlayerSuccess, setSavePlayerSuccess] = useState<string | null>(
    null,
  );
  const [creatingPlayer, setCreatingPlayer] = useState(false);
  const [createPlayerError, setCreatePlayerError] = useState<string | null>(
    null,
  );
  const [createPlayerSuccess, setCreatePlayerSuccess] = useState<string | null>(
    null,
  );
  const [createMatchSeasonId, setCreateMatchSeasonId] = useState("");
  const [createMatchDateLocal, setCreateMatchDateLocal] = useState("");
  const [createMatchTimeLocal, setCreateMatchTimeLocal] = useState("");
  const [createMatchVenue, setCreateMatchVenue] = useState("");
  const [createMatchType, setCreateMatchType] = useState("");
  const [createMatchTeam1Player1, setCreateMatchTeam1Player1] = useState("");
  const [createMatchTeam1Player2, setCreateMatchTeam1Player2] = useState("");
  const [createMatchTeam2Player1, setCreateMatchTeam2Player1] = useState("");
  const [createMatchTeam2Player2, setCreateMatchTeam2Player2] = useState("");
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [createMatchError, setCreateMatchError] = useState<string | null>(null);
  const [createMatchSuccess, setCreateMatchSuccess] = useState<string | null>(
    null,
  );
  const [updateMatchId, setUpdateMatchId] = useState("");
  const [updateMatchStatus, setUpdateMatchStatus] =
    useState<(typeof MATCH_STATUS_OPTIONS)[number]>("completed");
  const [updateMatchSeasonId, setUpdateMatchSeasonId] = useState("");
  const [updateMatchDateLocal, setUpdateMatchDateLocal] = useState("");
  const [updateMatchTimeLocal, setUpdateMatchTimeLocal] = useState("");
  const [updateMatchVenue, setUpdateMatchVenue] = useState("");
  const [updateMatchType, setUpdateMatchType] = useState("");
  const [updateMatchTeam1Player1, setUpdateMatchTeam1Player1] = useState("");
  const [updateMatchTeam1Player2, setUpdateMatchTeam1Player2] = useState("");
  const [updateMatchTeam2Player1, setUpdateMatchTeam2Player1] = useState("");
  const [updateMatchTeam2Player2, setUpdateMatchTeam2Player2] = useState("");
  const [updateSet1Team1, setUpdateSet1Team1] = useState("");
  const [updateSet1Team2, setUpdateSet1Team2] = useState("");
  const [updateSet2Team1, setUpdateSet2Team1] = useState("");
  const [updateSet2Team2, setUpdateSet2Team2] = useState("");
  const [updateSet3Team1, setUpdateSet3Team1] = useState("");
  const [updateSet3Team2, setUpdateSet3Team2] = useState("");
  const [completingMatch, setCompletingMatch] = useState(false);
  const [completeMatchError, setCompleteMatchError] = useState<string | null>(
    null,
  );
  const [completeMatchSuccess, setCompleteMatchSuccess] = useState<
    string | null
  >(null);
  const [completeMatchCalculated, setCompleteMatchCalculated] = useState(false);
  const [updatingMatch, setUpdatingMatch] = useState(false);
  const [updateMatchError, setUpdateMatchError] = useState<string | null>(null);
  const [updateMatchSuccess, setUpdateMatchSuccess] = useState<string | null>(
    null,
  );
  const [updateMatchLoadingDetails, setUpdateMatchLoadingDetails] =
    useState(false);
  const [updateMatchDetailsError, setUpdateMatchDetailsError] = useState<
    string | null
  >(null);
  const [loadedMatchDetails, setLoadedMatchDetails] =
    useState<LoadedMatchDetails | null>(null);
  const [scheduledMatches, setScheduledMatches] = useState<
    ScheduledMatchOption[]
  >([]);
  const [scheduledMatchesLoading, setScheduledMatchesLoading] = useState(false);
  const [scheduledMatchesError, setScheduledMatchesError] = useState<
    string | null
  >(null);
  const {
    players,
    setPlayers,
    loading: playersLoading,
    error: playersError,
  } = usePlayers({ enabled: isAdmin, orderByName: true });
  const {
    seasons: matchSeasons,
    loading: matchSeasonsLoading,
    error: matchSeasonsError,
  } = useMatchSeasons(isAdmin);
  const filtered = usePlayerSearch(players, search);
  const playerNameById = new Map(
    players.map((player) => [
      String(player.player_id),
      player.nickname || player.name || `#${player.player_id}`,
    ]),
  );

  useEffect(() => {
    let isMounted = true;

    async function resolveAdminStatus(userId: string | undefined) {
      if (!userId) {
        return false;
      }

      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return false;
      }

      return !!data;
    }

    async function initSession() {
      const { data } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      const nextEmail = data.user?.email ?? null;
      const nextAvatarUrl =
        (data.user?.user_metadata?.picture as string | undefined) ||
        (data.user?.user_metadata?.avatar_url as string | undefined) ||
        null;
      const nextIsAdmin = await resolveAdminStatus(data.user?.id);

      if (!isMounted) {
        return;
      }

      setEmail(nextEmail);
      setAvatarUrl(nextAvatarUrl);
      setIsAdmin(nextIsAdmin);
      setLoading(false);
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!isMounted) {
          return;
        }

        const nextEmail = session?.user?.email ?? null;
        const nextAvatarUrl =
          (session?.user?.user_metadata?.picture as string | undefined) ||
          (session?.user?.user_metadata?.avatar_url as string | undefined) ||
          null;
        const nextIsAdmin = await resolveAdminStatus(session?.user?.id);
        if (!isMounted) {
          return;
        }

        setEmail(nextEmail);
        setAvatarUrl(nextAvatarUrl);
        setIsAdmin(nextIsAdmin);
        setLoading(false);
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setActivePlayerTab("SCHEDULE_MATCH");
      setSelectedPlayer(null);
      setSearch("");
      setSavePlayerError(null);
      setSavePlayerSuccess(null);
      setCreatePlayerError(null);
      setCreatePlayerSuccess(null);
      setCreateMatchError(null);
      setCreateMatchSuccess(null);
      setCompleteMatchError(null);
      setCompleteMatchSuccess(null);
      setCompleteMatchCalculated(false);
      setUpdateMatchError(null);
      setUpdateMatchSuccess(null);
      setUpdateMatchDetailsError(null);
      setScheduledMatches([]);
      setScheduledMatchesError(null);
      setLoadedMatchDetails(null);
      return;
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    if (createMatchSeasonId || matchSeasons.length === 0) {
      return;
    }

    setCreateMatchSeasonId(String(matchSeasons[0]));
  }, [isAdmin, createMatchSeasonId, matchSeasons]);

  useEffect(() => {
    if (!isAdmin || activePlayerTab !== "COMPLETE_MATCH") {
      return;
    }

    let cancelled = false;

    const loadScheduledMatches = async () => {
      setScheduledMatchesLoading(true);
      setScheduledMatchesError(null);

      const { data, error } = await supabase
        .from("matches")
        .select("match_id,date_local,time_local,venue,type")
        .eq("status", "scheduled")
        .order("date_local", { ascending: true })
        .order("time_local", { ascending: true })
        .order("match_id", { ascending: true });

      if (cancelled) {
        return;
      }

      if (error) {
        setScheduledMatches([]);
        setScheduledMatchesError(
          error.message || "Failed to load scheduled matches.",
        );
        setScheduledMatchesLoading(false);
        return;
      }

      const baseRows = (data ?? []) as Array<
        Omit<
          ScheduledMatchOption,
          | "team1Player1Id"
          | "team1Player2Id"
          | "team2Player1Id"
          | "team2Player2Id"
        >
      >;

      const matchIds = baseRows.map((row) => row.match_id);
      const teamMap = new Map<
        number,
        {
          team1Player1Id: number | null;
          team1Player2Id: number | null;
          team2Player1Id: number | null;
          team2Player2Id: number | null;
        }
      >();

      if (matchIds.length > 0) {
        const { data: teamRows } = await supabase
          .from("match_teams")
          .select("match_id,team_number,player_1_id,player_2_id")
          .in("match_id", matchIds);

        for (const row of teamRows ?? []) {
          const existing = teamMap.get(row.match_id) ?? {
            team1Player1Id: null,
            team1Player2Id: null,
            team2Player1Id: null,
            team2Player2Id: null,
          };

          if (row.team_number === 1) {
            existing.team1Player1Id = row.player_1_id;
            existing.team1Player2Id = row.player_2_id;
          } else if (row.team_number === 2) {
            existing.team2Player1Id = row.player_1_id;
            existing.team2Player2Id = row.player_2_id;
          }

          teamMap.set(row.match_id, existing);
        }
      }

      const rows: ScheduledMatchOption[] = baseRows.map((row) => {
        const team = teamMap.get(row.match_id);
        return {
          ...row,
          team1Player1Id: team?.team1Player1Id ?? null,
          team1Player2Id: team?.team1Player2Id ?? null,
          team2Player1Id: team?.team2Player1Id ?? null,
          team2Player2Id: team?.team2Player2Id ?? null,
        };
      });

      setScheduledMatches(rows);

      if (
        updateMatchId &&
        !rows.some((match) => String(match.match_id) === updateMatchId)
      ) {
        setUpdateMatchId("");
      }

      setScheduledMatchesLoading(false);
    };

    void loadScheduledMatches();

    return () => {
      cancelled = true;
    };
  }, [
    isAdmin,
    activePlayerTab,
    completeMatchSuccess,
    createMatchSuccess,
    updateMatchId,
  ]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const matchId = Number.parseInt(updateMatchId, 10);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      setLoadedMatchDetails(null);
      setUpdateMatchDetailsError(null);
      setUpdateMatchTeam1Player1("");
      setUpdateMatchTeam1Player2("");
      setUpdateMatchTeam2Player1("");
      setUpdateMatchTeam2Player2("");
      return;
    }

    let cancelled = false;

    const loadMatchDetails = async () => {
      setUpdateMatchLoadingDetails(true);
      setUpdateMatchDetailsError(null);

      const { data: matchRow, error: matchError } = await supabase
        .from("matches")
        .select(
          "match_id,status,season_id,date_local,time_local,venue,type,winner_team",
        )
        .eq("match_id", matchId)
        .maybeSingle();

      if (cancelled) return;

      if (matchError) {
        setLoadedMatchDetails(null);
        setUpdateMatchDetailsError(
          matchError.message || "Failed to load match.",
        );
        setUpdateMatchLoadingDetails(false);
        return;
      }

      if (!matchRow) {
        setLoadedMatchDetails(null);
        setUpdateMatchDetailsError("Match not found.");
        setUpdateMatchLoadingDetails(false);
        return;
      }

      const { data: teams, error: teamsError } = await supabase
        .from("match_teams")
        .select("team_number,player_1_id,player_2_id,sets_won")
        .eq("match_id", matchId);

      if (cancelled) return;

      if (teamsError) {
        setLoadedMatchDetails(null);
        setUpdateMatchDetailsError(
          teamsError.message || "Failed to load match teams.",
        );
        setUpdateMatchLoadingDetails(false);
        return;
      }

      const { data: setsRows, error: setsError } = await supabase
        .from("match_sets")
        .select("set_number,team_1_games,team_2_games")
        .eq("match_id", matchId)
        .order("set_number", { ascending: true });

      if (cancelled) return;

      if (setsError) {
        setLoadedMatchDetails(null);
        setUpdateMatchDetailsError(
          setsError.message || "Failed to load match sets.",
        );
        setUpdateMatchLoadingDetails(false);
        return;
      }

      const team1 = (teams ?? []).find((team) => team.team_number === 1);
      const team2 = (teams ?? []).find((team) => team.team_number === 2);

      const playerIds = [
        team1?.player_1_id,
        team1?.player_2_id,
        team2?.player_1_id,
        team2?.player_2_id,
      ].filter((id): id is number => typeof id === "number");

      const uniquePlayerIds = Array.from(new Set(playerIds));

      const { data: playersRows, error: playersError } =
        uniquePlayerIds.length > 0
          ? await supabase
              .from("players")
              .select("player_id,name,nickname,initial_rating")
              .in("player_id", uniquePlayerIds)
          : { data: [], error: null };

      if (cancelled) return;

      if (playersError) {
        setLoadedMatchDetails(null);
        setUpdateMatchDetailsError(
          playersError.message || "Failed to load players.",
        );
        setUpdateMatchLoadingDetails(false);
        return;
      }

      const playerMap = new Map<number, MatchPlayerSummary>();
      const initialRatingMap = new Map<number, number | null>();
      for (const row of playersRows ?? []) {
        playerMap.set(row.player_id, {
          player_id: row.player_id,
          name: row.name ?? null,
          nickname: row.nickname ?? null,
        });
        initialRatingMap.set(
          row.player_id,
          typeof row.initial_rating === "number" ? row.initial_rating : null,
        );
      }

      const preRatingsV3: Record<number, number | null> = {};
      for (const playerId of uniquePlayerIds) {
        const { data: latestRows } = await supabase
          .from("match_player_ratings")
          .select("match_id,rating_post,formula_name")
          .eq("player_id", playerId)
          .neq("match_id", matchId);

        const preferredByMatch = new Map<
          number,
          { ratingPost: number; priority: number }
        >();

        for (const row of latestRows ?? []) {
          const matchIdForRow = Number(row.match_id);
          const ratingPost = Number(row.rating_post);
          if (!Number.isFinite(matchIdForRow) || !Number.isFinite(ratingPost)) {
            continue;
          }

          const formula = String(row.formula_name || "").toLowerCase();
          const priority = formula === "v3" ? 2 : formula === "v2" ? 1 : 0;
          const existing = preferredByMatch.get(matchIdForRow);

          if (!existing || priority >= existing.priority) {
            preferredByMatch.set(matchIdForRow, { ratingPost, priority });
          }
        }

        if (preferredByMatch.size > 0) {
          const { data: matchesForRatings } = await supabase
            .from("matches")
            .select("match_id,date_local,time_local")
            .in("match_id", Array.from(preferredByMatch.keys()))
            .order("date_local", { ascending: false, nullsFirst: false })
            .order("time_local", { ascending: false, nullsFirst: false })
            .order("match_id", { ascending: false });

          let foundLatest: number | null = null;
          for (const row of matchesForRatings ?? []) {
            const candidate = preferredByMatch.get(Number(row.match_id));
            if (candidate) {
              foundLatest = candidate.ratingPost;
              break;
            }
          }

          if (typeof foundLatest === "number") {
            preRatingsV3[playerId] = foundLatest;
            continue;
          }
        }

        const { data: existingForMatch } = await supabase
          .from("match_player_ratings")
          .select("rating_pre")
          .eq("match_id", matchId)
          .eq("player_id", playerId)
          .maybeSingle();

        preRatingsV3[playerId] =
          typeof existingForMatch?.rating_pre === "number"
            ? existingForMatch.rating_pre
            : (initialRatingMap.get(playerId) ?? null);
      }

      if (cancelled) return;

      const nextStatus =
        matchRow.status &&
        ["completed", "scheduled", "forfeit", "cancelled"].includes(
          matchRow.status,
        )
          ? (matchRow.status as MatchStatusValue)
          : "completed";

      setUpdateMatchStatus(nextStatus);
      setUpdateMatchSeasonId(
        matchRow.season_id ? String(matchRow.season_id) : "",
      );
      setUpdateMatchDateLocal(matchRow.date_local || "");
      setUpdateMatchTimeLocal(matchRow.time_local || "");
      setUpdateMatchVenue(matchRow.venue || "");
      setUpdateMatchType(matchRow.type || "");
      setUpdateMatchTeam1Player1(
        typeof team1?.player_1_id === "number" ? String(team1.player_1_id) : "",
      );
      setUpdateMatchTeam1Player2(
        typeof team1?.player_2_id === "number" ? String(team1.player_2_id) : "",
      );
      setUpdateMatchTeam2Player1(
        typeof team2?.player_1_id === "number" ? String(team2.player_1_id) : "",
      );
      setUpdateMatchTeam2Player2(
        typeof team2?.player_2_id === "number" ? String(team2.player_2_id) : "",
      );

      const sets = setsRows ?? [];
      setUpdateSet1Team1(sets[0] ? String(sets[0].team_1_games) : "");
      setUpdateSet1Team2(sets[0] ? String(sets[0].team_2_games) : "");
      setUpdateSet2Team1(sets[1] ? String(sets[1].team_1_games) : "");
      setUpdateSet2Team2(sets[1] ? String(sets[1].team_2_games) : "");
      setUpdateSet3Team1(sets[2] ? String(sets[2].team_1_games) : "");
      setUpdateSet3Team2(sets[2] ? String(sets[2].team_2_games) : "");

      setLoadedMatchDetails({
        matchId,
        status: nextStatus,
        seasonId: matchRow.season_id,
        dateLocal: matchRow.date_local,
        timeLocal: matchRow.time_local,
        venue: matchRow.venue,
        type: matchRow.type,
        winnerTeam: matchRow.winner_team,
        team1SetsWon:
          typeof team1?.sets_won === "number" ? team1.sets_won : null,
        team2SetsWon:
          typeof team2?.sets_won === "number" ? team2.sets_won : null,
        team1: {
          player1:
            typeof team1?.player_1_id === "number"
              ? (playerMap.get(team1.player_1_id) ?? null)
              : null,
          player2:
            typeof team1?.player_2_id === "number"
              ? (playerMap.get(team1.player_2_id) ?? null)
              : null,
        },
        team2: {
          player1:
            typeof team2?.player_1_id === "number"
              ? (playerMap.get(team2.player_1_id) ?? null)
              : null,
          player2:
            typeof team2?.player_2_id === "number"
              ? (playerMap.get(team2.player_2_id) ?? null)
              : null,
        },
        preRatingsV3,
      });

      setUpdateMatchLoadingDetails(false);
    };

    void loadMatchDetails();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, updateMatchId]);

  const selectPlayerFromSearch = (player: Player) => {
    setActivePlayerTab("EDIT");
    setSelectedPlayer(player);
    setSearch(player.name || "");
    setSavePlayerError(null);
    setSavePlayerSuccess(null);
  };

  useEffect(() => {
    setEditName(selectedPlayer?.name || "");
    setEditNickname(selectedPlayer?.nickname || "");
    setEditImageLink(selectedPlayer?.image_link || "");
  }, [selectedPlayer]);

  const handleSavePlayer = async () => {
    if (!selectedPlayer) {
      return;
    }

    setSavingPlayer(true);
    setSavePlayerError(null);
    setSavePlayerSuccess(null);

    try {
      const updates = {
        name: editName.trim(),
        nickname: editNickname.trim(),
        image_link: editImageLink.trim() || null,
      };

      if (!updates.name || !updates.nickname) {
        setSavePlayerError("Name and nickname cannot be empty.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        setSavePlayerError("No active session found. Please sign in again.");
        return;
      }

      const response = await fetch(
        `/api/admin/players/${selectedPlayer.player_id}/update`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            name: updates.name,
            nickname: updates.nickname,
            imageLink: updates.image_link,
          }),
        },
      );

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        message?: string;
        player?: Player;
      };

      if (!response.ok) {
        const details = result.details?.join(" ");
        setSavePlayerError(
          details || result.error || "Failed to update player.",
        );
        return;
      }

      const updated = result.player;

      if (!updated) {
        setSavePlayerError("Player not found.");
        return;
      }

      setSelectedPlayer(updated);
      setPlayers((current) =>
        current.map((p) =>
          String(p.player_id) === String(updated.player_id) ? updated : p,
        ),
      );
      setSavePlayerSuccess(result.message || "Player updated successfully.");
    } catch {
      setSavePlayerError("Unexpected error while updating player.");
    } finally {
      setSavingPlayer(false);
    }
  };

  const handleCreatePlayer = async () => {
    setCreatingPlayer(true);
    setCreatePlayerError(null);
    setCreatePlayerSuccess(null);

    try {
      const payload = {
        name: createName.trim(),
        nickname: createNickname.trim(),
        image_link: createImageLink.trim() || null,
        initial_rating: createInitialRating.trim()
          ? Number(createInitialRating.trim())
          : null,
      };

      if (!payload.name || !payload.nickname) {
        setCreatePlayerError("Name and nickname cannot be empty.");
        return;
      }

      if (
        payload.initial_rating !== null &&
        (!Number.isFinite(payload.initial_rating) || payload.initial_rating < 0)
      ) {
        setCreatePlayerError("initial_rating must be a non-negative number.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        setCreatePlayerError("No active session found. Please sign in again.");
        return;
      }

      const response = await fetch("/api/admin/players/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: payload.name,
          nickname: payload.nickname,
          imageLink: payload.image_link,
          initialRating: payload.initial_rating,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        message?: string;
        player?: Player;
      };

      if (!response.ok) {
        const details = result.details?.join(" ");
        setCreatePlayerError(
          details || result.error || "Failed to create player.",
        );
        return;
      }

      const created = result.player;

      if (!created) {
        setCreatePlayerError("Player was not created.");
        return;
      }

      setPlayers((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSelectedPlayer(created);
      setSearch(created.name || "");
      setEditName(created.name || "");
      setEditNickname(created.nickname || "");
      setEditImageLink(created.image_link || "");
      setEditInitialRating(
        typeof created.initial_rating === "number"
          ? String(created.initial_rating)
          : "",
      );
      setCreateName("");
      setCreateNickname("");
      setCreateImageLink("");
      setCreateInitialRating("");
      setCreatePlayerSuccess(result.message || "Player created successfully.");
      setActivePlayerTab("EDIT");
    } catch {
      setCreatePlayerError("Unexpected error while creating player.");
    } finally {
      setCreatingPlayer(false);
    }
  };

  const handleCreateMatch = async () => {
    setCreatingMatch(true);
    setCreateMatchError(null);
    setCreateMatchSuccess(null);

    try {
      const selectedPlayerIds = [
        createMatchTeam1Player1,
        createMatchTeam1Player2,
        createMatchTeam2Player1,
        createMatchTeam2Player2,
      ];

      if (selectedPlayerIds.some((playerId) => !playerId)) {
        setCreateMatchError("All four player slots are required.");
        return;
      }

      if (new Set(selectedPlayerIds).size !== 4) {
        setCreateMatchError("All four players must be unique.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        setCreateMatchError("No active session found. Please sign in again.");
        return;
      }

      const response = await fetch("/api/admin/matches/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          seasonId: createMatchSeasonId
            ? Number.parseInt(createMatchSeasonId, 10)
            : null,
          dateLocal: createMatchDateLocal || null,
          timeLocal: createMatchTimeLocal || null,
          venue: createMatchVenue.trim() || null,
          type: createMatchType.trim() || null,
          team1: {
            player1Id: createMatchTeam1Player1,
            player2Id: createMatchTeam1Player2,
          },
          team2: {
            player1Id: createMatchTeam2Player1,
            player2Id: createMatchTeam2Player2,
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
        const details = result.details?.join(" ");
        setCreateMatchError(
          details || result.error || "Failed to create match.",
        );
        return;
      }

      setCreateMatchSeasonId(
        matchSeasons.length > 0 ? String(matchSeasons[0]) : "",
      );
      setCreateMatchDateLocal("");
      setCreateMatchTimeLocal("");
      setCreateMatchVenue("");
      setCreateMatchType("");
      setCreateMatchTeam1Player1("");
      setCreateMatchTeam1Player2("");
      setCreateMatchTeam2Player1("");
      setCreateMatchTeam2Player2("");
      setCreateMatchSuccess(
        result.message ||
          `Match #${result.match?.match_id ?? ""} created successfully.`,
      );
    } catch {
      setCreateMatchError("Unexpected error while creating match.");
    } finally {
      setCreatingMatch(false);
    }
  };

  const handleCompleteMatch = async () => {
    setCompletingMatch(true);
    setCompleteMatchError(null);
    setCompleteMatchSuccess(null);

    try {
      if (!completeMatchCalculated) {
        setCompleteMatchError(
          "Click Calculate Outcome first before completing the match.",
        );
        return;
      }

      if (!updateMatchRatingPreviewWithRows) {
        setCompleteMatchError(
          updateMatchRatingPreview?.error ||
            "Unable to complete. Please calculate outcome again.",
        );
        return;
      }

      const matchId = Number.parseInt(updateMatchId, 10);
      if (!Number.isInteger(matchId) || matchId <= 0) {
        setCompleteMatchError("match_id must be a positive integer.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        setCompleteMatchError("No active session found. Please sign in again.");
        return;
      }

      const rawSetPairs = [
        { team1: updateSet1Team1, team2: updateSet1Team2 },
        { team1: updateSet2Team1, team2: updateSet2Team2 },
        { team1: updateSet3Team1, team2: updateSet3Team2 },
      ];

      const sets: Array<{ team1Games: number; team2Games: number }> = [];
      for (const pair of rawSetPairs) {
        const t1 = pair.team1.trim();
        const t2 = pair.team2.trim();

        if (!t1 && !t2) {
          continue;
        }

        if (!t1 || !t2) {
          setCompleteMatchError("Each set row must have both team scores.");
          return;
        }

        const t1Games = Number.parseInt(t1, 10);
        const t2Games = Number.parseInt(t2, 10);
        if (
          !Number.isInteger(t1Games) ||
          !Number.isInteger(t2Games) ||
          t1Games < 0 ||
          t2Games < 0
        ) {
          setCompleteMatchError("Set scores must be whole numbers >= 0.");
          return;
        }

        sets.push({ team1Games: t1Games, team2Games: t2Games });
      }

      if (sets.length === 0) {
        setCompleteMatchError(
          "At least one set score is required for completed matches.",
        );
        return;
      }

      let team1SetsWon = 0;
      let team2SetsWon = 0;
      for (const set of sets) {
        if (set.team1Games > set.team2Games) team1SetsWon += 1;
        else team2SetsWon += 1;
      }
      if (team1SetsWon === team2SetsWon) {
        setCompleteMatchError(
          "Set scores must produce a clear winner (no tied sets won).",
        );
        return;
      }

      const payload: Record<string, unknown> = {
        status: "completed",
        sets,
      };

      const response = await fetch(`/api/admin/matches/${matchId}/update`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        message?: string;
      };

      if (!response.ok) {
        const details = result.details?.join(" ");
        setCompleteMatchError(
          details || result.error || "Failed to update match.",
        );
        return;
      }

      setUpdateSet1Team1("");
      setUpdateSet1Team2("");
      setUpdateSet2Team1("");
      setUpdateSet2Team2("");
      setUpdateSet3Team1("");
      setUpdateSet3Team2("");
      setCompleteMatchCalculated(false);
      setCompleteMatchSuccess(
        result.message || "Match completed successfully.",
      );
    } catch {
      setCompleteMatchError("Unexpected error while completing match.");
    } finally {
      setCompletingMatch(false);
    }
  };

  const handleUpdateMatch = async () => {
    setUpdatingMatch(true);
    setUpdateMatchError(null);
    setUpdateMatchSuccess(null);

    try {
      const matchId = Number.parseInt(updateMatchId, 10);
      if (!Number.isInteger(matchId) || matchId <= 0) {
        setUpdateMatchError("match_id must be a positive integer.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        setUpdateMatchError("No active session found. Please sign in again.");
        return;
      }

      const payload: Record<string, unknown> = {
        status: updateMatchStatus,
      };

      const participantInputs = [
        resolvedUpdateMatchTeam1Player1.trim(),
        resolvedUpdateMatchTeam1Player2.trim(),
        resolvedUpdateMatchTeam2Player1.trim(),
        resolvedUpdateMatchTeam2Player2.trim(),
      ];
      const hasAnyParticipantInput = participantInputs.some(Boolean);

      if (hasAnyParticipantInput) {
        if (participantInputs.some((value) => !value)) {
          setUpdateMatchError("All four participant player IDs are required.");
          return;
        }

        const parsedParticipantIds = participantInputs.map((value) =>
          Number.parseInt(value, 10),
        );

        if (
          parsedParticipantIds.some(
            (playerId) => !Number.isInteger(playerId) || playerId <= 0,
          )
        ) {
          setUpdateMatchError(
            "Participant player IDs must be positive integers.",
          );
          return;
        }

        if (new Set(parsedParticipantIds).size !== 4) {
          setUpdateMatchError("All four participants must be unique.");
          return;
        }

        const teamsResponse = await fetch(
          `/api/admin/matches/${matchId}/teams`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              team1: {
                player1Id: parsedParticipantIds[0],
                player2Id: parsedParticipantIds[1],
                setsWon: loadedMatchDetails?.team1SetsWon ?? null,
              },
              team2: {
                player1Id: parsedParticipantIds[2],
                player2Id: parsedParticipantIds[3],
                setsWon: loadedMatchDetails?.team2SetsWon ?? null,
              },
            }),
          },
        );

        const teamsResult = (await teamsResponse.json()) as {
          error?: string;
          details?: string[];
        };

        if (!teamsResponse.ok) {
          const details = teamsResult.details?.join(" ");
          setUpdateMatchError(
            details ||
              teamsResult.error ||
              "Failed to update match participants.",
          );
          return;
        }
      }

      if (updateMatchSeasonId.trim()) {
        const seasonId = Number.parseInt(updateMatchSeasonId.trim(), 10);
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
          setUpdateMatchError("season_id must be a positive integer.");
          return;
        }
        payload.seasonId = seasonId;
      }

      if (updateMatchDateLocal) payload.dateLocal = updateMatchDateLocal;
      if (updateMatchTimeLocal) payload.timeLocal = updateMatchTimeLocal;
      if (updateMatchVenue.trim()) payload.venue = updateMatchVenue.trim();
      if (updateMatchType.trim()) payload.type = updateMatchType.trim();

      const response = await fetch(`/api/admin/matches/${matchId}/update`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        error?: string;
        details?: string[];
        message?: string;
      };

      if (!response.ok) {
        const details = result.details?.join(" ");
        setUpdateMatchError(
          details || result.error || "Failed to update match.",
        );
        return;
      }

      setUpdateMatchSuccess(result.message || "Match updated successfully.");
    } catch {
      setUpdateMatchError("Unexpected error while updating match.");
    } finally {
      setUpdatingMatch(false);
    }
  };

  const getUpdateMatchRatingPreview = () => {
    if (!loadedMatchDetails) {
      return null;
    }

    const setPairs = [
      { t1: updateSet1Team1.trim(), t2: updateSet1Team2.trim() },
      { t1: updateSet2Team1.trim(), t2: updateSet2Team2.trim() },
      { t1: updateSet3Team1.trim(), t2: updateSet3Team2.trim() },
    ];

    const sets: Array<{ team1Games: number; team2Games: number }> = [];
    for (const pair of setPairs) {
      if (!pair.t1 && !pair.t2) {
        continue;
      }

      if (!pair.t1 || !pair.t2) {
        return { error: "Fill both team scores for each set row." };
      }

      const t1Games = Number.parseInt(pair.t1, 10);
      const t2Games = Number.parseInt(pair.t2, 10);
      if (
        !Number.isInteger(t1Games) ||
        !Number.isInteger(t2Games) ||
        t1Games < 0 ||
        t2Games < 0 ||
        t1Games === t2Games
      ) {
        return { error: "Set scores must be valid and cannot be tied." };
      }

      sets.push({ team1Games: t1Games, team2Games: t2Games });
    }

    if (sets.length === 0) {
      return { error: "Enter at least one set to preview rating impact." };
    }

    const players = [
      loadedMatchDetails.team1.player1,
      loadedMatchDetails.team1.player2,
      loadedMatchDetails.team2.player1,
      loadedMatchDetails.team2.player2,
    ];

    if (players.some((p) => !p)) {
      return { error: "Match teams are incomplete. Cannot preview ratings." };
    }

    const missingPre = (players as MatchPlayerSummary[]).find(
      (player) => loadedMatchDetails.preRatingsV3[player.player_id] == null,
    );

    if (missingPre) {
      return {
        error:
          "Missing prior rating for one or more players. Rating preview unavailable.",
      };
    }

    const [t1p1, t1p2, t2p1, t2p2] = players as MatchPlayerSummary[];

    const ELO_VAR_1 = 2.67;
    const UTR_VAR_1 = 0.15;
    const UTR_VAR_2 = 1.5;
    const UTR_VAR_3 = 0.5;
    const UTR_VAR_4 = 0.08;
    const UTR_VAR_5 = 2;
    const GAMES_NORMALIZATION = 1 - 14 / 32;

    const pre1 = loadedMatchDetails.preRatingsV3[t1p1.player_id] as number;
    const pre2 = loadedMatchDetails.preRatingsV3[t1p2.player_id] as number;
    const pre3 = loadedMatchDetails.preRatingsV3[t2p1.player_id] as number;
    const pre4 = loadedMatchDetails.preRatingsV3[t2p2.player_id] as number;

    let team1SetsWon = 0;
    let team2SetsWon = 0;
    for (const set of sets) {
      if (set.team1Games > set.team2Games) team1SetsWon += 1;
      else team2SetsWon += 1;
    }
    const winnerTeam =
      team1SetsWon > team2SetsWon ? 1 : team2SetsWon > team1SetsWon ? 2 : null;
    if (!winnerTeam) {
      return {
        error: "Set scores must produce a clear winner to preview ratings.",
      };
    }

    const avg1 = (pre1 + pre2) / 2;
    const avg2 = (pre3 + pre4) / 2;

    const elo1 = Math.pow(10, avg1 / ELO_VAR_1);
    const elo2 = Math.pow(10, avg2 / ELO_VAR_1);
    const ewp1 = elo1 / (elo1 + elo2);
    const ewp2 = elo2 / (elo1 + elo2);

    const totalGames1 = sets.reduce((sum, s) => sum + s.team1Games, 0);
    const totalGames2 = sets.reduce((sum, s) => sum + s.team2Games, 0);
    const totalGames = totalGames1 + totalGames2;
    const actualPerf1 = totalGames > 0 ? totalGames1 / totalGames : 0;
    const actualPerf2 = totalGames > 0 ? totalGames2 / totalGames : 0;

    const calcReward = (actualPerf: number, ewp: number) => {
      if (actualPerf <= ewp) return 0;
      const ratio = (actualPerf - ewp) / GAMES_NORMALIZATION;
      const raw =
        Math.pow(ratio, UTR_VAR_5) * (UTR_VAR_2 - UTR_VAR_1) + UTR_VAR_1;
      return Math.min(raw, UTR_VAR_3);
    };

    let delta1 = 0;
    let delta2 = 0;
    if (winnerTeam === 1) {
      const reward = Math.max(UTR_VAR_4, calcReward(actualPerf1, ewp1));
      delta1 = reward;
      delta2 = -reward;
    } else if (winnerTeam === 2) {
      const reward = Math.max(UTR_VAR_4, calcReward(actualPerf2, ewp2));
      delta2 = reward;
      delta1 = -reward;
    }

    return {
      winnerTeam,
      rows: [
        {
          player: t1p1,
          team: 1,
          before: pre1,
          after: pre1 + delta1,
          delta: delta1,
        },
        {
          player: t1p2,
          team: 1,
          before: pre2,
          after: pre2 + delta1,
          delta: delta1,
        },
        {
          player: t2p1,
          team: 2,
          before: pre3,
          after: pre3 + delta2,
          delta: delta2,
        },
        {
          player: t2p2,
          team: 2,
          before: pre4,
          after: pre4 + delta2,
          delta: delta2,
        },
      ],
    };
  };

  const updateMatchRatingPreview = getUpdateMatchRatingPreview();
  const updateMatchRatingPreviewWithRows =
    updateMatchRatingPreview && "rows" in updateMatchRatingPreview
      ? updateMatchRatingPreview
      : null;
  const updateMatchRatingPreviewRows =
    updateMatchRatingPreviewWithRows?.rows ?? [];
  const resolvedUpdateMatchTeam1Player1 =
    updateMatchTeam1Player1 ||
    (loadedMatchDetails?.team1.player1
      ? String(loadedMatchDetails.team1.player1.player_id)
      : "");
  const resolvedUpdateMatchTeam1Player2 =
    updateMatchTeam1Player2 ||
    (loadedMatchDetails?.team1.player2
      ? String(loadedMatchDetails.team1.player2.player_id)
      : "");
  const resolvedUpdateMatchTeam2Player1 =
    updateMatchTeam2Player1 ||
    (loadedMatchDetails?.team2.player1
      ? String(loadedMatchDetails.team2.player1.player_id)
      : "");
  const resolvedUpdateMatchTeam2Player2 =
    updateMatchTeam2Player2 ||
    (loadedMatchDetails?.team2.player2
      ? String(loadedMatchDetails.team2.player2.player_id)
      : "");
  const completeMatchWinnerTeamDisplay =
    (completeMatchCalculated
      ? updateMatchRatingPreviewWithRows?.winnerTeam
      : null) ?? loadedMatchDetails?.winnerTeam;
  const handleCalculateOutcome = () => {
    setCompleteMatchError(null);
    setCompleteMatchSuccess(null);

    if (!loadedMatchDetails) {
      setCompleteMatchCalculated(false);
      setCompleteMatchError("Select a scheduled match first.");
      return;
    }

    if (updateMatchRatingPreview?.error || !updateMatchRatingPreviewWithRows) {
      setCompleteMatchCalculated(false);
      setCompleteMatchError(
        updateMatchRatingPreview?.error ||
          "Unable to calculate outcome from current set scores.",
      );
      return;
    }

    setCompleteMatchCalculated(true);
  };

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/admin`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setEmail(null);
    setAvatarUrl(null);
    setIsAdmin(false);
  };

  return (
    <>
      <BackToHome />
      <div className="p-6 max-w-[96rem] mx-auto">
        <div className="w-full md:w-[24rem] md:max-w-[24rem] mx-auto mb-6">
          <h1 className="text-2xl font-bold mb-2">Admin</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Google sign-in is required to access this page.
          </p>
        </div>

        {loading ? (
          <div
            className={`${AUTH_BOX_CLASS} flex items-center text-sm text-slate-600 dark:text-slate-300`}
          >
            Checking authentication...
          </div>
        ) : email ? (
          <div className="space-y-4">
            <div className={`${AUTH_BOX_CLASS} flex flex-col justify-between`}>
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Google profile"
                    className="h-10 w-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800" />
                )}
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Signed in as
                </div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {email}
                </div>
              </div>

              <div
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  isAdmin
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
                }`}
              >
                Admin: {isAdmin ? "Yes" : "No"}
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                Sign out
              </button>
            </div>

            {isAdmin ? (
              <div className="w-full xl:max-w-[88rem] mx-auto rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 xl:p-6">
                <div className="space-y-4">
                  <div className="mx-auto w-full max-w-md text-center">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Admin Tools
                    </h2>
                  </div>

                  <div className="w-full flex justify-center">
                    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/60">
                      {ADMIN_PLAYER_TABS.map((tab) => {
                        const active = activePlayerTab === tab.value;
                        return (
                          <button
                            key={tab.value}
                            type="button"
                            onClick={() => {
                              setActivePlayerTab(tab.value);
                              setSavePlayerError(null);
                              setSavePlayerSuccess(null);
                              setCreatePlayerError(null);
                              setCreatePlayerSuccess(null);
                              setCreateMatchError(null);
                              setCreateMatchSuccess(null);
                              setCompleteMatchError(null);
                              setCompleteMatchSuccess(null);
                              setCompleteMatchCalculated(false);
                              setUpdateMatchError(null);
                              setUpdateMatchSuccess(null);
                            }}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                              active
                                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {activePlayerTab === "EDIT" ? (
                    <div className="space-y-4">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Player Lookup
                      </h3>

                      <PlayerSearchBox
                        value={search}
                        suggestions={filtered}
                        maxSuggestions={7}
                        selectedPlayerName={selectedPlayer?.name || null}
                        onValueChange={setSearch}
                        onSelectPlayer={selectPlayerFromSearch}
                        onClear={() => {
                          setSearch("");
                          setSelectedPlayer(null);
                          setSavePlayerError(null);
                          setSavePlayerSuccess(null);
                        }}
                      />

                      {playersLoading && (
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Loading players...
                        </div>
                      )}

                      {playersError && (
                        <div className="text-sm text-rose-600 dark:text-rose-400">
                          Error loading players: {playersError}
                        </div>
                      )}

                      {selectedPlayer && (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
                          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            Player Details
                          </div>
                          <div className="grid gap-4 xl:grid-cols-2">
                            <div>
                              <label className="text-slate-500 dark:text-slate-400">
                                name:
                              </label>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="text-slate-500 dark:text-slate-400">
                                nickname:
                              </label>
                              <input
                                type="text"
                                value={editNickname}
                                onChange={(e) =>
                                  setEditNickname(e.target.value)
                                }
                                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              />
                            </div>
                            <div className="xl:col-span-2">
                              <label className="text-slate-500 dark:text-slate-400">
                                image_link:
                              </label>
                              <input
                                type="text"
                                value={editImageLink}
                                onChange={(e) =>
                                  setEditImageLink(e.target.value)
                                }
                                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                                placeholder="https://..."
                              />
                            </div>
                          </div>

                          <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 grid gap-3 xl:grid-cols-4">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                player_id:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                                {selectedPlayer.player_id}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                initial_rating:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                                {typeof selectedPlayer.initial_rating ===
                                "number"
                                  ? selectedPlayer.initial_rating
                                  : "N/A"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                created_at:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                                {selectedPlayer.created_at || "N/A"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                updated_at:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100 break-all">
                                {selectedPlayer.updated_at || "N/A"}
                              </span>
                            </div>
                          </div>

                          {savePlayerError && (
                            <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
                              {savePlayerError}
                            </div>
                          )}

                          {savePlayerSuccess && (
                            <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
                              {savePlayerSuccess}
                            </div>
                          )}

                          <div>
                            <button
                              type="button"
                              onClick={handleSavePlayer}
                              disabled={savingPlayer}
                              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {savingPlayer ? "Saving..." : "Save Player"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : activePlayerTab === "SCHEDULE_MATCH" ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Schedule a Match
                      </div>

                      <div className="grid gap-4 xl:grid-cols-3">
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="create-match-season-id"
                          >
                            season_id:
                          </label>
                          <input
                            id="create-match-season-id"
                            type="number"
                            value={createMatchSeasonId}
                            onChange={(e) =>
                              setCreateMatchSeasonId(e.target.value)
                            }
                            list="create-match-season-options"
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder={
                              matchSeasonsLoading
                                ? "Loading seasons..."
                                : "Enter season id"
                            }
                          />
                          <datalist id="create-match-season-options">
                            {matchSeasons
                              .slice()
                              .sort((a, b) => b - a)
                              .map((season) => (
                                <option key={season} value={String(season)} />
                              ))}
                          </datalist>
                        </div>
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="create-match-date-local"
                          >
                            date_local:
                          </label>
                          <input
                            id="create-match-date-local"
                            type="date"
                            value={createMatchDateLocal}
                            onChange={(e) =>
                              setCreateMatchDateLocal(e.target.value)
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="create-match-time-local"
                          >
                            time_local:
                          </label>
                          <input
                            id="create-match-time-local"
                            type="time"
                            value={createMatchTimeLocal}
                            onChange={(e) =>
                              setCreateMatchTimeLocal(e.target.value)
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="create-match-venue"
                          >
                            venue:
                          </label>
                          <select
                            id="create-match-venue"
                            value={createMatchVenue}
                            onChange={(e) =>
                              setCreateMatchVenue(e.target.value)
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          >
                            <option value="">Select venue</option>
                            {SCHEDULE_MATCH_VENUE_OPTIONS.map((venue) => (
                              <option key={venue} value={venue}>
                                {venue}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="create-match-type"
                          >
                            type:
                          </label>
                          <select
                            id="create-match-type"
                            value={createMatchType}
                            onChange={(e) => setCreateMatchType(e.target.value)}
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          >
                            <option value="">Select type</option>
                            {SCHEDULE_MATCH_TYPE_OPTIONS.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {matchSeasonsError && (
                        <div className="text-sm text-rose-600 dark:text-rose-400">
                          Error loading seasons: {matchSeasonsError}
                        </div>
                      )}

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            Team 1
                          </div>
                          <div>
                            <label
                              className="text-slate-500 dark:text-slate-400"
                              htmlFor="create-match-team1-player1"
                            >
                              player_1_id:
                            </label>
                            <select
                              id="create-match-team1-player1"
                              value={createMatchTeam1Player1}
                              onChange={(e) =>
                                setCreateMatchTeam1Player1(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Select player</option>
                              {players.map((player) => (
                                <option
                                  key={player.player_id}
                                  value={player.player_id}
                                >
                                  {player.name} ({player.nickname})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              className="text-slate-500 dark:text-slate-400"
                              htmlFor="create-match-team1-player2"
                            >
                              player_2_id:
                            </label>
                            <select
                              id="create-match-team1-player2"
                              value={createMatchTeam1Player2}
                              onChange={(e) =>
                                setCreateMatchTeam1Player2(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Select player</option>
                              {players.map((player) => (
                                <option
                                  key={player.player_id}
                                  value={player.player_id}
                                >
                                  {player.name} ({player.nickname})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            Team 2
                          </div>
                          <div>
                            <label
                              className="text-slate-500 dark:text-slate-400"
                              htmlFor="create-match-team2-player1"
                            >
                              player_1_id:
                            </label>
                            <select
                              id="create-match-team2-player1"
                              value={createMatchTeam2Player1}
                              onChange={(e) =>
                                setCreateMatchTeam2Player1(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Select player</option>
                              {players.map((player) => (
                                <option
                                  key={player.player_id}
                                  value={player.player_id}
                                >
                                  {player.name} ({player.nickname})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              className="text-slate-500 dark:text-slate-400"
                              htmlFor="create-match-team2-player2"
                            >
                              player_2_id:
                            </label>
                            <select
                              id="create-match-team2-player2"
                              value={createMatchTeam2Player2}
                              onChange={(e) =>
                                setCreateMatchTeam2Player2(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Select player</option>
                              {players.map((player) => (
                                <option
                                  key={player.player_id}
                                  value={player.player_id}
                                >
                                  {player.name} ({player.nickname})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {playersLoading && (
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Loading players...
                        </div>
                      )}

                      {playersError && (
                        <div className="text-sm text-rose-600 dark:text-rose-400">
                          Error loading players: {playersError}
                        </div>
                      )}

                      {createMatchError && (
                        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
                          {createMatchError}
                        </div>
                      )}

                      {createMatchSuccess && (
                        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
                          {createMatchSuccess}
                        </div>
                      )}

                      <div>
                        <button
                          type="button"
                          onClick={handleCreateMatch}
                          disabled={creatingMatch || playersLoading}
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {creatingMatch ? "Scheduling..." : "Schedule Match"}
                        </button>
                      </div>
                    </div>
                  ) : activePlayerTab === "COMPLETE_MATCH" ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Complete Match
                      </div>

                      <div className="rounded bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-amber-800 dark:text-amber-300">
                        Note that rating changes are dependent on when matches
                        are inputted as completed. Make sure to input matches
                        chronologicaly especially when updating matches with
                        similar players.
                      </div>

                      <div>
                        <label
                          className="text-slate-500 dark:text-slate-400"
                          htmlFor="complete-match-select"
                        >
                          Scheduled match:
                        </label>
                        <select
                          id="complete-match-select"
                          value={updateMatchId}
                          onChange={(e) => {
                            setUpdateMatchId(e.target.value);
                            setCompleteMatchCalculated(false);
                          }}
                          className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                        >
                          <option value="">Select a scheduled match</option>
                          {scheduledMatches.map((match) => {
                            const datePart = match.date_local || "No date";
                            const timePart = match.time_local || "No time";
                            const typePart = match.type || "No type";
                            const venuePart = match.venue || "No venue";
                            const team1 = `${
                              (match.team1Player1Id &&
                                playerNameById.get(
                                  String(match.team1Player1Id),
                                )) ||
                              (match.team1Player1Id
                                ? `#${match.team1Player1Id}`
                                : "?")
                            } / ${
                              (match.team1Player2Id &&
                                playerNameById.get(
                                  String(match.team1Player2Id),
                                )) ||
                              (match.team1Player2Id
                                ? `#${match.team1Player2Id}`
                                : "?")
                            }`;
                            const team2 = `${
                              (match.team2Player1Id &&
                                playerNameById.get(
                                  String(match.team2Player1Id),
                                )) ||
                              (match.team2Player1Id
                                ? `#${match.team2Player1Id}`
                                : "?")
                            } / ${
                              (match.team2Player2Id &&
                                playerNameById.get(
                                  String(match.team2Player2Id),
                                )) ||
                              (match.team2Player2Id
                                ? `#${match.team2Player2Id}`
                                : "?")
                            }`;

                            return (
                              <option
                                key={match.match_id}
                                value={String(match.match_id)}
                              >
                                #{match.match_id} - {team1} vs {team2} -{" "}
                                {datePart} {timePart} - {typePart} - {venuePart}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {scheduledMatchesLoading && (
                        <div className="rounded bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-slate-600 dark:text-slate-300">
                          Loading scheduled matches...
                        </div>
                      )}

                      {scheduledMatchesError && (
                        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-rose-700 dark:text-rose-300">
                          {scheduledMatchesError}
                        </div>
                      )}

                      {!scheduledMatchesLoading &&
                        !scheduledMatchesError &&
                        scheduledMatches.length === 0 && (
                          <div className="rounded bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-slate-600 dark:text-slate-300">
                            No scheduled matches found.
                          </div>
                        )}

                      {updateMatchLoadingDetails && (
                        <div className="rounded bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-slate-600 dark:text-slate-300">
                          Loading match details...
                        </div>
                      )}

                      {updateMatchDetailsError && (
                        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-rose-700 dark:text-rose-300">
                          {updateMatchDetailsError}
                        </div>
                      )}

                      {loadedMatchDetails && (
                        <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            Match Details
                          </div>
                          <div className="grid gap-3 xl:grid-cols-4 text-sm">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                current status:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {loadedMatchDetails.status}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                winner_team:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {completeMatchWinnerTeamDisplay ?? "N/A"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                team 1:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {loadedMatchDetails.team1.player1?.nickname ||
                                  loadedMatchDetails.team1.player1?.name ||
                                  "?"}
                                {" / "}
                                {loadedMatchDetails.team1.player2?.nickname ||
                                  loadedMatchDetails.team1.player2?.name ||
                                  "?"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                team 2:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {loadedMatchDetails.team2.player1?.nickname ||
                                  loadedMatchDetails.team2.player1?.name ||
                                  "?"}
                                {" / "}
                                {loadedMatchDetails.team2.player2?.nickname ||
                                  loadedMatchDetails.team2.player2?.name ||
                                  "?"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          Set Scores
                        </div>

                        <div className="grid gap-3 xl:grid-cols-3">
                          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Set 1
                          </div>
                          <input
                            type="number"
                            value={updateSet1Team1}
                            onChange={(e) => {
                              setUpdateSet1Team1(e.target.value);
                              setCompleteMatchCalculated(false);
                            }}
                            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="Team 1 games"
                          />
                          <input
                            type="number"
                            value={updateSet1Team2}
                            onChange={(e) => {
                              setUpdateSet1Team2(e.target.value);
                              setCompleteMatchCalculated(false);
                            }}
                            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="Team 2 games"
                          />

                          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Set 2
                          </div>
                          <input
                            type="number"
                            value={updateSet2Team1}
                            onChange={(e) => {
                              setUpdateSet2Team1(e.target.value);
                              setCompleteMatchCalculated(false);
                            }}
                            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="Team 1 games"
                          />
                          <input
                            type="number"
                            value={updateSet2Team2}
                            onChange={(e) => {
                              setUpdateSet2Team2(e.target.value);
                              setCompleteMatchCalculated(false);
                            }}
                            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="Team 2 games"
                          />

                          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Set 3 (optional)
                          </div>
                          <input
                            type="number"
                            value={updateSet3Team1}
                            onChange={(e) => {
                              setUpdateSet3Team1(e.target.value);
                              setCompleteMatchCalculated(false);
                            }}
                            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="Team 1 games"
                          />
                          <input
                            type="number"
                            value={updateSet3Team2}
                            onChange={(e) => {
                              setUpdateSet3Team2(e.target.value);
                              setCompleteMatchCalculated(false);
                            }}
                            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="Team 2 games"
                          />
                        </div>
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={handleCalculateOutcome}
                          disabled={!loadedMatchDetails}
                          className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Calculate Outcome
                        </button>
                      </div>

                      <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          Rating Effect Preview (v3)
                        </div>

                        {!completeMatchCalculated ? (
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            Click Calculate Outcome to preview winner and rating
                            changes.
                          </div>
                        ) : !loadedMatchDetails ? (
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            Enter a valid match_id to preview ratings.
                          </div>
                        ) : updateMatchRatingPreview?.error ? (
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            {updateMatchRatingPreview.error}
                          </div>
                        ) : updateMatchRatingPreviewWithRows ? (
                          <div className="space-y-2">
                            <div className="text-sm text-slate-600 dark:text-slate-300">
                              Winner preview: Team{" "}
                              {updateMatchRatingPreviewWithRows.winnerTeam}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-slate-500 dark:text-slate-400">
                                    <th className="py-1 pr-3">Player</th>
                                    <th className="py-1 pr-3">Team</th>
                                    <th className="py-1 pr-3">Before</th>
                                    <th className="py-1 pr-3">After</th>
                                    <th className="py-1">Delta</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {updateMatchRatingPreviewRows.map((row) => (
                                    <tr key={row.player.player_id}>
                                      <td className="py-1 pr-3 text-slate-900 dark:text-slate-100">
                                        {row.player.nickname ||
                                          row.player.name ||
                                          row.player.player_id}
                                      </td>
                                      <td className="py-1 pr-3 text-slate-700 dark:text-slate-300">
                                        {row.team}
                                      </td>
                                      <td className="py-1 pr-3 text-slate-700 dark:text-slate-300">
                                        {row.before.toFixed(4)}
                                      </td>
                                      <td className="py-1 pr-3 text-slate-900 dark:text-slate-100">
                                        {row.after.toFixed(4)}
                                      </td>
                                      <td
                                        className={`py-1 ${
                                          row.delta >= 0
                                            ? "text-emerald-700 dark:text-emerald-300"
                                            : "text-rose-700 dark:text-rose-300"
                                        }`}
                                      >
                                        {row.delta >= 0 ? "+" : ""}
                                        {row.delta.toFixed(4)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {completeMatchError && (
                        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
                          {completeMatchError}
                        </div>
                      )}

                      {completeMatchSuccess && (
                        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
                          {completeMatchSuccess}
                        </div>
                      )}

                      <div>
                        <button
                          type="button"
                          onClick={handleCompleteMatch}
                          disabled={
                            completingMatch ||
                            !completeMatchCalculated ||
                            !updateMatchRatingPreviewWithRows
                          }
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {completingMatch ? "Completing..." : "Complete Match"}
                        </button>
                      </div>
                    </div>
                  ) : activePlayerTab === "UPDATE_MATCH" ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Update Match
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="update-match-id"
                          >
                            match_id:
                          </label>
                          <input
                            id="update-match-id"
                            type="number"
                            value={updateMatchId}
                            onChange={(e) => setUpdateMatchId(e.target.value)}
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="e.g. 15"
                          />
                        </div>

                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="update-match-status"
                          >
                            status:
                          </label>
                          <select
                            id="update-match-status"
                            value={updateMatchStatus}
                            onChange={(e) =>
                              setUpdateMatchStatus(
                                e.target.value as MatchStatusValue,
                              )
                            }
                            disabled={updateMatchLoadingDetails}
                            className={`mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-slate-900 dark:text-slate-100 ${
                              updateMatchLoadingDetails
                                ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                                : "bg-white dark:bg-slate-900"
                            }`}
                          >
                            {updateMatchStatus === "completed" && (
                              <option value="completed" disabled>
                                completed (set via Complete Match tab)
                              </option>
                            )}
                            {UPDATE_MATCH_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {updateMatchLoadingDetails && (
                        <div className="rounded bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-slate-600 dark:text-slate-300">
                          Loading match details...
                        </div>
                      )}

                      {updateMatchLoadingDetails && (
                        <div className="rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/60 px-3 py-2 text-slate-600 dark:text-slate-300">
                          Fields below are temporarily locked while match
                          details load.
                        </div>
                      )}

                      {updateMatchDetailsError && (
                        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-rose-700 dark:text-rose-300">
                          {updateMatchDetailsError}
                        </div>
                      )}

                      {loadedMatchDetails && (
                        <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            Match Details
                          </div>
                          <div className="grid gap-3 xl:grid-cols-4 text-sm">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                current status:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {loadedMatchDetails.status}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                winner_team:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {loadedMatchDetails.winnerTeam ?? "N/A"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                team 1:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {loadedMatchDetails.team1.player1?.nickname ||
                                  loadedMatchDetails.team1.player1?.name ||
                                  "?"}
                                {" / "}
                                {loadedMatchDetails.team1.player2?.nickname ||
                                  loadedMatchDetails.team1.player2?.name ||
                                  "?"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                team 2:
                              </span>{" "}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {loadedMatchDetails.team2.player1?.nickname ||
                                  loadedMatchDetails.team2.player1?.name ||
                                  "?"}
                                {" / "}
                                {loadedMatchDetails.team2.player2?.nickname ||
                                  loadedMatchDetails.team2.player2?.name ||
                                  "?"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <fieldset
                        disabled={updateMatchLoadingDetails}
                        className={`rounded-md p-3 space-y-3 transition-opacity ${
                          updateMatchLoadingDetails
                            ? "bg-slate-100 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-600 opacity-60"
                            : "bg-slate-50 dark:bg-slate-800/40"
                        }`}
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          Update-able Match Details
                        </div>

                        <div className="grid gap-4 xl:grid-cols-3">
                          <div>
                            <label
                              className="text-slate-500 dark:text-slate-400"
                              htmlFor="update-match-season-id"
                            >
                              season_id:
                            </label>
                            <select
                              id="update-match-season-id"
                              value={updateMatchSeasonId}
                              onChange={(e) =>
                                setUpdateMatchSeasonId(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Keep existing</option>
                              {matchSeasons
                                .slice()
                                .sort((a, b) => b - a)
                                .map((season) => (
                                  <option key={season} value={String(season)}>
                                    {season}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div>
                            <label
                              className="text-slate-500 dark:text-slate-400"
                              htmlFor="update-match-date-local"
                            >
                              date_local:
                            </label>
                            <input
                              id="update-match-date-local"
                              type="date"
                              value={updateMatchDateLocal}
                              onChange={(e) =>
                                setUpdateMatchDateLocal(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label
                              className="text-slate-500 dark:text-slate-400"
                              htmlFor="update-match-time-local"
                            >
                              time_local:
                            </label>
                            <input
                              id="update-match-time-local"
                              type="time"
                              value={updateMatchTimeLocal}
                              onChange={(e) =>
                                setUpdateMatchTimeLocal(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label
                              className="text-slate-500 dark:text-slate-400"
                              htmlFor="update-match-type"
                            >
                              type:
                            </label>
                            <select
                              id="update-match-type"
                              value={updateMatchType}
                              onChange={(e) =>
                                setUpdateMatchType(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Keep existing</option>
                              {SCHEDULE_MATCH_TYPE_OPTIONS.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="xl:col-span-2">
                            <label
                              className="text-slate-500 dark:text-slate-400"
                              htmlFor="update-match-venue"
                            >
                              venue:
                            </label>
                            <select
                              id="update-match-venue"
                              value={updateMatchVenue}
                              onChange={(e) =>
                                setUpdateMatchVenue(e.target.value)
                              }
                              className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            >
                              <option value="">Keep existing</option>
                              {SCHEDULE_MATCH_VENUE_OPTIONS.map((venue) => (
                                <option key={venue} value={venue}>
                                  {venue}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                          <div className="rounded-md bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              Team 1 Participants
                            </div>
                            <div>
                              <label
                                className="text-slate-500 dark:text-slate-400"
                                htmlFor="update-match-team1-player1"
                              >
                                player_1_id:
                              </label>
                              <select
                                id="update-match-team1-player1"
                                value={resolvedUpdateMatchTeam1Player1}
                                onChange={(e) =>
                                  setUpdateMatchTeam1Player1(e.target.value)
                                }
                                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              >
                                <option value="">Select player</option>
                                {players.map((player) => (
                                  <option
                                    key={player.player_id}
                                    value={player.player_id}
                                  >
                                    {player.name} ({player.nickname})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label
                                className="text-slate-500 dark:text-slate-400"
                                htmlFor="update-match-team1-player2"
                              >
                                player_2_id:
                              </label>
                              <select
                                id="update-match-team1-player2"
                                value={resolvedUpdateMatchTeam1Player2}
                                onChange={(e) =>
                                  setUpdateMatchTeam1Player2(e.target.value)
                                }
                                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              >
                                <option value="">Select player</option>
                                {players.map((player) => (
                                  <option
                                    key={player.player_id}
                                    value={player.player_id}
                                  >
                                    {player.name} ({player.nickname})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="rounded-md bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              Team 2 Participants
                            </div>
                            <div>
                              <label
                                className="text-slate-500 dark:text-slate-400"
                                htmlFor="update-match-team2-player1"
                              >
                                player_1_id:
                              </label>
                              <select
                                id="update-match-team2-player1"
                                value={resolvedUpdateMatchTeam2Player1}
                                onChange={(e) =>
                                  setUpdateMatchTeam2Player1(e.target.value)
                                }
                                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              >
                                <option value="">Select player</option>
                                {players.map((player) => (
                                  <option
                                    key={player.player_id}
                                    value={player.player_id}
                                  >
                                    {player.name} ({player.nickname})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label
                                className="text-slate-500 dark:text-slate-400"
                                htmlFor="update-match-team2-player2"
                              >
                                player_2_id:
                              </label>
                              <select
                                id="update-match-team2-player2"
                                value={resolvedUpdateMatchTeam2Player2}
                                onChange={(e) =>
                                  setUpdateMatchTeam2Player2(e.target.value)
                                }
                                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                              >
                                <option value="">Select player</option>
                                {players.map((player) => (
                                  <option
                                    key={player.player_id}
                                    value={player.player_id}
                                  >
                                    {player.name} ({player.nickname})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </fieldset>

                      {updateMatchError && (
                        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
                          {updateMatchError}
                        </div>
                      )}

                      {updateMatchSuccess && (
                        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
                          {updateMatchSuccess}
                        </div>
                      )}

                      <div>
                        <button
                          type="button"
                          onClick={handleUpdateMatch}
                          disabled={updatingMatch || updateMatchLoadingDetails}
                          className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {updatingMatch ? "Updating..." : "Update Match"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Create New Player
                      </div>
                      <div className="grid gap-4 xl:grid-cols-2">
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="create-player-name"
                          >
                            name:
                          </label>
                          <input
                            id="create-player-name"
                            type="text"
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="create-player-nickname"
                          >
                            nickname:
                          </label>
                          <input
                            id="create-player-nickname"
                            type="text"
                            value={createNickname}
                            onChange={(e) => setCreateNickname(e.target.value)}
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div className="xl:col-span-2">
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="create-player-image-link"
                          >
                            image_link:
                          </label>
                          <input
                            id="create-player-image-link"
                            type="text"
                            value={createImageLink}
                            onChange={(e) => setCreateImageLink(e.target.value)}
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="https://..."
                          />
                        </div>
                        <div>
                          <label
                            className="text-slate-500 dark:text-slate-400"
                            htmlFor="create-player-initial-rating"
                          >
                            initial_rating:
                          </label>
                          <input
                            id="create-player-initial-rating"
                            type="number"
                            step="0.0001"
                            min="0"
                            value={createInitialRating}
                            onChange={(e) =>
                              setCreateInitialRating(e.target.value)
                            }
                            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                            placeholder="e.g. 3.5"
                          />
                        </div>
                      </div>

                      {createPlayerError && (
                        <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2 text-rose-700 dark:text-rose-300">
                          {createPlayerError}
                        </div>
                      )}

                      {createPlayerSuccess && (
                        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
                          {createPlayerSuccess}
                        </div>
                      )}

                      <div>
                        <button
                          type="button"
                          onClick={handleCreatePlayer}
                          disabled={creatingPlayer}
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {creatingPlayer ? "Creating..." : "Create Player"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/10 p-4 text-sm text-rose-700 dark:text-rose-300">
                You are authenticated but not authorized to use admin tools.
              </div>
            )}
          </div>
        ) : (
          <div className={`${AUTH_BOX_CLASS} flex flex-col justify-between`}>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              You are not signed in.
            </div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Continue with Google
            </button>
          </div>
        )}
      </div>
    </>
  );
}
