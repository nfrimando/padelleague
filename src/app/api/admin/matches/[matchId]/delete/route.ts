import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import { reanchorPlayerChainsAfter } from "@/lib/ratings/reanchorChain";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId: rawMatchId } = await params;
  const matchId = normalizeRequiredPositiveInteger(rawMatchId);

  if (matchId === null) {
    return NextResponse.json(
      { error: "matchId must be a positive integer." },
      { status: 400 },
    );
  }

  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) {
    return authResult.response;
  }
  const { supabase } = authResult;

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("match_id,status,result_recorded_at")
    .eq("match_id", matchId)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json(
      { error: matchError.message || "Failed to load match." },
      { status: 500 },
    );
  }
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  if (match.status === "completed") {
    return NextResponse.json(
      {
        error:
          "Completed matches cannot be deleted. Change the status first if needed.",
      },
      { status: 400 },
    );
  }

  // Capture who played before the teams row goes away — deleting this match's ratings pulls its
  // ledger event out of their chains, and everything they played afterwards has to be re-anchored.
  const { data: teamRows, error: teamRowsError } = await supabase
    .from("match_teams")
    .select("player_1_id,player_2_id")
    .eq("match_id", matchId);
  if (teamRowsError) {
    return NextResponse.json(
      { error: teamRowsError.message || "Failed to load match teams." },
      { status: 500 },
    );
  }
  const affectedPlayerIds = (teamRows ?? []).flatMap((team) =>
    [team.player_1_id, team.player_2_id].filter(
      (id): id is number => typeof id === "number",
    ),
  );
  const pivotAt = (match.result_recorded_at as string | null) ?? null;

  const { error: deleteRatingsError } = await supabase
    .from("match_player_ratings")
    .delete()
    .eq("match_id", matchId);
  if (deleteRatingsError) {
    return NextResponse.json(
      { error: deleteRatingsError.message || "Failed to delete match ratings." },
      { status: 500 },
    );
  }

  const { error: deletePredictionsError } = await supabase
    .from("predictions")
    .delete()
    .eq("match_id", matchId);
  if (deletePredictionsError) {
    return NextResponse.json(
      { error: deletePredictionsError.message || "Failed to delete match predictions." },
      { status: 500 },
    );
  }

  const { error: deleteSetsError } = await supabase
    .from("match_sets")
    .delete()
    .eq("match_id", matchId);
  if (deleteSetsError) {
    return NextResponse.json(
      { error: deleteSetsError.message || "Failed to delete match sets." },
      { status: 500 },
    );
  }

  // Ladder standings are keyed by source_id text, so nothing cascades — clear them here or they
  // outlive the match they describe.
  const { error: deleteLadderEventsError } = await supabase
    .from("ladder_standing_events")
    .delete()
    .eq("source_type", "match")
    .eq("source_id", String(matchId));
  if (deleteLadderEventsError) {
    return NextResponse.json(
      {
        error:
          deleteLadderEventsError.message ||
          "Failed to delete ladder standing events.",
      },
      { status: 500 },
    );
  }

  const { error: deleteTeamsError } = await supabase
    .from("match_teams")
    .delete()
    .eq("match_id", matchId);
  if (deleteTeamsError) {
    return NextResponse.json(
      { error: deleteTeamsError.message || "Failed to delete match teams." },
      { status: 500 },
    );
  }

  const { error: deleteMatchError } = await supabase
    .from("matches")
    .delete()
    .eq("match_id", matchId);
  if (deleteMatchError) {
    return NextResponse.json(
      { error: deleteMatchError.message || "Failed to delete match." },
      { status: 500 },
    );
  }

  // Close the hole this deletion left in the players' rating chains. Non-fatal: the match is
  // already gone, so a failure here is a warning, not a rollback.
  let reanchorWarnings: string[] = [];
  let reanchoredMatchCount = 0;
  try {
    const report = await reanchorPlayerChainsAfter(supabase, {
      pivotAt,
      playerIds: affectedPlayerIds,
    });
    reanchorWarnings = report.warnings;
    reanchoredMatchCount = report.adjustments.length;
  } catch (err) {
    console.error("[ratings] Failed to re-anchor chains after delete:", err);
    reanchorWarnings = [
      "Match deleted, but failed to re-anchor the players' rating chains.",
    ];
  }

  return NextResponse.json(
    {
      message: `Match #${matchId} deleted successfully.`,
      reanchoredRatings: reanchoredMatchCount,
      warnings: reanchorWarnings.length > 0 ? reanchorWarnings : undefined,
    },
    { status: 200 },
  );
}
