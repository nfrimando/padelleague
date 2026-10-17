import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServiceClient } from "@/__tests__/helpers/supabase-mock";
vi.mock("@/app/api/_lib/supabase", () => ({ getServerServiceClient: vi.fn() }));
vi.mock("@/lib/email/notifications/paymentCompleted", () => ({ notifyPaymentCompleted: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email/notifications/signupPaidConfirmed", () => ({ notifySignupPaidConfirmed: vi.fn().mockResolvedValue(undefined) }));
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { notifySignupPaidConfirmed } from "@/lib/email/notifications/signupPaidConfirmed";
import { POST } from "@/app/api/payments/webhook/route";
function request(validSignature = true) {
  const body = JSON.stringify({ data: { attributes: { type: "link.payment.paid", data: { id: "link" } } } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", process.env.PAYMONGO_WEBHOOK_SECRET!).update(`${timestamp}.${body}`).digest("hex");
  return new Request("http://localhost/api/payments/webhook", { method: "POST", body, headers: { "paymongo-signature": `t=${timestamp},te=${validSignature ? signature : "invalid"}` } });
}
beforeEach(() => { vi.clearAllMocks(); });
describe("confirmed payment access", () => {
  it.each([true, false])("confirms only an active signup (active=%s)", async active => {
    const client = makeServiceClient({
      payments_paymongo: [{ data: { id: "provider", payment_id: "payment" } }, {}],
      payments: { data: { signup_id: "signup", player_id: 38, event_id: 17, amount: 1000, method: "paymongo" } },
      signups_events: { data: active ? { id: "signup" } : null },
      players: { data: { email: "player@example.test", name: "Derrick" } },
      events: { data: { name: "Duo Cup" } },
    });
    vi.mocked(getServerServiceClient).mockReturnValue(client as never);
    expect((await POST(request())).status).toBe(200);
    const signupBuilder = client.from.mock.results[3].value;
    expect(signupBuilder.in).toHaveBeenCalledWith("status", ["applied", "pending_payment", "accepted"]);
    expect(notifySignupPaidConfirmed).toHaveBeenCalledTimes(active ? 1 : 0);
  });
  it("does not grant access from a forged callback", async () => {
    expect((await POST(request(false))).status).toBe(400);
    expect(getServerServiceClient).not.toHaveBeenCalled();
  });
});
