import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// ─── Supabase clients ─────────────────────────────────────────────────────────

function getUserClient(authorization: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authorization } } },
  );
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── PayMongo link status check ───────────────────────────────────────────────

async function getPayMongoLinkStatus(linkId: string): Promise<string | null> {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) return null;

  const encoded = Buffer.from(`${secretKey}:`).toString("base64");

  const res = await fetch(`https://api.paymongo.com/v1/links/${linkId}`, {
    headers: { Authorization: `Basic ${encoded}` },
  });

  if (!res.ok) return null;

  const json = (await res.json()) as {
    data?: { attributes?: { status?: string } };
  };

  return json.data?.attributes?.status ?? null;
}

// ─── Route: POST /api/payments/confirm ───────────────────────────────────────
// Called by the success page to verify payment and confirm registration
// without relying on the webhook (needed for localhost / slow webhooks).

export async function POST(request: Request) {
  // 1. Authenticate
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userClient = getUserClient(authorization);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const serviceClient = getServiceClient();

  // 2. Find player
  const { data: player } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email ?? "")
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  // 3. Find the most recent pending_payment signup for this player
  const { data: signup } = await serviceClient
    .from("signups")
    .select("id, season_id, status")
    .eq("player_id", player.player_id)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!signup) {
    // Check if already registered (race: webhook fired first)
    const { data: registered } = await serviceClient
      .from("signups")
      .select("id, season_id, status")
      .eq("player_id", player.player_id)
      .eq("status", "registered")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (registered) {
      return NextResponse.json({ status: "registered", signup_id: registered.id });
    }

    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  // Already confirmed by webhook
  if (signup.status === "registered") {
    return NextResponse.json({ status: "registered", signup_id: signup.id });
  }

  // 4. Find the payment record for this signup
  const { data: payment } = await serviceClient
    .from("payments")
    .select("payment_id, status")
    .eq("reference_doc_id", signup.id)
    .eq("reference_doc_type", "season_signup")
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ status: "pending" });
  }

  if (payment.status === "paid") {
    // Payment already marked paid — just confirm the signup
    await serviceClient
      .from("signups")
      .update({ status: "registered", updated_at: new Date().toISOString() })
      .eq("id", signup.id);

    return NextResponse.json({ status: "registered", signup_id: signup.id });
  }

  // 5. Look up the PayMongo link ID
  const { data: pmRow } = await serviceClient
    .from("payments_paymongo")
    .select("paymongo_payment_intent_id")
    .eq("payment_id", payment.payment_id)
    .maybeSingle();

  if (!pmRow?.paymongo_payment_intent_id) {
    return NextResponse.json({ status: "pending" });
  }

  // 6. Ask PayMongo directly if the link has been paid
  const linkStatus = await getPayMongoLinkStatus(pmRow.paymongo_payment_intent_id);

  if (linkStatus === "paid") {
    // Update payment → paid
    await serviceClient
      .from("payments")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("payment_id", payment.payment_id);

    // Update signup → registered
    await serviceClient
      .from("signups")
      .update({ status: "registered", updated_at: new Date().toISOString() })
      .eq("id", signup.id);

    return NextResponse.json({ status: "registered", signup_id: signup.id });
  }

  // Not yet paid according to PayMongo
  return NextResponse.json({ status: linkStatus ?? "pending" });
}
