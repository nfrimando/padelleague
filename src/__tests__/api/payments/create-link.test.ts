import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeUserClient, makeServiceClient } from "../../helpers/supabase-mock";

// ─── Mock @supabase/supabase-js before importing the route ───────────────────
// vi.mock is hoisted, so the factory variable must be declared with vi.hoisted()

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mockCreateClient }));

// ─── Import route after mock is in place ─────────────────────────────────────

import { POST } from "@/app/api/payments/create-link/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VERIFIED_PLAYER = {
  player_id: 161,
  name: "Robin Kwee",
  email: "robin@example.com",
  is_profile_complete: true,
};

const OPEN_SEASON = {
  season_id: 1,
  registration_status: "open",
  start_date: "2026-01-01",
  end_date: "2026-06-30",
};

const PAYMENT_ROW    = { payment_id: "pay-uuid-1234" };
const SIGNUP_ROW     = { id: "signup-uuid-5678" };
const PAYMONGO_LINK  = {
  id: "link_abc123",
  attributes: { checkout_url: "https://pm.link/test", status: "unpaid" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown = { season_id: 1 }, token = "Bearer valid-token") {
  return new Request("http://localhost:3000/api/payments/create-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify(body),
  });
}

function setupClients(
  user: unknown,
  tables: Record<string, unknown>,
) {
  mockCreateClient.mockImplementation((_url: string, key: string) => {
    if (key === "test-anon-key") return makeUserClient(user);
    return makeServiceClient(tables as never);
  });
}

function mockPayMongo(ok = true, linkData = PAYMONGO_LINK) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(ok ? { data: linkData } : { errors: [{ detail: "PayMongo error" }] }),
  } as Response);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/payments/create-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayMongo();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("TC-5.1 returns 401 when Authorization header is missing", async () => {
    const req = new Request("http://localhost/api/payments/create-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ season_id: 1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Authorization") });
  });

  it("TC-5.2 returns 401 when token is invalid", async () => {
    setupClients(null, {});
    const res = await POST(makeRequest({ season_id: 1 }));
    expect(res.status).toBe(401);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("TC-5.3 returns 400 when season_id is missing", async () => {
    setupClients({ id: "user-1", email: "robin@example.com" }, {
      players: { data: VERIFIED_PLAYER },
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("season_id") });
  });

  // ── Verification gate ─────────────────────────────────────────────────────

  it("TC-5.4 returns 403 when player is pending verification", async () => {
    setupClients({ id: "user-1", email: "new@example.com" }, {
      players: { data: { ...VERIFIED_PLAYER, is_profile_complete: false } },
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.pendingVerification).toBe(true);
  });

  // ── Season gate ───────────────────────────────────────────────────────────

  it("TC-5.5 returns 404 when season is closed or not found", async () => {
    setupClients({ id: "user-1", email: "robin@example.com" }, {
      players: { data: VERIFIED_PLAYER },
      seasons: [
        { data: null },          // guaranteed columns query → not found
        { data: null },          // optional columns query
      ],
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Season not found") });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("TC-5.6 creates payment + signup and returns checkout_url", async () => {
    setupClients({ id: "user-1", email: "robin@example.com", user_metadata: { full_name: "Robin Kwee" } }, {
      players:          { data: VERIFIED_PLAYER },
      seasons:          [{ data: OPEN_SEASON }, { data: { name: "Season 11", registration_fee: 5 } }],
      signups:          [{ data: null }, { data: SIGNUP_ROW }],       // check (none) + insert
      payments:         [{ data: PAYMENT_ROW }, { data: null }],      // insert + update ref
      payments_paymongo: { data: null },                              // insert
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.checkout_url).toBe(PAYMONGO_LINK.attributes.checkout_url);

    // Verify PayMongo was called with correct amount (5 PHP = 500 centavos)
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.paymongo.com/v1/links",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.data.attributes.amount).toBe(500); // ₱5 × 100
  });

  // ── Resume pending payment ─────────────────────────────────────────────────

  it("TC-5.7 returns existing checkout_url when signup is pending_payment", async () => {
    const existingSignup   = { id: "existing-signup-id", status: "pending_payment" };
    const existingPayment  = { payment_id: "existing-pay-id" };
    const existingPmLink   = {
      raw_response: { attributes: { checkout_url: "https://pm.link/existing" } },
    };

    setupClients({ id: "user-1", email: "robin@example.com" }, {
      players:          { data: VERIFIED_PLAYER },
      seasons:          [{ data: OPEN_SEASON }, { data: null }],
      signups:          { data: existingSignup },
      payments:         { data: existingPayment },
      payments_paymongo: { data: existingPmLink },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checkout_url: "https://pm.link/existing" });

    // Must NOT call PayMongo to create a new link
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── Duplicate registration ─────────────────────────────────────────────────

  it("TC-5.8 returns 409 when player is already registered", async () => {
    setupClients({ id: "user-1", email: "robin@example.com" }, {
      players: { data: VERIFIED_PLAYER },
      seasons: [{ data: OPEN_SEASON }, { data: null }],
      signups: { data: { id: "signup-id", status: "registered" } },
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("already signed up") });
  });

  // ── New player auto-create ─────────────────────────────────────────────────

  it("TC-5.9 auto-creates player and returns 403 (pending verification)", async () => {
    const newUser = { id: "new-user-id", email: "newplayer@example.com", user_metadata: { full_name: "New Player" } };

    setupClients(newUser, {
      players: [
        { data: null },                                           // find by email → not found
        { data: { player_id: 999, name: "New Player", email: "newplayer@example.com", is_profile_complete: false } }, // inserted
      ],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ pendingVerification: true });
  });

  // ── PayMongo failure ──────────────────────────────────────────────────────

  it("TC-5.10 returns 502 when PayMongo API call fails", async () => {
    mockPayMongo(false);

    setupClients({ id: "user-1", email: "robin@example.com", user_metadata: {} }, {
      players:  { data: VERIFIED_PLAYER },
      seasons:  [{ data: OPEN_SEASON }, { data: null }],
      signups:  [{ data: null }, { data: SIGNUP_ROW }],
      payments: [{ data: PAYMENT_ROW }, { data: null }, { data: null }], // insert, update, delete (rollback)
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
  });
});
