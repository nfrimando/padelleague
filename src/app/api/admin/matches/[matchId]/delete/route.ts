import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";

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
    .select("match_id,status")
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

  return NextResponse.json(
    { message: `Match #${matchId} deleted successfully.` },
    { status: 200 },
  );
}
