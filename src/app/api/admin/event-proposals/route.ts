import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { EventProposal } from "@/lib/types";

export type EventProposalWithProposer = EventProposal & {
  proposer_name: string | null;
  proposer_nickname: string | null;
};

export async function GET(request: Request) {
  const auth = await getAuthorizedAdminClient(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");

  let query = auth.supabase
    .from("event_proposals")
    .select(`
      *,
      proposer:players!proposed_by_player_id(name, nickname)
    `)
    .order("created_at", { ascending: false });

  if (statusFilter && ["pending", "approved", "rejected"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch proposals:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten proposer join into top-level fields
  const proposals: EventProposalWithProposer[] = (data ?? []).map((row) => {
    const { proposer, ...rest } = row as EventProposal & {
      proposer: { name: string | null; nickname: string | null } | null;
    };
    return {
      ...rest,
      proposer_name: proposer?.name ?? null,
      proposer_nickname: proposer?.nickname ?? null,
    };
  });

  return NextResponse.json({ proposals });
}
