import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { resolveCallerPlayerId } from "@/app/api/events/_lib/auth";
import { loadPlayers } from "@/app/api/events/_lib/pairs";

type EventRow = {
  event_id: number;
  name: string | null;
  start_date: string | null;
  registration_fee: number | null;
  registration_status: string;
  visibility: string | null;
};

/**
 * GET /api/events/invites — partner invites awaiting the caller's reply.
 *
 * Powers the dashboard prompt. Kept separate from /api/events/my-signups, which is
 * hot and deliberately cheap.
 */
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const callerPlayerId = await resolveCallerPlayerId(authorization);
  if (callerPlayerId === null) {
    return NextResponse.json({ invites: [] });
  }

  const serviceClient = getServerServiceClient();

  const { data: pairs, error } = await serviceClient
    .from("event_signup_pairs")
    .select("id, event_id, initiator_player_id, created_at")
    .eq("invitee_player_id", callerPlayerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load partner invites:", error.message);
    return NextResponse.json({ invites: [] });
  }

  const rows = pairs ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ invites: [] });
  }

  const { data: events } = await serviceClient
    .from("events")
    .select("event_id, name, start_date, registration_fee, registration_status, visibility")
    .in("event_id", [...new Set(rows.map((r) => Number(r.event_id)))])
    .is("deleted_at", null);

  const eventById = new Map<number, EventRow>();
  for (const e of (events ?? []) as EventRow[]) {
    eventById.set(Number(e.event_id), e);
  }

  const initiators = await loadPlayers(
    serviceClient,
    rows.map((r) => Number(r.initiator_player_id)),
  );

  const invites = rows
    .map((row) => {
      const event = eventById.get(Number(row.event_id));
      // Skip invites to deleted, unpublished or closed events — nothing to accept.
      if (!event || event.visibility === "draft") return null;
      if (event.registration_status !== "open") return null;
      return {
        pair_id: row.id as string,
        event_id: Number(row.event_id),
        event_name: event.name ?? null,
        start_date: event.start_date ?? null,
        registration_fee: event.registration_fee ?? null,
        initiator: initiators.get(Number(row.initiator_player_id)) ?? null,
        created_at: row.created_at as string,
      };
    })
    .filter((invite): invite is NonNullable<typeof invite> => invite !== null);

  return NextResponse.json({ invites });
}
