import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeServiceClient } from "@/__tests__/helpers/supabase-mock";
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("@/app/api/_lib/supabase", () => ({ getServerUserClient: vi.fn(), getServerServiceClient: vi.fn() }));
import { createClient } from "@supabase/supabase-js";
import { getServerUserClient, getServerServiceClient } from "@/app/api/_lib/supabase";
import { GET, PATCH } from "@/app/api/events/[id]/inside/route";
const params = { params: Promise.resolve({ id: "17" }) };
const locked = { found: true, canManage: false, registered: true, paid: false, canViewInside: false };
const req = (method = "GET", body?: object) => new Request("http://localhost/api/events/17/inside", { method, headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
let client: ReturnType<typeof makeServiceClient> & { rpc: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.clearAllMocks();
  client = { ...makeServiceClient(), rpc: vi.fn().mockResolvedValue({ data: locked, error: null }) };
  vi.mocked(createClient).mockReturnValue(client as never);
  vi.mocked(getServerUserClient).mockReturnValue(client as never);
});
describe("inside event API", () => {
  it("returns only access for an unpaid registered player, without querying protected tables", async () => {
    const response = await GET(req(), params);
    expect(await response.json()).toEqual({ access: locked });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(client.from).not.toHaveBeenCalled();
  });
  it("keeps anonymous viewers locked", async () => {
    const response = await GET(new Request("http://localhost/api/events/17/inside"), params);
    expect(response.status).toBe(200);
    expect(createClient).toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });
  it("reads private information using the paid viewer's database permissions", async () => {
    client = { ...makeServiceClient({ event_private_details: { data: { information: "Private court info" } }, event_division_teams: { data: [{ id: "team" }] }, matches: { data: [] } }), rpc: vi.fn().mockResolvedValue({ data: { ...locked, paid: true, canViewInside: true }, error: null }) };
    vi.mocked(getServerUserClient).mockReturnValue(client as never);
    const response = await GET(req(), params);
    expect(await response.json()).toMatchObject({ details: { information: "Private court info" }, teams: [{ id: "team" }] });
    expect(getServerServiceClient).not.toHaveBeenCalled();
  });
  it("fails closed if access verification fails", async () => {
    client.rpc.mockResolvedValue({ data: null, error: { message: "Database unavailable" } });
    const response = await GET(req(), params);
    expect(response.status).toBe(500);
    expect(client.from).not.toHaveBeenCalled();
  });
  it("returns 404 for hidden/missing events", async () => {
    client.rpc.mockResolvedValue({ data: { found: false }, error: null });
    expect((await GET(req(), params)).status).toBe(404);
  });
  it.each(["17abc", "0", "-1"])("rejects invalid ID %s", async id => {
    expect((await GET(req(), { params: Promise.resolve({ id }) })).status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("rejects edits from paid non-managers", async () => {
    client.rpc.mockResolvedValue({ data: { ...locked, paid: true, canViewInside: true }, error: null });
    expect((await PATCH(req("PATCH", { information: "Forged", event_url: "" }), params)).status).toBe(403);
    expect(getServerServiceClient).not.toHaveBeenCalled();
  });
  it("rejects unsafe links before any write", async () => {
    client.rpc.mockResolvedValue({ data: { ...locked, canManage: true }, error: null });
    expect((await PATCH(req("PATCH", { information: "Info", event_url: "javascript:alert(1)" }), params)).status).toBe(400);
    expect(getServerServiceClient).not.toHaveBeenCalled();
  });
  it("saves manager edits to the private table", async () => {
    client.rpc.mockResolvedValue({ data: { ...locked, canManage: true }, error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    vi.mocked(getServerServiceClient).mockReturnValue({ from } as never);
    expect((await PATCH(req("PATCH", { information: "Inside", event_url: "https://example.test" }), params)).status).toBe(200);
    expect(from).toHaveBeenCalledWith("event_private_details");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ event_id: 17, information: "Inside" }));
  });
});
