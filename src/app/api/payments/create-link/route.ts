import { NextResponse } from "next/server";
import {
  getServerServiceClient,
  getServerUserClient,
} from "@/app/api/_lib/supabase";

/** POST /api/payments/create-link
 *  Authenticated player creates a PayMongo payment link for their pending_payment signup.
 *  Body: { signup_id }
 *  Returns: { link_url }
 */
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header." },
      { status: 401 },
    );
  }

  let userClient;
  try {
    userClient = getServerUserClient(authorization);
  } catch {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { signup_id?: unknown; return_to?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const signupId = typeof body.signup_id === "string" ? body.signup_id.trim() : null;
  if (!signupId) {
    return NextResponse.json({ error: "signup_id is required." }, { status: 400 });
  }

  // Only allow same-origin relative paths to prevent open redirects.
  const returnTo =
    typeof body.return_to === "string" &&
    body.return_to.startsWith("/") &&
    !body.return_to.startsWith("//")
      ? body.return_to
      : "/dashboard";

  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Payment service not configured." }, { status: 500 });
  }

  let serviceClient;
  try {
    serviceClient = getServerServiceClient();
  } catch {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // Load the signup — must belong to this user's player and be pending_payment
  const { data: player, error: playerError } = await serviceClient
    .from("players")
    .select("player_id")
    .eq("email", user.email ?? "")
    .maybeSingle();

  if (playerError || !player) {
    return NextResponse.json({ error: "Player profile not found." }, { status: 403 });
  }

  const { data: signup, error: signupError } = await serviceClient
    .from("signups_events")
    .select("id, player_id, event_id, status")
    .eq("id", signupId)
    .eq("player_id", player.player_id)
    .maybeSingle();

  if (signupError) {
    return NextResponse.json({ error: signupError.message }, { status: 500 });
  }

  if (!signup) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  if (signup.status !== "pending_payment") {
    return NextResponse.json(
      { error: "Signup is not in pending_payment status." },
      { status: 409 },
    );
  }

  // Check for an existing pending PayMongo link for this signup
  const { data: existingPayment } = await serviceClient
    .from("payments")
    .select("id, payments_paymongo(link_url)")
    .eq("signup_id", signupId)
    .eq("method", "paymongo")
    .eq("status", "pending")
    .maybeSingle();

  if (existingPayment) {
    const existing = existingPayment as unknown as {
      id: string;
      payments_paymongo: { link_url: string | null }[] | null;
    };
    const linkUrl = existing.payments_paymongo?.[0]?.link_url;
    if (linkUrl) {
      return NextResponse.json({ link_url: linkUrl });
    }
  }

  // Fetch event fee
  const { data: event, error: eventError } = await serviceClient
    .from("events")
    .select("event_id, name, registration_fee")
    .eq("event_id", signup.event_id)
    .maybeSingle();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const fee = event.registration_fee ?? 1000;
  const amountCentavos = Math.round(fee * 100);
  const description = `Registration fee for ${event.name ?? `Event ${event.event_id}`}`;

  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host") ?? ""}`;
  const separator = returnTo.includes("?") ? "&" : "?";
  const afterPaymentUrl = `${origin}${returnTo}${separator}payment=success`;

  // Create PayMongo payment link
  const paymongoRes = await fetch("https://api.paymongo.com/v1/links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: amountCentavos,
          description,
          remarks: `signup:${signupId}`,
          after_payment_result_url: afterPaymentUrl,
        },
      },
    }),
  });

  if (!paymongoRes.ok) {
    const err = (await paymongoRes.json()) as { errors?: { detail: string }[] };
    const detail = err.errors?.[0]?.detail ?? "Failed to create payment link.";
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  const paymongoData = (await paymongoRes.json()) as {
    data: { id: string; attributes: { checkout_url: string } };
  };

  const linkId = paymongoData.data.id;
  const linkUrl = paymongoData.data.attributes.checkout_url;

  // Record payment row
  const { data: payment, error: paymentInsertError } = await serviceClient
    .from("payments")
    .insert({
      signup_id: signupId,
      player_id: signup.player_id,
      event_id: signup.event_id,
      amount: fee,
      currency: "PHP",
      method: "paymongo",
      status: "pending",
      recorded_by: "player",
    })
    .select("id")
    .single();

  if (paymentInsertError || !payment) {
    return NextResponse.json(
      { error: paymentInsertError?.message ?? "Failed to record payment." },
      { status: 500 },
    );
  }

  // Record PayMongo-specific row
  await serviceClient.from("payments_paymongo").insert({
    payment_id: payment.id,
    link_id: linkId,
    link_url: linkUrl,
  });

  return NextResponse.json({ link_url: linkUrl });
}
