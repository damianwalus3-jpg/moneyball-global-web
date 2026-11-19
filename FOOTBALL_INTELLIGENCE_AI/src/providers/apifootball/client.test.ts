import { describe, expect, it, vi } from "vitest";
import { ApiFootballError, createApiFootballClient } from "./client";

describe("API-SPORTS API-FOOTBALL v3 client", () => {
  it("requires a server-side API key", () => {
    expect(() => createApiFootballClient({ apiKey: " " })).toThrow(
      "API_FOOTBALL_API_KEY is required",
    );
  });

  it("uses the API-SPORTS v3 base URL and x-apisports-key header", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ response: [{ fixture: { id: 123 } }] }), { status: 200 }),
    );
    const client = createApiFootballClient({ apiKey: "test-secret", fetchImpl: fetchMock });
    const result = await client.getFixtures({ date: "2026-11-19" });

    expect(result).toEqual({ response: [{ fixture: { id: 123 } }] });
    const [input, init] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(input));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://v3.football.api-sports.io/fixtures",
    );
    expect(requestedUrl.searchParams.get("date")).toBe("2026-11-19");
    expect(requestedUrl.searchParams.get("timezone")).toBe("Europe/Brussels");
    expect(new Headers(init?.headers).get("x-apisports-key")).toBe("test-secret");
    expect(requestedUrl.search).toBe("");
  });

  it("exposes account status endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ response: { subscription: { plan: "Pro" } } }), { status: 200 }),
    );
    const client = createApiFootballClient({ apiKey: "test-secret", fetchImpl: fetchMock });
    await client.getStatus();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://v3.football.api-sports.io/status",
    );
  });

  it("turns provider HTTP errors into a typed error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ errors: { token: "Invalid API key" } }), { status: 401 }),
    );
    const client = createApiFootballClient({ apiKey: "test-secret", fetchImpl: fetchMock });
    await expect(client.getCountries()).rejects.toMatchObject({
      name: "ApiFootballError",
      status: 401,
    } satisfies Partial<ApiFootballError>);
  });
});
