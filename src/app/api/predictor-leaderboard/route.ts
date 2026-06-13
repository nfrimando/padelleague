import { NextResponse } from "next/server";
import { getServerServiceClient } from "@/app/api/_lib/supabase";

type LeaderboardEntry = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  points: number;
};

export async function GET() {
  const supabase = getServerServiceClient();

  const { data, error } = await supabase.rpc("get_predictor_leaderboard");

  if (error) {
    console.error("[predictor-leaderboard] rpc error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []) as LeaderboardEntry[]);
}
