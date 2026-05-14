import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getServerServiceClient } from "@/app/api/_lib/supabase";

/** POST /api/payments/webhook
 *  Handles PayMongo webhook events.
 *  Verifies HMAC-SHA256 signature, auto-transitions signup to accepted on payment.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("paymongo-signature");

  if (!signatureHeader) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // PayMongo signature format: t=<timestamp>,te=<test_hmac>,li=<live_hmac>
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const idx = part.indexOf("=");
      return [part.slice(0, idx), part.slice(idx + 1)];
    }),
  );

  const timestamp = parts["t"];
  const expectedSig = parts["te"] ?? parts["li"];

  if (!timestamp || !expectedSig) {
    return NextResponse.json({ error: "Invalid signature format." }, { status: 400 });
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const computedSig = createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");

  if (computedSig !== expectedSig) {
    return NextResponse.json({ error: "Signature mismatch." }, { status: 400 });
  }

  let event: { data: { attributes: { type: string; data: { attributes: { reference_number?: string }; relationships?: { payment_intent?: unknown } } } } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventType = event.data?.attributes?.type;

  // Only handle link payment paid events
  if (eventType !== "link.payment.paid") {
    return NextResponse.json({ ok: true });
  }

  const linkId = (event.data?.attributes?.data as Record<string, unknown> | undefined)
    ?.id as string | undefined;
  const paymongoPaymentId = (
    (event.data?.attributes?.data as Record<string, unknown> | undefined)
      ?.attributes as Record<string, unknown> | undefined
  )?.reference_number as string | undefined;

  if (!linkId) {
    return NextResponse.json({ error: "Missing link id in payload." }, { status: 400 });
  }

  let serviceClient;
  try {
    serviceClient = getServerServiceClient();
  } catch {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // Find the PayMongo record by link_id
  const { data: pmRow, error: pmError } = await serviceClient
    .from("payments_paymongo")
    .select("id, payment_id")
    .eq("link_id", linkId)
    .maybeSingle();

  if (pmError) {
    return NextResponse.json({ error: pmError.message }, { status: 500 });
  }

  if (!pmRow) {
    // Unknown link — acknowledge without error so PayMongo doesn't retry
    return NextResponse.json({ ok: true });
  }

  const now = new Date().toISOString();

  // Update payments_paymongo with the payment ID and raw webhook data
  await serviceClient
    .from("payments_paymongo")
    .update({
      paymongo_payment_id: paymongoPaymentId ?? null,
      webhook_data: event as unknown as Record<string, unknown>,
      updated_at: now,
    })
    .eq("id", pmRow.id);

  // Mark the payment as paid
  const { data: payment, error: paymentUpdateError } = await serviceClient
    .from("payments")
    .update({
      status: "paid",
      paid_at: now,
      recorded_by: "webhook",
      updated_at: now,
    })
    .eq("id", pmRow.payment_id)
    .select("signup_id")
    .single();

  if (paymentUpdateError || !payment) {
    return NextResponse.json(
      { error: paymentUpdateError?.message ?? "Failed to update payment." },
      { status: 500 },
    );
  }

  // Transition the signup to accepted
  await serviceClient
    .from("signups_events")
    .update({ status: "accepted" })
    .eq("id", payment.signup_id);

  return NextResponse.json({ ok: true });
}
