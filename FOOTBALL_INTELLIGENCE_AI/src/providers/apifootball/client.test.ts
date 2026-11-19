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

  it("reads the free status endpoint without adding credentials to the URL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        response: { subscription: { plan: "Pro", active: true }, requests: { current: 670, limit_day: 7500 } },
      }), { status: 200 }),
    );
    const client = createApiFootballClient({ apiKey: "test-secret", fetchImpl: fetchMock });
    const result = await client.getStatus();

    expect(result.response.requests?.limit_day).toBe(7500);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://v3.football.api-sports.io/status",
    );
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("x-apisports-key")).toBe("test-secret");
  });

  it("defaults league discovery to current competitions", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ response: [] }), { status: 200 }),
    );
    const client = createApiFootballClient({ apiKey: "test-secret", fetchImpl: fetchMock });
    await client.getLeagues();
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe("/leagues");
    expect(requestedUrl.searchParams.get("current")).toBe("true");
  });

  it("captures daily and per-minute rate-limit headers", async () => {
    const onRateLimits = vi.fn();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ response: [] }), {
        status: 200,
        headers: {
          "x-ratelimit-requests-limit": "7500",
          "x-ratelimit-requests-remaining": "6830",
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Remaining": "8",
        },
      }),
    );
    const client = createApiFootballClient({
      apiKey: "test-secret",
      fetchImpl: fetchMock,
      onRateLimits,
    });
    await client.getCountries();

    expect(onRateLimits).toHaveBeenCalledWith({
      dailyLimit: 7500,
      dailyRemaining: 6830,
      minuteLimit: 10,
      minuteRemaining: 8,
    }, "countries");
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
