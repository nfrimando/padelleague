import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";

/** POST /api/admin/events/[id]/publish — publish a draft event */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
  }

  const { data: event, error: fetchError } = await auth.supabase
    .from("events")
    .select("event_id, visibility")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const { data: updated, error: updateError } = await auth.supabase
    .from("events")
    .update({ visibility: "published" })
    .eq("event_id", eventId)
    .select("*")
    .maybeSingle();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ event: updated });
}
