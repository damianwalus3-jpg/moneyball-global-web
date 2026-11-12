import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtOdds, fmtPct } from "@/lib/format";
import { fmtDateTime, fmtMatchDateTime } from "@/lib/time";
import { Activity, BookOpen, CalendarClock, CircleHelp, Database, ShieldAlert, TrendingUp } from "lucide-react";
import type { Match, MatchResult, OddsSnapshot, Prediction } from "@/lib/types";

type FormLine = { w: number; d: number; l: number };
type RecentGame = { opponent: string; score: string; outcome: "W" | "D" | "L"; kickoff: string | null };
type Props = {
  match: Match | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  predictions: Prediction[];
  odds: OddsSnapshot | undefined;
  result: MatchResult | undefined;
  matches: Match[];
  results: MatchResult[];
};

function readSavedForm(notes: string | null | undefined) {
  if (!notes) return null;
  const marker = "[MONEYBALL_FORM]";
  const index = notes.indexOf(marker);
  if (index < 0) return null;
  try {
    const raw = notes.slice(index + marker.length).split(/\r?\n|\\n/)[0].trim();
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = JSON.parse(raw.replace(/\\"/g, '"').replace(/\\n/g, "")); }
    const valid = (v: unknown): v is FormLine => !!v && typeof v === "object" &&
      ["w", "d", "l"].every((k) => Number.isFinite(Number((v as Record<string, unknown>)[k]))) &&
      Number((v as Record<string, unknown>).w) + Number((v as Record<string, unknown>).d) + Number((v as Record<string, unknown>).l) === 5;
    if (!valid(parsed.home) || !valid(parsed.away)) return null;
    return { home: parsed.home as FormLine, away: parsed.away as FormLine, fetchedAt: parsed.fetched_at as string | undefined };
  } catch { return null; }
}

function recentFor(team: string, current: Match, matches: Match[], results: MatchResult[]): RecentGame[] {
  const byId = new Map(results.filter((r) => r.verified === true).map((r) => [r.match_id, r]));
  const currentTime = current.kickoff_at ? new Date(current.kickoff_at).getTime()
    : current.kickoff_date ? new Date(current.kickoff_date.slice(0,10) + "T00:00:00Z").getTime() : null;
  return matches
    .filter((m) => {
      const matchTime = m.kickoff_at ? new Date(m.kickoff_at).getTime()
        : m.kickoff_date ? new Date(m.kickoff_date.slice(0,10) + "T00:00:00Z").getTime() : null;
      return m.id !== current.id && currentTime !== null && matchTime !== null && matchTime < currentTime &&
        (m.home_team === team || m.away_team === team) && byId.has(m.id);
    })
    .map((m) => {
      const r = byId.get(m.id)!;
      const hg = Number(r.home_goals ?? (r as any).home_score);
      const ag = Number(r.away_goals ?? (r as any).away_score);
      const home = m.home_team === team;
      const gf = home ? hg : ag;
      const ga = home ? ag : hg;
      return { opponent: home ? String(m.away_team) : String(m.home_team), score: home ? `${hg}:${ag}` : `${ag}:${hg}`, outcome: gf > ga ? "W" as const : gf === ga ? "D" as const : "L" as const, kickoff: m.kickoff_at ?? m.kickoff_date ?? null };
    })
    .sort((a, b) => new Date(b.kickoff ?? 0).getTime() - new Date(a.kickoff ?? 0).getTime())
    .slice(0, 10);
}

const sourceLabel = (source: string | null | undefined) => {
  if (!source) return "Źródło nieopisane";
  if (source === "BEYONDELO_ELO_ONLY") return "BeyondELO · rating Elo bez pełnej historii formy";
  const hasElo = source.includes("+BEYONDELO_ELO");
  const hasXg = source.includes("+HISTORICAL_XG");
  const xgProviders = [
    source.includes("+OPENPLAY_XG") ? "OpenPlay" : null,
    source.includes("+STATSBOMB_XG") ? "StatsBomb" : null,
  ].filter(Boolean);
  const base = source.replace(/\+(BEYONDELO_ELO|HISTORICAL_XG|OPENPLAY_XG|STATSBOMB_XG)/g, "");
  const decorate = (label: string) =>
    label +
    (hasElo ? " + rating Elo" : "") +
    (hasXg ? ` + historyczne xG (${xgProviders.length ? xgProviders.join(" + ") : "źródło publiczne"})` : "");
  if (base === "KEYLESS_GITHUB_LAST10_FORM" || base === "GITHUB_PUBLIC_LAST10_FORM") return decorate("GitHub · OpenMatchday + OpenFootball JSON/text · ostatnie 10 spotkań");
  if (base === "STATSBOMB_OPEN_DATA_FORM") return decorate("StatsBomb Open Data · historyczna forma wybranych rozgrywek");
  if (base === "PITCHAPI_LAST5_XG") return decorate("PitchAPI · xG/xGA i forma z ostatnich 5 spotkań");
  if (base === "OPENMATCHDAY_GITHUB_LAST5_FORM") return decorate("GitHub / OpenMatchday · forma i statystyki z 5 spotkań");
  if (base === "OPENMATCHDAY_LAST10_FORM") return decorate("OpenMatchday · wyniki i gole z ostatnich 10 spotkań");
  if (base === "ESPN_WOMEN_LAST10_FORM") return decorate("ESPN · forma kobiecych lig z dostępnych ostatnich spotkań");
  if (base === "FOOTYNOMAD_LAST5_FORM") return decorate("FootyNomad · forma ostatnich 5 spotkań");
  if (base === "MONEYBALL_VERIFIED_HISTORY") return decorate("Historia wyników MONEYBALL · wyniki zweryfikowane");
  if (base === "VERIFIED_MARKET_DATA") return "Zweryfikowane dane rynkowe";
  if (base === "NO_VERIFIED_SOURCE") return "Brak potwierdzonego źródła";
  return decorate(base);
};

function FormCard({ name, games, saved }: { name: string; games: RecentGame[]; saved?: FormLine }) {
  const form = games.map((g) => g.outcome);
  const counts = games.length ? { w: games.filter((g) => g.outcome === "W").length, d: games.filter((g) => g.outcome === "D").length, l: games.filter((g) => g.outcome === "L").length } : saved;
  return (
    <div className="rounded-xl border border-border bg-card/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-semibold">{name}</div>
        <div className="flex gap-1" aria-label="Forma ostatnich meczów">
          {form.map((v, i) => <span key={i} className={`flex size-7 items-center justify-center rounded-md text-xs font-bold ${v === "W" ? "bg-emerald-500/15 text-emerald-400" : v === "D" ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-400"}`}>{v}</span>)}
          {!form.length && saved && <><span className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-400">W {saved.w}</span><span className="rounded-md bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-300">D {saved.d}</span><span className="rounded-md bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-400">L {saved.l}</span></>}
          {!form.length && !saved && <span className="text-xs text-muted-foreground">Brak danych</span>}
        </div>
      </div>
      {counts && <div className="mb-2 text-xs text-muted-foreground">Ostatnie {counts.w + counts.d + counts.l}: {counts.w} zwycięstw · {counts.d} remisów · {counts.l} porażek</div>}
      {games.length > 0 ? <div className="space-y-1.5">{games.map((g, i) => <div key={i} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate text-muted-foreground">{g.opponent}</span><span className="num shrink-0 font-medium">{g.score}</span><span className={`w-5 text-right font-bold ${g.outcome === "W" ? "text-emerald-400" : g.outcome === "D" ? "text-amber-300" : "text-rose-400"}`}>{g.outcome}</span></div>)}</div> : <p className="text-xs text-muted-foreground">{saved ? "Forma pobrana z publicznych źródeł; bez lokalnej listy pojedynczych wyników." : "Nie znaleziono zweryfikowanych wyników w lokalnej historii."}</p>}
    </div>
  );
}

export function MatchDetailsDialog({ match, open, onOpenChange, predictions, odds, result, matches, results }: Props) {
  if (!match) return null;
  const saved = readSavedForm(match.notes);
  const homeGames = recentFor(String(match.home_team), match, matches, results);
  const awayGames = recentFor(String(match.away_team), match, matches, results);
  // In the detail card show only the newest model run; keep older versions in the database for audit/history.
  const latestVersion = [...predictions].sort((a, b) => String((b as any).created_at || "").localeCompare(String((a as any).created_at || "")))[0]?.model_version;
  const currentPredictions = latestVersion ? predictions.filter((p) => p.model_version === latestVersion) : predictions;
  const ordered = [...currentPredictions].sort((a, b) => {
    const at = a.prediction_type === "1X2" ? 0 : 1;
    const bt = b.prediction_type === "1X2" ? 0 : 1;
    return at - bt || Number(b.probability ?? -1) - Number(a.probability ?? -1);
  });
  const mainPick = ordered.find((p) => p.prediction_type === "1X2");
  const coverage = (mainPick as any)?.data_coverage ?? ordered.find((p) => (p as any).data_coverage)?.data_coverage;
  const source = (mainPick as any)?.data_source ?? ordered.find((p) => (p as any).data_source)?.data_source;
  const formLine = (v: any): FormLine | undefined => v && Number.isFinite(Number(v.w)) && Number.isFinite(Number(v.d)) && Number.isFinite(Number(v.l)) && Number(v.w)+Number(v.d)+Number(v.l)>=3 && Number(v.w)+Number(v.d)+Number(v.l)<=10 ? {w:Number(v.w),d:Number(v.d),l:Number(v.l)} : undefined;
  const homeSaved = formLine((coverage as any)?.home_form) || saved?.home;
  const awaySaved = formLine((coverage as any)?.away_form) || saved?.away;
  const rationale = (mainPick as any)?.rationale ?? (mainPick as any)?.notes ?? (mainPick as any)?.rejection_reason;
  const isNoData = source === "NO_VERIFIED_SOURCE" || source === "BEYONDELO_ELO_ONLY" || (!!coverage && (coverage as any).baseline_only === true);
  const confidence = mainPick?.confidence;
  const statusText = result ? `Wynik: ${result.home_goals ?? (result as any).home_score ?? "?"} : ${result.away_goals ?? (result as any).away_score ?? "?"}` : "Oczekuje na wynik";
  const dcPicks = ordered.filter((p) => p.prediction_type === "DC");
  const oneXtwoPicks = ordered.filter((p) => p.prediction_type === "1X2");
  const method = (coverage as any)?.method;
  const publicHistoryCoverage = (coverage as any)?.github_data_coverage;
  const showSaved = !!saved;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto border-border bg-background p-4 sm:p-6">
        <DialogHeader className="pr-7 text-left">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{match.status ?? "status nieznany"}</Badge>
            {match.gender && <Badge variant="secondary">{match.gender === "women" ? "Kobiety" : match.gender === "men" ? "Mężczyźni" : match.gender === "mixed" ? "Mieszane" : "Płeć nieustalona"}</Badge>}
          </div>
          <DialogTitle className="text-xl leading-tight sm:text-2xl">{match.home_team} – {match.away_team}</DialogTitle>
          <DialogDescription>{match.league ?? "Rozgrywki nieznane"}{match.country ? ` · ${match.country}` : ""}{match.kickoff_at || match.kickoff_date ? ` · ${fmtMatchDateTime(match.kickoff_at, match.kickoff_date)}` : ""}</DialogDescription>
        </DialogHeader>

        <section className="surface-card p-3 sm:p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="size-4 text-primary"/> Podsumowanie meczu</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Spotkanie</div><div className="mt-1 font-semibold">{match.home_team}</div><div className="text-muted-foreground">vs</div><div className="font-semibold">{match.away_team}</div></div>
            <div><div className="text-xs text-muted-foreground">Termin / status</div><div className="mt-1 font-semibold">{match.kickoff_at || match.kickoff_date ? fmtMatchDateTime(match.kickoff_at, match.kickoff_date) : "Brak terminu"}</div><div className="mt-1 text-xs text-muted-foreground">{statusText}</div></div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 font-semibold"><Activity className="size-4 text-primary"/> Forma drużyn</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormCard name={String(match.home_team)} games={homeGames} saved={homeSaved}/>
            <FormCard name={String(match.away_team)} games={awayGames} saved={awaySaved}/>
          </div>
          <p className="text-[11px] text-muted-foreground">W = wygrana, D = remis, L = porażka. Model korzysta z maksymalnie 10 ostatnich spotkań, jeśli są dostępne; karta pokazuje zweryfikowane wyniki lokalne w pierwszej kolejności.</p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 font-semibold"><TrendingUp className="size-4 text-primary"/> Prognoza MONEYBALL</div>
          {ordered.length ? (
            <div className="grid gap-2">
              {oneXtwoPicks.map((p) => <div key={p.id} className="rounded-xl border border-border bg-card/70 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">1X2 · typ {p.pick}</div><Badge variant={p.selection_status === "WYBRANY" ? "default" : "outline"}>{p.selection_status ?? "bez statusu"}</Badge></div><div className="mt-2 text-2xl font-bold num">{fmtPct(p.probability)}</div><div className="mt-1 text-xs text-muted-foreground">{p.rejection_reason || (p as any).rationale || "Typ zapisany w historii modelu."}</div></div>)}
              {dcPicks.length > 0 && <div className="rounded-xl border border-border bg-card/70 p-3"><div className="mb-2 font-semibold">Double Chance · wszystkie warianty</div><div className="grid grid-cols-3 gap-2">{dcPicks.map((p) => <div key={p.id} className="min-w-0 rounded-lg bg-secondary/70 p-2 text-center"><div className="font-bold">{p.pick}</div><div className="num mt-1 text-lg font-semibold">{fmtPct(p.probability)}</div><div className={`mt-1 text-[10px] font-semibold ${p.selection_status === "WYBRANY" ? "text-primary" : "text-muted-foreground"}`}>{p.selection_status === "WYBRANY" ? "WYBRANY" : "ODRZUCONY"}</div>{p.rejection_reason && <div className="mt-1 break-words text-left text-[10px] leading-snug text-muted-foreground">{p.rejection_reason}</div>}</div>)}</div></div>}
            </div>
          ) : <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nie ma jeszcze zapisanej prognozy dla tego meczu. Uruchom analizę, aby wygenerować typ.</div>}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 font-semibold"><Database className="size-4 text-primary"/> Dlaczego taki wybór?</div>
          <div className="rounded-xl border border-border bg-card/70 p-3 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2"><span className="font-semibold">Źródło analizy:</span><Badge variant="secondary">{sourceLabel(source)}</Badge></div>
            {rationale && <p className="leading-relaxed">{rationale}</p>}
            {mainPick?.rejection_reason && <p className="mt-2 text-warning">Powód odrzucenia: {mainPick.rejection_reason}</p>}
            {method && <p className="mt-2 text-xs text-muted-foreground">Metoda: {String(method)}</p>}
            {confidence && <p className="mt-2 text-xs text-muted-foreground">Pokrycie modelu: {confidence}%</p>}
             {(coverage as any)?.elo_used && (coverage as any)?.home_elo != null && (coverage as any)?.away_elo != null && <div className="mt-2 rounded-lg bg-secondary/60 p-3 text-xs"><div className="font-semibold">Rating Elo · BeyondELO</div><div className="mt-1 font-semibold num">Gospodarze {(coverage as any).home_elo} · Goście {(coverage as any).away_elo}</div><div className="mt-1 text-muted-foreground">Różnica {(Number((coverage as any).elo_diff) > 0 ? "+" : "")}{Number((coverage as any).elo_diff).toFixed(1)} · udział Elo {Math.round(Number((coverage as any).elo_weight || 0) * 100)}%</div><div className="mt-1 text-muted-foreground">Dane aktualne na: {String((coverage as any).elo_as_of || "brak daty")}</div></div>}
            {coverage && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs"><div className="rounded-lg bg-secondary/60 p-2"><div className="text-muted-foreground">Historia gospodarzy</div><div className="mt-1 font-semibold">{Number((coverage as any).home_matches ?? 0)} meczów</div></div><div className="rounded-lg bg-secondary/60 p-2"><div className="text-muted-foreground">Historia gości</div><div className="mt-1 font-semibold">{Number((coverage as any).away_matches ?? 0)} meczów</div></div>
              {(coverage as any).home_form?.avg_shots_for != null && <div className="rounded-lg bg-secondary/60 p-2"><div className="text-muted-foreground">Średnie strzały gospodarzy</div><div className="mt-1 font-semibold">{Number((coverage as any).home_form.avg_shots_for).toFixed(1)} / mecz</div></div>}
              {(coverage as any).away_form?.avg_shots_for != null && <div className="rounded-lg bg-secondary/60 p-2"><div className="text-muted-foreground">Średnie strzały gości</div><div className="mt-1 font-semibold">{Number((coverage as any).away_form.avg_shots_for).toFixed(1)} / mecz</div></div>}
              {(coverage as any).home_form?.avg_corners_for != null && <div className="rounded-lg bg-secondary/60 p-2"><div className="text-muted-foreground">Średnie rożne gospodarzy</div><div className="mt-1 font-semibold">{Number((coverage as any).home_form.avg_corners_for).toFixed(1)} / mecz</div></div>}
              {(coverage as any).away_form?.avg_corners_for != null && <div className="rounded-lg bg-secondary/60 p-2"><div className="text-muted-foreground">Średnie rożne gości</div><div className="mt-1 font-semibold">{Number((coverage as any).away_form.avg_corners_for).toFixed(1)} / mecz</div></div>}
            </div>}
            {publicHistoryCoverage && <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-xs">
              <div className="font-semibold">Zakres publicznej bazy historii</div>
              <div className="mt-1 text-muted-foreground">
                {Number(publicHistoryCoverage.team_names || 0).toLocaleString("pl-BE")} zespołów ·
                {Number(publicHistoryCoverage.openfootball_text_matches_read || 0).toLocaleString("pl-BE")} meczów OpenFootball TXT ·
                {Number(publicHistoryCoverage.openfootball_league_matches_read || 0).toLocaleString("pl-BE")} meczów OpenFootball JSON
              </div>
              <div className="mt-1 text-muted-foreground">
                {Number(publicHistoryCoverage.openmatchday_competitions_with_results || 0).toLocaleString("pl-BE")} rozgrywek OpenMatchday ·
                {Number(publicHistoryCoverage.international_matches_read || 0).toLocaleString("pl-BE")} meczów reprezentacji
              </div>
            </div>}
            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed"><div className="mb-1 font-semibold text-primary">Jak czytać ten typ?</div><p>1X2 wskazuje najbardziej prawdopodobny wynik: 1 = wygrana gospodarzy, X = remis, 2 = wygrana gości. Double Chance sumuje prawdopodobieństwa dwóch wyników (np. 1X = 1 + X). Typ może zostać WYBRANY tylko po spełnieniu progów modelu; sam wysoki procent nie gwarantuje trafienia.</p></div>
            {!rationale && !method && <p className="text-muted-foreground">Model nie zapisał szczegółowego uzasadnienia. Nie dopowiadamy przyczyn, których nie ma w danych.</p>}
          </div>
          {isNoData && <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200"><ShieldAlert className="mt-0.5 size-4 shrink-0"/><span>Brak potwierdzonych danych do mocnej prognozy. Typ jest zachowany w rejestrze jako ODRZUCONY i nie powinien trafiać do kuponu.</span></div>}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 font-semibold"><CalendarClock className="size-4 text-primary"/> Kursy i kontrola danych</div>
          <div className="rounded-xl border border-border bg-card/70 p-3">
            {odds ? <><div className="mb-2 text-sm font-semibold">{odds.bookmaker ?? "Źródło kursów nieznane"}</div><div className="grid grid-cols-3 gap-2 text-center">{[["1",odds.odds_1],["X",odds.odds_x],["2",odds.odds_2]].map(([label,value])=><div key={String(label)} className="rounded-lg bg-secondary/70 p-2"><div className="text-xs text-muted-foreground">{label}</div><div className="num font-semibold">{fmtOdds(value as number | null)}</div></div>)}</div><p className="mt-2 text-[11px] text-muted-foreground">Aktualizacja: {fmtDateTime(odds.captured_at)}</p><div className="mt-2 grid grid-cols-3 gap-2 text-center">{[["1X", odds.odds_1x], ["X2", odds.odds_x2], ["12", odds.odds_12]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-secondary/50 p-2"><div className="text-[10px] text-muted-foreground">{label}</div><div className="num text-sm font-semibold">{fmtOdds(value as number | null)}</div></div>)}</div></> : <p className="text-sm text-muted-foreground">Brak zapisanych kursów dla tego spotkania.</p>}
            <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <div>Forma i statystyki: { (coverage as any)?.github_openmatchday_last5 ? "publiczna baza GitHub / OpenMatchday" : "lokalna historia, FootyNomad lub dostępne źródła uzupełniające" }. Sprawdzamy do 5 ostatnich spotkań każdej drużyny.</div>
              <div>Strzały, celne strzały, rożne, faule i kartki: wykorzystywane tylko wtedy, gdy źródło rzeczywiście je udostępnia.</div>
              <div>xG / xGA, składy i kontuzje: OpenMatchday ich nie udostępnia. Nie są symulowane ani dopisywane.</div>
              <div>Model łączy dostępne zweryfikowane wyniki i formę; brakujące pola pozostają puste, a słabo pokryte typy są odrzucane.</div>
              {showSaved && saved?.fetchedAt && <div>Forma FootyNomad pobrana: {fmtDateTime(saved.fetchedAt)}</div>}
              <div className="flex items-center gap-1 pt-1"><CircleHelp className="size-3.5"/> Dane nieobecne nie są zastępowane wymyślonymi wartościami.</div>
            </div>
          </div>
        </section>
        <div className="flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Zamknij analizę</Button></div>
      </DialogContent>
    </Dialog>
  );
}
