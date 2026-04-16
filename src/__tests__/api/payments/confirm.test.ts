import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeUserClient, makeServiceClient } from "../../helpers/supabase-mock";

// ─── Mock before importing route ──────────────────────────────────────────────

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mockCreateClient }));

import { POST } from "@/app/api/payments/confirm/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PLAYER          = { player_id: 161 };
const PENDING_SIGNUP  = { id: "signup-uuid", season_id: 1, status: "pending_payment" };
const PAYMENT_ROW     = { payment_id: "pay-uuid", status: "pending" };
const PM_ROW          = { paymongo_payment_intent_id: "link_abc123" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(token = "Bearer valid-token") {
  return new Request("http://localhost:3000/api/payments/confirm", {
    method: "POST",
    headers: { Authorization: token },
  });
}

function setupClients(user: unknown, tables: Record<string, unknown>) {
  mockCreateClient.mockImplementation((_url: string, key: string) => {
    if (key === "test-anon-key") return makeUserClient(user);
    return makeServiceClient(tables as never);
  });
}

function mockPayMongoStatus(status: string | null) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status !== null,
    json: () =>
      Promise.resolve(
        status ? { data: { attributes: { status } } } : {},
      ),
  } as Response);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/payments/confirm", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("TC-6.1 returns 401 when no auth header", async () => {
    const req = new Request("http://localhost/api/payments/confirm", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // ── Player lookup ─────────────────────────────────────────────────────────

  it("TC-6.2 returns 404 when player not found", async () => {
    setupClients({ id: "u1", email: "unknown@example.com" }, {
      players: { data: null },
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Player not found." });
  });

  // ── No pending signup ─────────────────────────────────────────────────────

  it("TC-6.3 returns 404 status:not_found when no pending signup", async () => {
    setupClients({ id: "u1", email: "robin@example.com" }, {
      players: { data: PLAYER },
      signups: [{ data: null }, { data: null }], // pending_payment query, then registered query
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ status: "not_found" });
  });

  // ── Already registered ────────────────────────────────────────────────────

  it("TC-6.4 returns registered when webhook already confirmed signup", async () => {
    setupClients({ id: "u1", email: "robin@example.com" }, {
      players: { data: PLAYER },
      signups: [
        { data: null },                                        // pending_payment → none
        { data: { id: "signup-id", status: "registered" } },  // registered → found
      ],
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "registered" });
  });

  // ── PayMongo says paid ────────────────────────────────────────────────────

  it("TC-6.5 confirms signup when PayMongo link is paid", async () => {
    mockPayMongoStatus("paid");

    setupClients({ id: "u1", email: "robin@example.com" }, {
      players:          { data: PLAYER },
      signups:          [{ data: PENDING_SIGNUP }, { data: null }], // pending + update
      payments:         [{ data: PAYMENT_ROW }, { data: null }],    // find + update
      payments_paymongo: { data: PM_ROW },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("registered");
    expect(json.signup_id).toBe(PENDING_SIGNUP.id);

    // PayMongo API was called with the correct link ID
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.paymongo.com/v1/links/${PM_ROW.paymongo_payment_intent_id}`,
      expect.any(Object),
    );
  });

  // ── PayMongo says not paid ────────────────────────────────────────────────

  it("TC-6.6 returns pending when PayMongo link is unpaid", async () => {
    mockPayMongoStatus("unpaid");

    setupClients({ id: "u1", email: "robin@example.com" }, {
      players:          { data: PLAYER },
      signups:          { data: PENDING_SIGNUP },
      payments:         { data: PAYMENT_ROW },
      payments_paymongo: { data: PM_ROW },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "unpaid" });
  });

  // ── No payment record ─────────────────────────────────────────────────────

  it("TC-6.7 returns pending when no payment record found", async () => {
    setupClients({ id: "u1", email: "robin@example.com" }, {
      players: { data: PLAYER },
      signups: { data: PENDING_SIGNUP },
      payments: { data: null },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "pending" });
  });

  // ── Payment already marked paid (webhook raced) ───────────────────────────

  it("TC-6.8 confirms signup immediately when payment is already paid in DB", async () => {
    setupClients({ id: "u1", email: "robin@example.com" }, {
      players:  { data: PLAYER },
      signups:  [{ data: PENDING_SIGNUP }, { data: null }], // find + update
      payments: { data: { ...PAYMENT_ROW, status: "paid" } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "registered" });

    // Should NOT call PayMongo since payment is already paid in DB
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
