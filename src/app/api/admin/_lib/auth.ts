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
      supabase: ReturnType<typeof createClient>;
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

  let supabase;
  try {
    supabase = getSupabaseClient(authorization);
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
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized user session." },
        { status: 401 },
      ),
    };
  }

  const { data: adminRow, error: adminError } = await supabase
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
    supabase,
    userId: user.id,
  };
}