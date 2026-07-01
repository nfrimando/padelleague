import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recruit/_lib/auth";
import {
  toRespondentSurveySummary,
  type SurveyState,
} from "@/lib/recalibration/survey";

type ReferrerRow = {
  id: string;
  signup_id: string;
  referrer_player_id: number;
  submitted_by_player_id: number | null;
  initial_rating: number | null;
  notes: string | null;
  is_named_referrer: boolean;
  created_at: string;
  updated_at: string;
  survey_answers: SurveyState | null;
  referrer?: unknown;
};

/** Attach a rater-safe survey summary and drop the raw survey_answers trail. */
function withSurveySummary(row: ReferrerRow) {
  const { survey_answers, ...rest } = row;
  return {
    ...rest,
    survey: survey_answers ? toRespondentSurveySummary(survey_answers) : null,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ signupId: string }> },
) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const { signupId } = await params;
  const serviceClient = getServerServiceClient();

  const { data: signup, error: signupError } = await serviceClient
    .from("signups_players")
    .select(
      "id, status, applicant_name, applicant_nickname, applicant_contact, applicant_email, applicant_image_url, created_at, updated_at, player_id, notes",
    )
    .eq("id", signupId)
    .maybeSingle();

  if (signupError) {
    return NextResponse.json({ error: signupError.message }, { status: 500 });
  }

  if (!signup) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const { data: referrers, error: referrersError } = await serviceClient
    .from("signups_players_referrers")
    .select(
      "id, signup_id, referrer_player_id, submitted_by_player_id, initial_rating, notes, is_named_referrer, survey_answers, created_at, updated_at, referrer:players!referrer_player_id(player_id, name, nickname, image_link)",
    )
    .eq("signup_id", signupId)
    .order("created_at", { ascending: true });

  if (referrersError) {
    return NextResponse.json({ error: referrersError.message }, { status: 500 });
  }

  const rows = (referrers ?? []) as ReferrerRow[];
  const ownRaw = rows.find((r) => r.referrer_player_id === auth.playerId) ?? null;

  // Referrers never see any rating — theirs or others'. Admins see everything.
  if (!auth.isAdmin) {
    const myReferrerRow = ownRaw
      ? { ...withSurveySummary(ownRaw), initial_rating: null }
      : null;
    return NextResponse.json({
      signup,
      isAdmin: false,
      referrers: [],
      myReferrerRow,
    });
  }

  return NextResponse.json({
    signup,
    isAdmin: true,
    referrers: rows.map(withSurveySummary),
    myReferrerRow: ownRaw ? withSurveySummary(ownRaw) : null,
  });
}
