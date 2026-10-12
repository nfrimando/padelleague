import { NextResponse } from "next/server";
import {
  getAuthorizedAdminClient,
  normalizeRequiredPositiveInteger,
} from "@/app/api/admin/_lib/auth";
import {
  insertOrReviveSignup,
  loadLatestSignup,
  loadLivePairForPlayer,
} from "@/app/api/events/_lib/pairs";
import type { EventSignupStatus } from "@/lib/eventSignupStatus";

const ALLOWED_SIGNUP_STATUSES: EventSignupStatus[] = [
  "applied",
  "pending_payment",
  "accepted",
  "waitlisted",
  "cancelled",
];

/** POST /api/admin/signups/pair — admin pairs two players directly in a paired event
 *  Body: { event_id, player_a_id, player_b_id, status? }
 *
 *  Skips the invite/accept handshake. A player who already holds a live signup keeps
 *  their status; `status` (default 'applied') only applies to players signed up here.
 */
export async function POST(request: Request) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const eventId = normalizeRequiredPositiveInteger(body.event_id);
  const playerAId = normalizeRequiredPositiveInteger(body.player_a_id);
  const playerBId = normalizeRequiredPositiveInteger(body.player_b_id);
  if (eventId === null || playerAId === null || playerBId === null) {
    return NextResponse.json(
      { error: "event_id, player_a_id and player_b_id are required." },
      { status: 400 },
    );
  }
  if (playerAId === playerBId) {
    return NextResponse.json(
      { error: "Pick two different players." },
      { status: 400 },
    );
  }

  const statusRaw = body.status;
  const status =
    statusRaw === undefined
      ? "applied"
      : typeof statusRaw === "string" &&
          ALLOWED_SIGNUP_STATUSES.includes(statusRaw as EventSignupStatus) &&
          statusRaw !== "cancelled"
        ? (statusRaw as EventSignupStatus)
        : null;
  if (!status) {
    return NextResponse.json(
      { error: "status must be one of applied, pending_payment, accepted, waitlisted." },
      { status: 400 },
    );
  }

  const { supabase } = authResult;

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("event_id, signup_mode")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }
  if (!eventRow) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  if (eventRow.signup_mode !== "paired") {
    return NextResponse.json(
      { error: "This event doesn't use paired signups." },
      { status: 400 },
    );
  }

  const { data: playerRows, error: playersError } = await supabase
    .from("players")
    .select("player_id, name, nickname")
    .in("player_id", [playerAId, playerBId]);

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }
  const labelOf = (id: number) => {
    const row = (playerRows ?? []).find((p) => Number(p.player_id) === id);
    return row ? (row.nickname ?? row.name ?? `Player ${id}`) : null;
  };
  if (labelOf(playerAId) === null || labelOf(playerBId) === null) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  try {
    for (const id of [playerAId, playerBId]) {
      const livePair = await loadLivePairForPlayer(supabase, eventId, id);
      if (livePair) {
        return NextResponse.json(
          {
            error: `${labelOf(id)} already has a partner or a pending invite for this event — unpair them first.`,
          },
          { status: 409 },
        );
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pair lookup failed." },
      { status: 500 },
    );
  }

  const { data: pair, error: pairError } = await supabase
    .from("event_signup_pairs")
    .insert({
      event_id: eventId,
      initiator_player_id: playerAId,
      invitee_player_id: playerBId,
      status: "pending",
    })
    .select("id")
    .single();

  if (pairError || !pair) {
    return NextResponse.json(
      { error: pairError?.message ?? "Failed to create pair." },
      { status: 500 },
    );
  }
  const pairId = pair.id as string;

  // Same ordering as acceptPair: signups, then pair_id stamp, then flip to 'accepted'
  // last. Not acceptPair itself — it revives the invitee as 'applied', which would
  // downgrade a player who already holds an accepted spot.
  try {
    for (const id of [playerAId, playerBId]) {
      const existing = await loadLatestSignup(supabase, eventId, id);
      const isLive =
        existing !== null &&
        existing.status !== "cancelled" &&
        existing.status !== "waitlisted";
      if (!isLive) {
        await insertOrReviveSignup(supabase, eventId, id, {
          status,
          lookingForPartner: false,
        });
      }
    }

    const { error: stampError } = await supabase
      .from("signups_events")
      .update({
        pair_id: pairId,
        looking_for_partner: false,
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .in("player_id", [playerAId, playerBId])
      .neq("status", "cancelled");
    if (stampError) throw new Error(stampError.message);

    const { error: acceptError } = await supabase
      .from("event_signup_pairs")
      .update({
        status: "accepted",
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pairId);
    if (acceptError) throw new Error(acceptError.message);
  } catch (error) {
    // Don't leave a half-built pair behind.
    await supabase
      .from("signups_events")
      .update({
        pair_id: null,
        looking_for_partner: true,
        updated_at: new Date().toISOString(),
      })
      .eq("pair_id", pairId);
    await supabase
      .from("event_signup_pairs")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", pairId);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to pair players." },
      { status: 500 },
    );
  }

  return NextResponse.json({ pair_id: pairId }, { status: 201 });
}
