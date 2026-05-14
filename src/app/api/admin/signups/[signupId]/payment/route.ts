import { NextResponse } from "next/server";
import { getAuthorizedAdminClient } from "@/app/api/admin/_lib/auth";

const ALLOWED_METHODS = ["cash", "bank_transfer", "gcash", "other"] as const;
type PaymentMethod = (typeof ALLOWED_METHODS)[number];

/** POST /api/admin/signups/:signupId/payment
 *  Admin records a manual payment and transitions signup to accepted.
 *  Body: { method, amount, reference_number?, notes? }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ signupId: string }> },
) {
  const authResult = await getAuthorizedAdminClient(request);
  if (!authResult.ok) return authResult.response;

  const { signupId: rawSignupId } = await params;
  const signupId = rawSignupId.trim();

  if (!signupId) {
    return NextResponse.json({ error: "signupId is required." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const method = typeof body.method === "string" && ALLOWED_METHODS.includes(body.method as PaymentMethod)
    ? (body.method as PaymentMethod)
    : null;

  if (!method) {
    return NextResponse.json(
      { error: "method must be one of cash, bank_transfer, gcash, other." },
      { status: 400 },
    );
  }

  const amount = typeof body.amount === "number" && body.amount > 0 ? body.amount : null;
  if (!amount) {
    return NextResponse.json({ error: "amount must be a positive number." }, { status: 400 });
  }

  const referenceNumber = typeof body.reference_number === "string" && body.reference_number.trim()
    ? body.reference_number.trim()
    : null;

  const notes = typeof body.notes === "string" && body.notes.trim()
    ? body.notes.trim()
    : null;

  const { supabase, userId } = authResult;

  // Load the signup to get player_id and event_id
  const { data: signup, error: signupError } = await supabase
    .from("signups_events")
    .select("id, player_id, event_id, status")
    .eq("id", signupId)
    .maybeSingle();

  if (signupError) {
    return NextResponse.json({ error: signupError.message }, { status: 500 });
  }

  if (!signup) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Create payment record
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      signup_id: signupId,
      player_id: signup.player_id,
      event_id: signup.event_id,
      amount,
      currency: "PHP",
      method,
      status: "paid",
      reference_number: referenceNumber,
      notes,
      paid_at: now,
      recorded_by: userId,
    })
    .select("id")
    .single();

  if (paymentError || !payment) {
    return NextResponse.json(
      { error: paymentError?.message ?? "Failed to create payment record." },
      { status: 500 },
    );
  }

  // Transition signup to accepted
  const { error: updateError } = await supabase
    .from("signups_events")
    .update({ status: "accepted" })
    .eq("id", signupId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, payment_id: payment.id });
}
