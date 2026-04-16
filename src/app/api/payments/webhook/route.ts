import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { NextResponse } from "next/server";

// PayMongo sends a Paymongo-Signature header with the format:
//   t=<unix_timestamp>,te=<test_hmac>,li=<live_hmac>
// Verification: HMAC-SHA256 of "<timestamp>.<raw_body>" using the webhook secret.

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function verifySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k && v) parts[k] = v;
  }

  const timestamp = parts["t"];
  const testSig   = parts["te"];
  const liveSig   = parts["li"];
  if (!timestamp) return false;

  const payload  = `${timestamp}.${rawBody}`;
  const computed = createHmac("sha256", secret).update(payload).digest("hex");

  return computed === testSig || computed === liveSig;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  const rawBody = await request.text();

  // Verify signature when secret is configured
  if (webhookSecret) {
    const sigHeader = request.headers.get("paymongo-signature") ?? "";
    if (!verifySignature(rawBody, sigHeader, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  }

  let event: {
    data?: {
      id?: string;
      attributes?: {
        type?: string;
        data?: {
          attributes?: {
            links?: { id: string }[];
          };
        };
      };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventType = event?.data?.attributes?.type;

  // Only handle paid events
  if (eventType !== "link.payment.paid") {
    return NextResponse.json({ received: true });
  }

  // Extract PayMongo link ID (stored as paymongo_payment_intent_id)
  const linkId = event?.data?.attributes?.data?.attributes?.links?.[0]?.id ?? null;
  if (!linkId) {
    return NextResponse.json(
      { error: "Could not extract link ID from event." },
      { status: 400 },
    );
  }

  const serviceClient = getServiceClient();

  // ── Idempotency check ──────────────────────────────────────────────────────
  // Use event.data.id as the unique event identifier
  const eventId = event?.data?.id;
  if (eventId) {
    const { data: alreadyProcessed } = await serviceClient
      .from("webhook_events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();

    if (alreadyProcessed) {
      return NextResponse.json({ received: true }); // already handled
    }

    // Mark this event as processed
    await serviceClient.from("webhook_events").insert({
      id: eventId,
      event_type: eventType,
    });
  }

  // ── Find payment via payments_paymongo ─────────────────────────────────────
  const { data: pmRow } = await serviceClient
    .from("payments_paymongo")
    .select("payment_id")
    .eq("paymongo_payment_intent_id", linkId)
    .maybeSingle();

  if (!pmRow) {
    console.error("Webhook: no payments_paymongo row found for link", linkId);
    return NextResponse.json({ error: "Payment record not found." }, { status: 404 });
  }

  // ── Load the payments row ──────────────────────────────────────────────────
  const { data: paymentRow } = await serviceClient
    .from("payments")
    .select("payment_id, reference_doc_type, reference_doc_id, status")
    .eq("payment_id", pmRow.payment_id)
    .maybeSingle();

  if (!paymentRow) {
    console.error("Webhook: payments row not found for id", pmRow.payment_id);
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }

  if (paymentRow.status === "paid") {
    return NextResponse.json({ received: true }); // already paid
  }

  // ── Mark payment as paid ───────────────────────────────────────────────────
  const { error: payUpdateError } = await serviceClient
    .from("payments")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("payment_id", paymentRow.payment_id);

  if (payUpdateError) {
    console.error("Webhook: failed to update payment:", payUpdateError.message);
    return NextResponse.json({ error: "Failed to update payment." }, { status: 500 });
  }

  // ── Mark the referenced signup as registered ───────────────────────────────
  if (
    paymentRow.reference_doc_type === "season_signup" &&
    paymentRow.reference_doc_id
  ) {
    const { error: signupUpdateError } = await serviceClient
      .from("signups")
      .update({ status: "registered", updated_at: new Date().toISOString() })
      .eq("id", paymentRow.reference_doc_id)
      .eq("status", "pending_payment"); // only promote if still pending

    if (signupUpdateError) {
      console.error("Webhook: failed to update signup:", signupUpdateError.message);
      // Don't fail the webhook response — payment is marked paid, signup will reconcile
    }
  }

  return NextResponse.json({ received: true });
}
