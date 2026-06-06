import { NextResponse } from "next/server";
import { getAuthorizedAdminClient, normalizeOptionalString } from "@/app/api/admin/_lib/auth";
import { EventProposal } from "@/lib/types";

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

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // body is optional for reject
  }

  const admin_notes = normalizeOptionalString(body.admin_notes);

  const { data: existing, error: fetchError } = await auth.supabase
    .from("event_proposals")
    .select("status")
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }
  if ((existing as { status: string }).status !== "pending") {
    return NextResponse.json({ error: "Proposal has already been reviewed." }, { status: 409 });
  }

  const { data: proposal, error: updateError } = await auth.supabase
    .from("event_proposals")
    .update({
      status: "rejected",
      admin_notes,
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("proposal_id", proposalId)
    .select("*")
    .single();

  if (updateError) {
    console.error("Failed to reject proposal:", updateError.message);
    return NextResponse.json({ error: "Failed to reject proposal." }, { status: 500 });
  }

  return NextResponse.json({ proposal: proposal as EventProposal });
}
