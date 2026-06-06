import { NextResponse } from "next/server";
import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";
import { EventProposal } from "@/lib/types";

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

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const start_date = typeof body.start_date === "string" ? body.start_date.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (!start_date) {
    return NextResponse.json({ error: "start_date is required." }, { status: 400 });
  }

  const end_date = typeof body.end_date === "string" && body.end_date.trim() ? body.end_date.trim() : null;
  const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  const format = typeof body.format === "string" && body.format.trim() ? body.format.trim() : null;
  const player_limit = typeof body.player_limit === "number" && body.player_limit > 0 ? body.player_limit : null;
  const event_url = typeof body.event_url === "string" && body.event_url.trim() ? body.event_url.trim() : null;
  const proposer_notes = typeof body.proposer_notes === "string" && body.proposer_notes.trim() ? body.proposer_notes.trim() : null;

  let serviceClient;
  try {
    serviceClient = getServerServiceClient();
  } catch {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // Only linked (member) players can propose events
  const { data: player, error: playerError } = await serviceClient
    .from("players")
    .select("player_id, is_profile_complete")
    .eq("email", user.email ?? "")
    .maybeSingle();

  if (playerError) {
    console.error("Player lookup error:", playerError.message);
    return NextResponse.json({ error: "Failed to verify player profile." }, { status: 500 });
  }

  if (!player) {
    return NextResponse.json(
      { error: "No player profile linked to your account.", noProfile: true },
      { status: 403 },
    );
  }

  if (!player.is_profile_complete) {
    return NextResponse.json(
      { error: "Your account is pending verification.", pendingVerification: true },
      { status: 403 },
    );
  }

  const { data: proposal, error: insertError } = await serviceClient
    .from("event_proposals")
    .insert({
      name,
      start_date,
      end_date,
      description,
      format,
      player_limit,
      event_url,
      proposer_notes,
      proposed_by_player_id: player.player_id,
      proposed_by_auth_id: user.id,
      status: "pending",
    })
    .select("*")
    .single();

  if (insertError || !proposal) {
    console.error("Failed to insert proposal:", insertError?.message);
    return NextResponse.json({ error: "Failed to submit proposal." }, { status: 500 });
  }

  return NextResponse.json({ proposal: proposal as EventProposal }, { status: 201 });
}
