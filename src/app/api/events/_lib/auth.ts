import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";

export async function resolveCallerPlayerId(
  authorization: string | null,
): Promise<number | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  try {
    const userClient = getServerUserClient(authorization);
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user?.email) return null;
    const serviceClient = getServerServiceClient();
    const { data: player } = await serviceClient
      .from("players")
      .select("player_id")
      .eq("email", user.email)
      .maybeSingle();
    return player?.player_id ?? null;
  } catch {
    return null;
  }
}

export async function isAdminUser(authorization: string | null): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ")) return false;
  try {
    const userClient = getServerUserClient(authorization);
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return false;
    const serviceClient = getServerServiceClient();
    const { data } = await serviceClient
      .from("admin_users")
      .select("auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
