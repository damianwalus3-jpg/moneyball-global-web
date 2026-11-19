/**
 * Server-only API-SPORTS API-FOOTBALL v3 client.
 * Never expose API_FOOTBALL_API_KEY to browser code or log request headers.
 */
export type ApiFootballParams = Record<string, string | number | boolean | undefined>;

export class ApiFootballError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly providerPayload?: unknown,
  ) {
    super(message);
    this.name = "ApiFootballError";
  }
}

export interface ApiFootballClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createApiFootballClient(options: ApiFootballClientOptions) {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error("API_FOOTBALL_API_KEY is required");

  const baseUrl = (options.baseUrl ?? "https://v3.football.api-sports.io").replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 15_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  const request = async <T = unknown>(
    path: string,
    params: ApiFootballParams = {},
  ): Promise<T> => {
    const url = new URL(`${baseUrl}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json", "x-apisports-key": apiKey },
        signal: controller.signal,
        cache: "no-store",
      });
      const body = await response.text();
      let payload: unknown;
      try {
        payload = body ? JSON.parse(body) : null;
      } catch {
        throw new ApiFootballError("API-SPORTS returned non-JSON content", response.status);
      }
      if (!response.ok) {
        throw new ApiFootballError("API-SPORTS request failed", response.status, payload);
      }
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const record = payload as Record<string, unknown>;
        if (Array.isArray(record.errors) && record.errors.length > 0) {
          throw new ApiFootballError("API-SPORTS reported an API error", response.status, payload);
        }
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiFootballError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiFootballError("API-SPORTS request timed out");
      }
      throw new ApiFootballError("API-SPORTS network request failed");
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    getStatus: () => request("status"),
    getCountries: (params: ApiFootballParams = {}) => request("countries", params),
    getLeagues: (params: ApiFootballParams = {}) => request("leagues", params),
    getFixtures: (params: ApiFootballParams = {}) =>
      request("fixtures", { timezone: "Europe/Brussels", ...params }),
    getTeams: (params: ApiFootballParams = {}) => request("teams", params),
    getStandings: (params: ApiFootballParams = {}) => request("standings", params),
    getFixtureStatistics: (params: ApiFootballParams = {}) => request("fixtures/statistics", params),
    getOdds: (params: ApiFootballParams = {}) => request("odds", params),
    getPredictions: (params: ApiFootballParams = {}) => request("predictions", params),
    getInjuries: (params: ApiFootballParams = {}) => request("injuries", params),
    getLineups: (params: ApiFootballParams = {}) => request("fixtures/lineups", params),
  };
}
