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
    console.error("[webhook] Missing paymongo-signature header");
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
  const expectedSig = parts["li"] || parts["te"]; // live sig preferred; fall back to test

  console.log("[webhook] sig header parts:", { t: timestamp, te: parts["te"]?.slice(0, 8), li: parts["li"]?.slice(0, 8) });

  if (!timestamp || !expectedSig) {
    console.error("[webhook] Invalid signature format — missing t or hmac");
    return NextResponse.json({ error: "Invalid signature format." }, { status: 400 });
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const computedSig = createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");

  console.log("[webhook] computed:", computedSig.slice(0, 8), "expected:", expectedSig.slice(0, 8));

  if (computedSig !== expectedSig) {
    console.error("[webhook] Signature mismatch — secret may not match registered endpoint");
    return NextResponse.json({ error: "Signature mismatch." }, { status: 400 });
  }

  let event: { data: { attributes: { type: string; data: unknown } } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    console.error("[webhook] JSON parse failed");
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventType = event.data?.attributes?.type;
  console.log("[webhook] event type:", eventType);

  // Only handle payment paid events
  if (eventType !== "payment.paid") {
    console.log("[webhook] ignoring event type:", eventType);
    return NextResponse.json({ ok: true });
  }

  const eventData = event.data?.attributes?.data as Record<string, unknown> | undefined;
  const eventDataAttrs = eventData?.attributes as Record<string, unknown> | undefined;
  const eventSource = eventDataAttrs?.source as Record<string, unknown> | undefined;
  console.log("[webhook] data.id:", eventData?.id);
  console.log("[webhook] attrs keys:", Object.keys(eventDataAttrs ?? {}));
  console.log("[webhook] remarks:", eventDataAttrs?.remarks, "description:", eventDataAttrs?.description);
  console.log("[webhook] source:", JSON.stringify(eventSource));

  const linkId = eventSource?.id as string | undefined;
  const paymongoPaymentId = (
    (event.data?.attributes?.data as Record<string, unknown> | undefined)
      ?.attributes as Record<string, unknown> | undefined
  )?.reference_number as string | undefined;

  console.log("[webhook] linkId:", linkId, "paymongoPaymentId:", paymongoPaymentId);

  if (!linkId) {
    console.error("[webhook] Missing link id in payload");
    return NextResponse.json({ error: "Missing link id in payload." }, { status: 400 });
  }

  let serviceClient;
  try {
    serviceClient = getServerServiceClient();
  } catch {
    console.error("[webhook] Failed to get service client");
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // Find the PayMongo record by link_id
  const { data: pmRow, error: pmError } = await serviceClient
    .from("payments_paymongo")
    .select("id, payment_id")
    .eq("link_id", linkId)
    .maybeSingle();

  console.log("[webhook] pmRow lookup:", { pmRow, pmError: pmError?.message });

  if (pmError) {
    return NextResponse.json({ error: pmError.message }, { status: 500 });
  }

  if (!pmRow) {
    console.log("[webhook] no matching pmRow for linkId:", linkId);
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
