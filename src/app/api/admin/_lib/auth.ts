import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeRequiredPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

export function normalizeOptionalPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return normalizeRequiredPositiveInteger(value);
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

type AuthorizedAdminClientResult =
  | {
      ok: true;
      supabase: ReturnType<typeof getSupabaseClient>;
      userId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function getSupabaseClient(authorization: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });
}

/**
 * Returns a Supabase client that bypasses RLS using the service role key.
 * This is used for admin DB operations after the user's identity has already
 * been verified via their JWT. Falls back to null when the key is not set.
 */
function getSupabaseServiceRoleClient(): ReturnType<typeof getSupabaseClient> | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as ReturnType<typeof getSupabaseClient>;
}

export type AdminSupabaseClient = ReturnType<typeof getSupabaseClient>;

export async function getAuthorizedAdminClient(
  request: Request,
): Promise<AuthorizedAdminClientResult> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing or invalid Authorization header." },
        { status: 401 },
      ),
    };
  }

  let userClient;
  try {
    userClient = getSupabaseClient(authorization);
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to initialize Supabase client.",
        },
        { status: 500 },
      ),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized user session." },
        { status: 401 },
      ),
    };
  }

  // Use the service role client for DB operations when available so that admin
  // writes are not silently blocked by Supabase RLS UPDATE policies. Identity
  // verification above is always done with the user's own JWT.
  const dbClient = getSupabaseServiceRoleClient() ?? userClient;

  const { data: adminRow, error: adminError } = await dbClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: adminError.message || "Failed to verify admin access." },
        { status: 500 },
      ),
    };
  }

  if (!adminRow) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden. Admin access is required." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    supabase: dbClient,
    userId: user.id,
  };
}