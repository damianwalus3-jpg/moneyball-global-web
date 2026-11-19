/**
 * Server-only APIFootball.com API v3 client.
 *
 * IMPORTANT: APIFootball authenticates with APIkey in the query string.
 * Never call this module from browser code and never log request URLs,
 * because URLs contain the credential.
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
  if (!apiKey) throw new Error("APIFOOTBALL_API_KEY is required");

  const baseUrl = options.baseUrl ?? "https://apiv3.apifootball.com/";
  const timeoutMs = options.timeoutMs ?? 15_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  const request = async <T = unknown>(
    action: string,
    params: ApiFootballParams = {},
  ): Promise<T> => {
    const url = new URL(baseUrl);
    url.searchParams.set("action", action);
    url.searchParams.set("APIkey", apiKey);

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
        headers: { accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });

      const body = await response.text();
      let payload: unknown;
      try {
        payload = body ? JSON.parse(body) : null;
      } catch {
        throw new ApiFootballError("APIFootball returned non-JSON content", response.status);
      }

      if (!response.ok) {
        throw new ApiFootballError("APIFootball request failed", response.status, payload);
      }
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const record = payload as Record<string, unknown>;
        if (record.error || record.message === "Error") {
          throw new ApiFootballError("APIFootball reported an API error", response.status, payload);
        }
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiFootballError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiFootballError("APIFootball request timed out");
      }
      throw new ApiFootballError("APIFootball network request failed");
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    getCountries: () => request<unknown[]>("get_countries"),
    getLeagues: (countryId?: string | number) =>
      request<unknown[]>("get_leagues", { country_id: countryId }),
    getEvents: (from: string, to: string, extra: ApiFootballParams = {}) =>
      request<unknown[]>("get_events", { from, to, timezone: "Europe/Brussels", ...extra }),
    getOdds: (from: string, to: string, matchId?: string | number) =>
      request<unknown[]>("get_odds", { from, to, match_id: matchId }),
    getStandings: (leagueId: string | number) =>
      request<unknown[]>("get_standings", { league_id: leagueId }),
    getTeams: (leagueId: string | number) =>
      request<unknown[]>("get_teams", { league_id: leagueId }),
    getHeadToHead: (firstTeamId: string | number, secondTeamId: string | number) =>
      request<unknown>("get_H2H", { firstTeamId, secondTeamId, timezone: "Europe/Brussels" }),
    getPredictions: (matchId: string | number) =>
      request<unknown>("get_predictions", { match_id: matchId }),
    getStatistics: (matchId: string | number) =>
      request<unknown>("get_statistics", { match_id: matchId }),
  };
}
