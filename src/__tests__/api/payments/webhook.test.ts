import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { makeServiceClient } from "../../helpers/supabase-mock";

// ─── Mock before importing route ──────────────────────────────────────────────

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mockCreateClient }));

import { POST } from "@/app/api/payments/webhook/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SECRET         = "whsk_test_mock";
const LINK_ID        = "link_abc123";
const EVENT_ID       = "evt_test_001";
const PAYMENT_ROW    = { payment_id: "pay-uuid", status: "pending", reference_doc_type: "season_signup", reference_doc_id: "signup-uuid" };
const PM_ROW         = { payment_id: "pay-uuid" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPayload(type: string, linkId?: string, eventId = EVENT_ID) {
  return {
    data: {
      id: eventId,
      attributes: {
        type,
        data: linkId
          ? { attributes: { links: [{ id: linkId }] } }
          : { attributes: {} },
      },
    },
  };
}

function sign(body: string, timestamp = "1700000000") {
  const hmac = createHmac("sha256", SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},te=${hmac}`;
}

function makeRequest(body: unknown, sigHeader?: string) {
  const raw = JSON.stringify(body);
  return new Request("http://localhost:3000/api/payments/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sigHeader ? { "paymongo-signature": sigHeader } : {}),
    },
    body: raw,
  });
}

function makePaidRequest(linkId = LINK_ID, eventId = EVENT_ID) {
  const payload = buildPayload("link.payment.paid", linkId, eventId);
  const raw     = JSON.stringify(payload);
  return makeRequest(payload, sign(raw));
}

function setupServiceClient(tables: Record<string, unknown>) {
  mockCreateClient.mockReturnValue(makeServiceClient(tables as never));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/payments/webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Signature verification ─────────────────────────────────────────────────

  it("TC-7.1 returns 401 for invalid signature", async () => {
    const payload = buildPayload("link.payment.paid", LINK_ID);
    const req = makeRequest(payload, "t=1700000000,te=badhash");
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Invalid signature." });
  });

  it("TC-7.1b accepts valid signature", async () => {
    setupServiceClient({
      webhook_events: [{ data: null }, { data: null }], // idempotency check + insert
      payments_paymongo: { data: PM_ROW },
      payments: [{ data: PAYMENT_ROW }, { data: null }],
      signups: { data: null },
    });
    const res = await POST(makePaidRequest());
    expect(res.status).toBe(200);
  });

  // ── Non-payment event ─────────────────────────────────────────────────────

  it("TC-7.2 ignores non-payment events", async () => {
    setupServiceClient({});
    const payload = buildPayload("link.payment.failed");
    const raw     = JSON.stringify(payload);
    const res = await POST(makeRequest(payload, sign(raw)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true });

    // No DB operations should have been triggered
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  // ── Missing link ID ───────────────────────────────────────────────────────

  it("TC-7.3 returns 400 when link ID is missing in paid event", async () => {
    setupServiceClient({
      webhook_events: [{ data: null }, { data: null }],
    });
    const payload = buildPayload("link.payment.paid"); // no linkId
    const raw     = JSON.stringify(payload);
    const res = await POST(makeRequest(payload, sign(raw)));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("link ID") });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("TC-7.4 marks payment paid and signup registered on valid event", async () => {
    const svcClient = makeServiceClient({
      webhook_events:   [{ data: null }, { data: null }],  // not exists + insert
      payments_paymongo: { data: PM_ROW },
      payments:         [{ data: PAYMENT_ROW }, { data: null }],  // find + update
      signups:          { data: null },                           // update
    });
    mockCreateClient.mockReturnValue(svcClient);

    const res = await POST(makePaidRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true });

    // Verify from() was called for both payments and signups updates
    expect(svcClient.from).toHaveBeenCalledWith("payments");
    expect(svcClient.from).toHaveBeenCalledWith("signups");
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it("TC-7.5 ignores duplicate event (idempotency)", async () => {
    const svcClient = makeServiceClient({
      webhook_events: [{ data: { id: EVENT_ID } }], // event already exists
    });
    mockCreateClient.mockReturnValue(svcClient);

    const res = await POST(makePaidRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true });

    // Should stop early — payments and signups never touched
    expect(svcClient.from).not.toHaveBeenCalledWith("payments_paymongo");
    expect(svcClient.from).not.toHaveBeenCalledWith("payments");
  });

  // ── Unknown link ──────────────────────────────────────────────────────────

  it("TC-7.6 returns 404 when link ID not found in payments_paymongo", async () => {
    setupServiceClient({
      webhook_events:   [{ data: null }, { data: null }],
      payments_paymongo: { data: null }, // not found
    });

    const res = await POST(makePaidRequest());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Payment record not found." });
  });

  // ── Live signature (li= header) ───────────────────────────────────────────

  it("TC-7.7 accepts live signature (li= prefix)", async () => {
    setupServiceClient({
      webhook_events:   [{ data: null }, { data: null }],
      payments_paymongo: { data: PM_ROW },
      payments:         [{ data: PAYMENT_ROW }, { data: null }],
      signups:          { data: null },
    });

    const payload = buildPayload("link.payment.paid", LINK_ID);
    const raw     = JSON.stringify(payload);
    const ts      = "1700000000";
    const hmac    = createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");
    const liveSig = `t=${ts},li=${hmac}`;

    const res = await POST(makeRequest(payload, liveSig));
    expect(res.status).toBe(200);
  });
});
