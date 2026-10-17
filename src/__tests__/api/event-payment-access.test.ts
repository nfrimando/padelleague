import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServiceClient, makeUserClient } from "@/__tests__/helpers/supabase-mock";
vi.mock("@/app/api/_lib/supabase", () => ({ getServerUserClient: vi.fn(), getServerServiceClient: vi.fn() }));
import { getServerUserClient, getServerServiceClient } from "@/app/api/_lib/supabase";
import { POST } from "@/app/api/payments/create-link/route";
const request = () => new Request("http://localhost/api/payments/create-link", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify({ signup_id: "signup", return_to: "/events/17" }) });
function configure(status: string, paid = false, paymentRequired = true) {
  const client = makeServiceClient({
    players: { data: { player_id: 38 } },
    signups_events: { data: { id: "signup", player_id: 38, event_id: 17, status } },
    events: { data: { event_id: 17, name: "Duo Cup", registration_fee: 1000, requires_payment: paymentRequired, payment_lock_enabled: true } },
    payments: [{ data: paid ? [{ id: "paid" }] : [] }, { data: null }, { data: { id: "payment" } }],
  });
  vi.mocked(getServerServiceClient).mockReturnValue(client as never);
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerUserClient).mockReturnValue(makeUserClient({ email: "player@example.test" }) as never);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "link", attributes: { checkout_url: "https://pay.example.test" } } }) }));
});
describe("payment links for registered participants", () => {
  it.each(["applied", "accepted", "pending_payment"])("allows an unpaid %s participant to pay", async status => {
    configure(status);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ link_url: "https://pay.example.test" });
  });
  it("prevents duplicate checkout after confirmed payment", async () => {
    configure("accepted", true);
    expect((await POST(request())).status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["waitlisted", "cancelled"])("does not charge %s participants", async status => {
    configure(status);
    expect((await POST(request())).status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["accepted", "pending_payment", "applied"])("does not charge %s players at free events", async status => {
    configure(status, false, false);
    expect((await POST(request())).status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });
});
