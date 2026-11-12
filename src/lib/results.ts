import { requireSupabase } from "./supabase";
import { readConfig } from "./config";

export interface ResultsSyncResponse {
  ok?: boolean;
  dates?: string[];
  fixtures_fetched?: number;
  matches_matched?: number;
  matched_by_external_id?: number;
  matched_by_team_names?: number;
  results_saved?: number;
  predictions_settled?: number;
  coupon_legs_settled?: number;
  alternate_results_fetched?: number;
  alternate_results_matched?: number;
  errors?: string[];
}

export async function syncResults(days = 7): Promise<ResultsSyncResponse> {
  const client = requireSupabase();
  const config = readConfig();
  if (!config) throw new Error("Brak konfiguracji Supabase. Otwórz Ustawienia i sprawdź połączenie.");

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error("Nie udało się odczytać sesji: " + sessionError.message);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sesja wygasła. Zaloguj się ponownie.");

  const span = Math.max(1, Math.min(7, Math.floor(days)));
  const endpoint =
    config.url.replace(/\/$/, "") +
    "/functions/v1/moneyball-results-sync?days=" +
    String(span);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error("Połączenie z synchronizacją wyników zostało przerwane. " + detail);
  }

  const raw = await response.text();
  let data: ResultsSyncResponse | null = null;
  try {
    data = raw ? (JSON.parse(raw) as ResultsSyncResponse) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = (data as any)?.error || (data as any)?.message || raw || `HTTP ${response.status}`;
    throw new Error(`Synchronizacja wyników: ${detail}`);
  }
  if (!data || data.ok === false) {
    const details = Array.isArray(data?.errors) ? data.errors.join("; ") : "Synchronizacja wyników zgłosiła błąd.";
    throw new Error(details);
  }
  return data;
}
