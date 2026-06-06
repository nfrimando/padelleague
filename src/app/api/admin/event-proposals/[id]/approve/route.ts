import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  normalizeOptionalString,
  normalizeOptionalNonNegativeInteger,
} from "@/app/api/admin/_lib/auth";
import { Event, EventProposal, EventRestrictions } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const proposalId = parseInt(id, 10);
  if (isNaN(proposalId)) {
    return NextResponse.json({ error: "Invalid proposal ID." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Fetch the proposal
  const { data: proposal, error: proposalError } = await auth.supabase
    .from("event_proposals")
    .select("*")
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (proposalError) {
    console.error("Proposal fetch error:", proposalError.message);
    return NextResponse.json({ error: proposalError.message }, { status: 500 });
  }
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }
  if ((proposal as EventProposal).status !== "pending") {
    return NextResponse.json({ error: "Proposal has already been reviewed." }, { status: 409 });
  }

  const p = proposal as EventProposal;

  // Enrichment overrides from admin
  const name = normalizeOptionalString(body.name) ?? p.name;
  const start_date = normalizeOptionalString(body.start_date) ?? p.start_date;
  const end_date = normalizeOptionalString(body.end_date) ?? p.end_date ?? null;
  const description = normalizeOptionalString(body.description) ?? p.description ?? null;
  const event_type = normalizeOptionalString(body.event_type) ?? "league_season";
  const image_url = normalizeOptionalString(body.image_url);
  const url_link = normalizeOptionalString(body.url_link);
  const event_url = normalizeOptionalString(body.event_url) ?? p.event_url ?? null;
  const payment_instructions = normalizeOptionalString(body.payment_instructions);
  const registration_status =
    body.registration_status === "open" ? "open" : "closed";
  const status =
    body.status === "ongoing"
      ? "ongoing"
      : body.status === "completed"
        ? "completed"
        : "upcoming";
  const registration_fee =
    typeof body.registration_fee === "number" ? body.registration_fee : 1000;
  const requires_payment =
    body.requires_payment === false ? false : true;

  // Parse restrictions
  let restrictions: EventRestrictions | null = null;
  if (body.restrictions && typeof body.restrictions === "object") {
    const r = body.restrictions as Record<string, unknown>;
    restrictions = {};
    if (typeof r.min_rating === "number") restrictions.min_rating = r.min_rating;
    if (typeof r.max_rating === "number") restrictions.max_rating = r.max_rating;
    if (typeof r.max_games_per_player === "number")
      restrictions.max_games_per_player = r.max_games_per_player;
    if (Object.keys(restrictions).length === 0) restrictions = null;
  } else if (p.restrictions) {
    restrictions = p.restrictions;
  }

  // player_limit from proposal (admin can't override via this endpoint for now)
  const player_limit = normalizeOptionalNonNegativeInteger(body.player_limit ?? p.player_limit);

  // Create event
  const { data: newEvent, error: eventError } = await auth.supabase
    .from("events")
    .insert({
      name,
      event_type,
      start_date,
      end_date,
      description,
      image_url,
      url_link,
      event_url,
      payment_instructions,
      registration_status,
      status,
      registration_fee,
      requires_payment,
      restrictions: restrictions ?? undefined,
    })
    .select("*")
    .single();

  if (eventError || !newEvent) {
    console.error("Failed to create event:", eventError?.message);
    return NextResponse.json({ error: "Failed to create event." }, { status: 500 });
  }

  // Update proposal → approved
  const { data: updatedProposal, error: updateError } = await auth.supabase
    .from("event_proposals")
    .update({
      status: "approved",
      event_id: (newEvent as Event).event_id,
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      // store any admin enrichment in event_url if changed
      ...(player_limit !== null ? { player_limit } : {}),
    })
    .eq("proposal_id", proposalId)
    .select("*")
    .single();

  if (updateError) {
    console.error("Failed to update proposal:", updateError.message);
    // Event was created; log but don't fail the response
  }

  return NextResponse.json({
    event: newEvent as Event,
    proposal: (updatedProposal ?? { ...p, status: "approved", event_id: (newEvent as Event).event_id }) as EventProposal,
  });
}
