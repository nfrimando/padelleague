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

// ─── PayMongo ─────────────────────────────────────────────────────────────────

async function createPayMongoLink(opts: {
  amountCentavos: number;
  description: string;
  remarks: string;
  redirectSuccess: string;
  redirectFailed: string;
}) {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) throw new Error("PAYMONGO_SECRET_KEY is not configured.");

  const encoded = Buffer.from(`${secretKey}:`).toString("base64");

  const res = await fetch("https://api.paymongo.com/v1/links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${encoded}`,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: opts.amountCentavos,
          description: opts.description,
          remarks: opts.remarks,
          redirect: {
            success: opts.redirectSuccess,
            failed: opts.redirectFailed,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { errors?: { detail?: string }[] })?.errors?.[0]?.detail ??
        "PayMongo error",
    );
  }

  const json = (await res.json()) as {
    data: { id: string; attributes: { checkout_url: string; status: string } };
  };

  return json.data;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // 1. Authenticate
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header." },
      { status: 401 },
    );
  }

  const userClient = getUserClient(authorization);
  const { data: { user }, error: authError } = await userClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Parse body
  let body: { season_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const seasonId = typeof body.season_id === "number" ? body.season_id : null;
  if (!seasonId) {
    return NextResponse.json({ error: "season_id is required." }, { status: 400 });
  }

  const serviceClient = getServiceClient();

  // 3. Find or auto-create a player record for this Google account
  let { data: player } = await serviceClient
    .from("players")
    .select("player_id, name, email, is_profile_complete")
    .eq("email", user.email ?? "")
    .maybeSingle();

  // If the player exists but is not yet verified, block registration
  if (player && !player.is_profile_complete) {
    return NextResponse.json(
      { error: "Your account is pending verification. An admin will approve it shortly.", pendingVerification: true },
      { status: 403 },
    );
  }

  if (!player) {
    // First-time registrant: create a player record from their Google profile
    const fullName: string =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      user.email?.split("@")[0] ||
      "New Player";

    // Derive a short nickname (first name, or full name if single token)
    const nickname = fullName.split(" ")[0] ?? fullName;

    const { data: created, error: createError } = await serviceClient
      .from("players")
      .insert({
        name:                fullName,
        nickname:            nickname,
        email:               user.email,
        image_link:          (user.user_metadata?.avatar_url as string | undefined) ?? null,
        is_profile_complete: false,
        auto_renew_season:   false,
      })
      .select("player_id, name, email, is_profile_complete")
      .single();

    if (createError || !created) {
      console.error("Failed to create player record:", createError?.message);
      return NextResponse.json(
        { error: "Failed to create player profile. Please try again." },
        { status: 500 },
      );
    }

    player = created;

    // Newly registered players always start unverified — block immediately
    return NextResponse.json(
      { error: "Your account is pending verification. An admin will approve it shortly.", pendingVerification: true },
      { status: 403 },
    );
  }

  // TypeScript narrowing: player is guaranteed non-null past this point
  if (!player) {
    return NextResponse.json({ error: "Player not found." }, { status: 500 });
  }

  // 4. Load season (must be open).
  //    Select only guaranteed columns; name + registration_fee are added by migration
  //    20260414000001 and may not exist yet — we handle their absence gracefully.
  const { data: season, error: seasonError } = await serviceClient
    .from("seasons")
    .select("season_id, registration_status, start_date, end_date")
    .eq("season_id", seasonId)
    .eq("registration_status", "open")
    .maybeSingle();

  if (seasonError || !season) {
    console.error("Season lookup error:", seasonError?.message);
    return NextResponse.json(
      { error: "Season not found or registration is closed." },
      { status: 404 },
    );
  }

  // Attempt to read optional columns (only present after migration 20260414000001)
  const { data: seasonExtra } = await serviceClient
    .from("seasons")
    .select("name, registration_fee")
    .eq("season_id", seasonId)
    .maybeSingle()
    .then((r) => {
      // If the columns don't exist PostgREST returns an error — treat as empty
      if (r.error) return { data: null };
      return r;
    });

  const seasonName: string =
    (seasonExtra as { name?: string | null } | null)?.name ??
    (season.start_date
      ? `Season ${season.season_id} · ${new Date(season.start_date).getFullYear()}`
      : `Season ${season.season_id}`);

  const registrationFee: number =
    (seasonExtra as { registration_fee?: number | null } | null)?.registration_fee ?? 5;

  // 5. Guard duplicate signups — but resume if payment is still pending
  const { data: existingSignup } = await serviceClient
    .from("signups")
    .select("id, status")
    .eq("player_id", player.player_id)
    .eq("season_id", seasonId)
    .maybeSingle();

  if (existingSignup) {
    if (existingSignup.status === "pending_payment") {
      // Look up the existing PayMongo checkout URL so the player can resume payment
      const { data: pmRow } = await serviceClient
        .from("payments")
        .select("payment_id")
        .eq("reference_doc_id", existingSignup.id)
        .eq("reference_doc_type", "season_signup")
        .eq("status", "pending")
        .maybeSingle();

      if (pmRow) {
        const { data: pmLink } = await serviceClient
          .from("payments_paymongo")
          .select("raw_response")
          .eq("payment_id", pmRow.payment_id)
          .maybeSingle();

        const checkoutUrl = (pmLink?.raw_response as { attributes?: { checkout_url?: string } } | null)
          ?.attributes?.checkout_url;

        if (checkoutUrl) {
          return NextResponse.json({ checkout_url: checkoutUrl });
        }
      }

      // Fallback: no usable link found — let the flow create a fresh one
      // by deleting the stale pending_payment signup and payment records
      if (pmRow) {
        await serviceClient.from("payments_paymongo").delete().eq("payment_id", pmRow.payment_id);
        await serviceClient.from("payments").delete().eq("payment_id", pmRow.payment_id);
      }
      await serviceClient.from("signups").delete().eq("id", existingSignup.id);
      // Fall through to create fresh signup + payment below
    } else {
      return NextResponse.json(
        { error: "You have already signed up for this season." },
        { status: 409 },
      );
    }
  }

  // 6. Create the `payments` record (pending)
  const { data: payment, error: paymentInsertError } = await serviceClient
    .from("payments")
    .insert({
      player_id: player.player_id,
      reference_doc_type: "season_signup",
      // reference_doc_id will be set after signup is created
      reference_doc_id: "00000000-0000-0000-0000-000000000000", // placeholder
      amount: registrationFee,
      currency: "PHP",
      provider: "paymongo",
      status: "pending",
    })
    .select("payment_id")
    .single();

  if (paymentInsertError || !payment) {
    console.error("Failed to create payment record:", paymentInsertError?.message);
    return NextResponse.json({ error: "Failed to create payment record." }, { status: 500 });
  }

  // 7. Create the `signups` record (pending_payment)
  const { data: signup, error: signupInsertError } = await serviceClient
    .from("signups")
    .insert({
      season_id: seasonId,
      player_id: player.player_id,
      event_type: "season_registration",
      status: "pending_payment",
    })
    .select("id")
    .single();

  if (signupInsertError || !signup) {
    // Roll back the payment record
    await serviceClient.from("payments").delete().eq("payment_id", payment.payment_id);
    console.error("Failed to create signup record:", signupInsertError?.message);
    return NextResponse.json({ error: "Failed to create signup record." }, { status: 500 });
  }

  // 8. Back-fill reference_doc_id on the payment now that we have the signup id
  await serviceClient
    .from("payments")
    .update({ reference_doc_id: signup.id })
    .eq("payment_id", payment.payment_id);

  // 9. Create PayMongo payment link
  const origin = new URL(request.url).origin;
  let paymongoLink;

  try {
    paymongoLink = await createPayMongoLink({
      amountCentavos: Math.round(registrationFee * 100),
      description: `${seasonName} Registration — ${player.name}`,
      remarks: `payment:${payment.payment_id}`,
      redirectSuccess: `${origin}/register/success`,
      redirectFailed: `${origin}/register?payment=failed`,
    });
  } catch (err) {
    // Roll back both records
    await serviceClient.from("signups").delete().eq("id", signup.id);
    await serviceClient.from("payments").delete().eq("payment_id", payment.payment_id);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payment provider error." },
      { status: 502 },
    );
  }

  // 10. Persist PayMongo link id in `payments_paymongo`
  // We store the link id in paymongo_payment_intent_id for webhook lookup.
  await serviceClient.from("payments_paymongo").insert({
    payment_id: payment.payment_id,
    paymongo_payment_intent_id: paymongoLink.id,
    raw_response: paymongoLink as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ checkout_url: paymongoLink.attributes.checkout_url });
}
