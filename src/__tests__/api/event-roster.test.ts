import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServiceClient } from "@/__tests__/helpers/supabase-mock";
vi.mock("@/app/api/_lib/supabase", () => ({ getServerServiceClient: vi.fn() }));
vi.mock("@/app/api/events/_lib/auth", () => ({ resolveCallerPlayerId: vi.fn(), isAdminUser: vi.fn() }));
vi.mock("@/lib/ratingLedger", () => ({ fetchLatestRatingsByPlayerIds: vi.fn().mockResolvedValue(new Map()) }));
vi.mock("@/app/api/events/_lib/pairs", () => ({ loadPlayers: vi.fn().mockResolvedValue(new Map()) }));
import { getServerServiceClient } from "@/app/api/_lib/supabase";
import { resolveCallerPlayerId, isAdminUser } from "@/app/api/events/_lib/auth";
import { GET } from "@/app/api/events/[id]/signups/route";
const params = { params: Promise.resolve({ id: "17" }) };
const request = () => new Request("http://localhost/api/events/17/signups", { headers: { Authorization: "Bearer test-token" } });
function configure(status: string | null, visible = false) {
  const client = makeServiceClient({
    events: { data: { event_id: 17, visibility: "published", signup_list_visible: visible, signup_mode: "paired", requires_payment: true, created_by_player_id: null } },
    event_signup_pairs: { data: [{ id: "pair", status: "accepted", initiator_player_id: 42, invitee_player_id: 43 }] },
    signups_events: [
      { data: status ? { id: "signup", status, pair_id: "pair", looking_for_partner: false } : null },
      { data: [{ player_id: 42, pair_id: "pair", player: { name: "Player A" } }, { player_id: 43, pair_id: "pair", player: { name: "Player B" } }] },
    ],
  });
  vi.mocked(getServerServiceClient).mockReturnValue(client as never);
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveCallerPlayerId).mockResolvedValue(42);
  vi.mocked(isAdminUser).mockResolvedValue(false);
});
describe("participant visibility before payment", () => {
  it.each(["pending_payment", "applied", "accepted", "waitlisted"])("shows participants to %s registrants even when the public list is hidden", async status => {
    const client = configure(status);
    const response = await GET(request(), params);
    const json = await response.json();
    expect(json.signupListVisible).toBe(true);
    expect(json.roster).toHaveLength(2);
    expect(json.roster.map((p: { pair_id: string | null }) => p.pair_id)).toEqual([null, null]);
    expect(client.from.mock.results[3].value.in).toHaveBeenCalledWith("status", ["applied", "pending_payment", "accepted", "waitlisted"]);
  });
  it.each(["cancelled", null])("keeps a hidden list private for nonregistrants (%s)", async status => {
    configure(status);
    expect(await (await GET(request(), params)).json()).toMatchObject({ hidden: true, roster: [] });
  });
  it("shows anonymous visitors only accepted participants when public visibility is enabled", async () => {
    vi.mocked(resolveCallerPlayerId).mockResolvedValue(null);
    const client = makeServiceClient({
      events: { data: { event_id: 17, visibility: "published", signup_list_visible: true } },
      event_signup_pairs: { data: [] },
      signups_events: { data: [{ player_id: 42, pair_id: "pair", player: { name: "Player A" } }] },
    });
    vi.mocked(getServerServiceClient).mockReturnValue(client as never);
    const json = await (await GET(request(), params)).json();
    expect(json.roster[0].pair_id).toBe(null);
    expect(client.from.mock.results[2].value.in).toHaveBeenCalledWith("status", ["accepted"]);
  });
});
