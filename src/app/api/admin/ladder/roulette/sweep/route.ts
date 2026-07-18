import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";
import { sweepExpiredLadderAssignments } from "@/lib/ladder/ladderRoulette";

export async function POST(request: Request) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { supabase } = authResult;

  const { data: activeCycle, error: cycleError } = await supabase
    .from("ladder_cycles")
    .select("id")
    .eq("status", "active")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cycleError) {
    return NextResponse.json({ error: cycleError.message }, { status: 500 });
  }
  if (!activeCycle) {
    return NextResponse.json({ error: "No active ladder cycle." }, { status: 400 });
  }

  const result = await sweepExpiredLadderAssignments(supabase, activeCycle.id as number);

  return NextResponse.json(
    { cycleId: activeCycle.id, ...result },
    { status: 200 },
  );
}
