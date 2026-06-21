import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { getAuthorizedPlayer } from "@/app/api/recalibration/_lib/auth";
import { getRecalibrationCooldownStatus } from "@/app/api/recalibration/_lib/cooldown";

/** GET /api/recalibration/eligibility — cooldown status for the requesting player */
export async function GET(request: Request) {
  const auth = await getAuthorizedPlayer(request);
  if (!auth.ok) return auth.response;

  const serviceClient = getServerServiceClient();
  const status = await getRecalibrationCooldownStatus(serviceClient, auth.playerId);

  return NextResponse.json(status);
}
