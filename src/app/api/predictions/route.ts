import { NextResponse } from "next/server";
import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";

type PredictionRequest = {
  matchId?: unknown;
  type?: unknown;
  prediction?: unknown;
  pickProbability?: unknown;
};

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header." },
      { status: 401 },
    );
  }

  let userClient;
  try {
    userClient = getServerUserClient(authorization);
  } catch {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: PredictionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const matchId =
    typeof body.matchId === "number" && Number.isInteger(body.matchId) && body.matchId > 0
      ? body.matchId
      : null;
  const type = body.type === "winning_team" ? "winning_team" : null;
  const prediction = body.prediction === 1 || body.prediction === 2 ? body.prediction : null;
  const pickProbability =
    typeof body.pickProbability === "number" &&
    Number.isFinite(body.pickProbability) &&
    body.pickProbability > 0 &&
    body.pickProbability < 1
      ? body.pickProbability
      : null;

  if (!matchId || !type || !prediction || pickProbability === null) {
    return NextResponse.json(
      { error: "matchId, type, prediction, and pickProbability are required." },
      { status: 400 },
    );
  }

  let serviceClient;
  try {
    serviceClient = getServerServiceClient();
  } catch {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // Resolve player profile — only players with an existing profile may predict
  const { data: playerRow, error: playerErr } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email)
    .maybeSingle();

  if (playerErr) {
    return NextResponse.json({ error: "Failed to look up player profile." }, { status: 500 });
  }
  if (!playerRow) {
    return NextResponse.json(
      { error: "No player profile found for your account. Only players can submit predictions." },
      { status: 403 },
    );
  }

  // Verify the match exists and is scheduled
  const { data: match, error: matchErr } = await serviceClient
    .from("matches")
    .select("status,date_local,time_local")
    .eq("match_id", matchId)
    .maybeSingle();

  if (matchErr) {
    return NextResponse.json({ error: "Failed to look up match." }, { status: 500 });
  }
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  if (match.status !== "scheduled") {
    return NextResponse.json(
      { error: "Predictions can only be placed on scheduled matches." },
      { status: 409 },
    );
  }

  // Block predictions 2 hours before match start (Philippines time, UTC+8)
  if (match.date_local && match.time_local) {
    const matchTimePH = new Date(
      `${match.date_local}T${match.time_local}+08:00`,
    );
    const voteDeadline = new Date(matchTimePH.getTime() - 2 * 60 * 60 * 1000);
    if (new Date() >= voteDeadline) {
      return NextResponse.json(
        { error: "Predictions are locked 2 hours before match start." },
        { status: 409 },
      );
    }
  }

  // Check for any existing row (active or voided) so we can update in place rather than insert.
  // This handles revotes after roster changes without unique-constraint conflicts.
  const { data: existing, error: existingErr } = await serviceClient
    .from("predictions")
    .select("id")
    .eq("email", user.email)
    .eq("match_id", matchId)
    .eq("type", type)
    .maybeSingle();

  if (existingErr) {
    console.error("[predictions] lookup error:", existingErr.message);
    return NextResponse.json({ error: "Failed to save prediction." }, { status: 500 });
  }

  if (existing) {
    const { data: updated, error: updateErr } = await serviceClient
      .from("predictions")
      .update({ prediction, pick_probability: pickProbability, voided_at: null, void_reason: null })
      .eq("id", existing.id)
      .select("id,prediction")
      .single();

    if (updateErr) {
      console.error("[predictions] update error:", updateErr.message);
      return NextResponse.json({ error: "Failed to save prediction." }, { status: 500 });
    }

    return NextResponse.json({ id: updated.id, prediction: updated.prediction }, { status: 201 });
  }

  const { data: inserted, error: insertErr } = await serviceClient
    .from("predictions")
    .insert({
      email: user.email,
      player_id: playerRow.player_id,
      match_id: matchId,
      type,
      prediction,
      pick_probability: pickProbability,
    })
    .select("id,prediction")
    .single();

  if (insertErr) {
    console.error("[predictions] insert error:", insertErr.message);
    return NextResponse.json({ error: "Failed to save prediction." }, { status: 500 });
  }

  return NextResponse.json({ id: inserted.id, prediction: inserted.prediction }, { status: 201 });
}
