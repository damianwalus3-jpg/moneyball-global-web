/**
 * Server-only API-SPORTS API-FOOTBALL v3 client.
 * Never expose API_FOOTBALL_API_KEY to browser code or log request headers.
 */
export type ApiFootballParams = Record<string, string | number | boolean | undefined>;

export interface ApiFootballRateLimits {
  dailyLimit: number | null;
  dailyRemaining: number | null;
  minuteLimit: number | null;
  minuteRemaining: number | null;
}

export interface ApiFootballResponse<T = unknown> {
  get?: string;
  parameters?: Record<string, string>;
  errors?: unknown[] | Record<string, unknown>;
  results?: number;
  paging?: { current: number; total: number };
  response: T;
}

export interface ApiFootballStatus {
  account?: { firstname?: string; lastname?: string; email?: string };
  subscription?: { plan?: string; end?: string; active?: boolean };
  requests?: { current?: number; limit_day?: number };
}

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
  onRateLimits?: (limits: ApiFootballRateLimits, endpoint: string) => void;
}

function safeProviderErrorKeys(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const errors = (payload as Record<string, unknown>).errors;
  if (!errors || typeof errors !== "object") return [];
  const keys = Array.isArray(errors) ? errors.map((_, index) => `item_${index + 1}`) : Object.keys(errors as Record<string, unknown>);
  return keys.filter((key) => /^[a-z][a-z0-9_]{0,30}$/i.test(key)).slice(0, 8).sort();
}
function readLimit(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
    const endpoint = path.replace(/^\//, "");
    const url = new URL(`${baseUrl}/${endpoint}`);
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

      options.onRateLimits?.({
        dailyLimit: readLimit(response.headers, "x-ratelimit-requests-limit"),
        dailyRemaining: readLimit(response.headers, "x-ratelimit-requests-remaining"),
        minuteLimit: readLimit(response.headers, "X-RateLimit-Limit"),
        minuteRemaining: readLimit(response.headers, "X-RateLimit-Remaining"),
      }, endpoint);

      const body = await response.text();
      let payload: unknown;
      try {
        payload = body ? JSON.parse(body) : null;
      } catch {
        throw new ApiFootballError("API-SPORTS returned non-JSON content", response.status);
      }
      if (!response.ok) {
        const keys = safeProviderErrorKeys(payload);
        const category = keys.length ? ` (${keys.join(",")})` : "";
        throw new ApiFootballError(`API-SPORTS HTTP ${response.status}${category}`, response.status, payload);
      }
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const record = payload as Record<string, unknown>;
        const errors = record.errors;
        const hasErrors = Array.isArray(errors)
          ? errors.length > 0
          : Boolean(errors && typeof errors === "object" && Object.keys(errors).length > 0);
        if (hasErrors) {
          const keys = safeProviderErrorKeys(payload);
          const category = keys.length ? ` (${keys.join(",")})` : "";
          throw new ApiFootballError(`API-SPORTS provider error${category}`, response.status, payload);
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
    getStatus: () => request<ApiFootballResponse<ApiFootballStatus>>("status"),
    getCountries: (params: ApiFootballParams = {}) =>
      request<ApiFootballResponse>("countries", params),
    // The provider requires at least one filter; current=true discovers active competitions.
    getLeagues: (params: ApiFootballParams = {}) =>
      request<ApiFootballResponse>("leagues", { current: "true", ...params }),
    getSeasons: () => request<ApiFootballResponse<number[]>>("leagues/seasons"),
    getFixtures: (params: ApiFootballParams = {}) =>
      request<ApiFootballResponse>("fixtures", { timezone: "Europe/Brussels", ...params }),
    getTeams: (params: ApiFootballParams = {}) => request<ApiFootballResponse>("teams", params),
    getStandings: (params: ApiFootballParams = {}) =>
      request<ApiFootballResponse>("standings", params),
    getFixtureStatistics: (params: ApiFootballParams = {}) =>
      request<ApiFootballResponse>("fixtures/statistics", params),
    getOdds: (params: ApiFootballParams = {}) =>
      request<ApiFootballResponse>("odds", { timezone: "Europe/Brussels", ...params }),
    getPredictions: (fixture: number | string) =>
      request<ApiFootballResponse>("predictions", { fixture }),
    getInjuries: (params: ApiFootballParams = {}) =>
      request<ApiFootballResponse>("injuries", { timezone: "Europe/Brussels", ...params }),
    getLineups: (fixture: number | string) =>
      request<ApiFootballResponse>("fixtures/lineups", { fixture }),
  };
}
