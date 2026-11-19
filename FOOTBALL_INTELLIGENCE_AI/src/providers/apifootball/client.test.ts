import { describe, expect, it, vi } from "vitest";
import { ApiFootballError, createApiFootballClient } from "./client";

describe("APIFootball v3 client", () => {
  it("requires a server-side API key", () => {
    expect(() => createApiFootballClient({ apiKey: " " })).toThrow(
      "APIFOOTBALL_API_KEY is required",
    );
  });

  it("calls the documented v3 endpoint with the requested action and timezone", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([{ match_id: "123" }]), { status: 200 }),
    );
    const client = createApiFootballClient({
      apiKey: "test-secret",
      fetchImpl: fetchMock,
    });

    const result = await client.getEvents("2026-11-19", "2026-11-19");

    expect(result).toEqual([{ match_id: "123" }]);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://apiv3.apifootball.com/",
    );
    expect(requestedUrl.searchParams.get("action")).toBe("get_events");
    expect(requestedUrl.searchParams.get("timezone")).toBe("Europe/Brussels");
    expect(requestedUrl.searchParams.get("APIkey")).toBe("test-secret");
  });

  it("turns provider HTTP errors into a typed error without exposing the URL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401 }),
    );
    const client = createApiFootballClient({
      apiKey: "test-secret",
      fetchImpl: fetchMock,
    });

    await expect(client.getCountries()).rejects.toMatchObject({
      name: "ApiFootballError",
      status: 401,
    } satisfies Partial<ApiFootballError>);
  });
});
