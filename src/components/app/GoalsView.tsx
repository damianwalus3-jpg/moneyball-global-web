import { useMemo } from "react";
import { Target } from "lucide-react";
import { EmptyState, PageHeader, SelectionBadge, SettlementBadge, StatCard } from "@/components/app/ui-bits";
import { useTable } from "@/lib/queries";
import { fmtDateTime } from "@/lib/time";
import { fmtPct, matchLabel } from "@/lib/format";
import { hitRate } from "@/lib/domain";
import { isEuropeanMatch } from "@/lib/geography";
import type { Match, Prediction } from "@/lib/types";

const LABELS: Record<string, string> = {
  "OVER_1.5": "Powyżej 1,5 gola",
  "UNDER_1.5": "Poniżej 1,5 gola",
  "OVER_2.5": "Powyżej 2,5 gola",
  "UNDER_2.5": "Poniżej 2,5 gola",
  "OVER_3.5": "Powyżej 3,5 gola",
  "UNDER_3.5": "Poniżej 3,5 gola",
  BTTS_YES: "Obie drużyny strzelą — TAK",
  BTTS_NO: "Obie drużyny strzelą — NIE",
};

function brusselsDay(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}

export function GoalsView() {
  const matches = useTable("matches");
  const predictions = useTable("predictions");
  const today = brusselsDay(new Date());
  const now = Date.now();
  const forecastHorizon = now + 7 * 24 * 60 * 60 * 1000;
  // Show the next seven days of confirmed pre-match fixtures, not only today.
  // Never use kickoff_date as a substitute for a real kickoff timestamp.
  const byId = useMemo(() => new Map(matches.filter(isEuropeanMatch).filter((m) => {
    if (!m.kickoff_at) return false;
    if (!["scheduled", "unknown"].includes(String(m.status ?? "scheduled"))) return false;
    const kickoff = new Date(m.kickoff_at).getTime();
    return Number.isFinite(kickoff) && kickoff > now && kickoff <= forecastHorizon;
  }).map((m) => [m.id, m] as const)), [matches, now, forecastHorizon]);
  const rows = useMemo(() => {
    const latest = new Map<string, Prediction>();
    for (const p of predictions) {
      if (p.market !== "GOALS" || !byId.has(p.match_id)) continue;
      const key = `${p.match_id}|${p.selection ?? p.pick}`;
      const previous = latest.get(key);
      if (!previous || (p.created_at ?? "").localeCompare(previous.created_at ?? "") > 0) latest.set(key, p);
    }
    return [...latest.values()];
  }, [predictions, byId]);
  const grouped = useMemo(() => {
    const groups = new Map<string, Prediction[]>();
    for (const p of rows) {
      const group = groups.get(p.match_id) ?? [];
      group.push(p);
      groups.set(p.match_id, group);
    }
    return [...groups.entries()].sort((a, b) =>
      (byId.get(a[0])?.kickoff_at ?? "").localeCompare(byId.get(b[0])?.kickoff_at ?? ""),
    );
  }, [rows, byId]);
  const selected = rows.filter((p) => p.selection_status === "WYBRANY");
  const stats = hitRate(selected.map((p) => p.result_status));
  const fmtGoals = (v: unknown) => v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(2);

  return (
    <div>
      <PageHeader eyebrow="OVER / UNDER · BTTS" title="Prognozy goli" description={`Niezależny model Poissona · najbliższe 7 dni od ${today} (czas belgijski). Prognozy powstają tylko przy co najmniej 3 zweryfikowanych meczach obu drużyn.`} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Skuteczność wybranych" value={fmtPct(stats.rate)} hint={`${stats.won}/${stats.settled} rozliczonych`} tone="primary" />
        <StatCard label="Oczekujące typy" value={stats.pending} />
        <StatCard label="Mecze z prognozą" value={grouped.length} />
      </div>
      {grouped.length === 0 ? (
        <EmptyState icon={Target} title="Brak prognoz goli w najbliższych 7 dniach" description={byId.size === 0 ? "Brak potwierdzonych, przyszłych meczów europejskich z dokładną godziną rozpoczęcia w najbliższych 7 dniach. Mecze live, zakończone i bez godziny pozostają w historii." : "Silnik utworzy prognozy po potwierdzeniu wystarczającej historii wyników obu drużyn. Brakujących danych nie zastępujemy zgadywaniem."} />
      ) : (
        <div className="grid gap-3">
          {grouped.map(([matchId, items]) => {
            const match = byId.get(matchId) as Match | undefined;
            const forecast = items[0]?.data_coverage ?? {};
            return (
              <section key={matchId} className="surface-card p-3 sm:p-4">
                <div className="mb-3">
                  <div className="font-semibold">{matchLabel(match)}</div>
                  <div className="text-xs text-muted-foreground">{match?.league ?? "—"} · {fmtDateTime(match?.kickoff_at)}</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center">
                    <div><div className="text-xs text-muted-foreground">Gole gospodarzy</div><div className="num font-semibold">{fmtGoals(forecast.expected_home_goals)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Gole gości</div><div className="num font-semibold">{fmtGoals(forecast.expected_away_goals)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Razem</div><div className="num font-semibold">{fmtGoals(forecast.expected_total_goals)}</div></div>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Model: Poisson · źródło: {String(items[0]?.data_source ?? "—")} · xG: {forecast.xg_used ? "uwzględnione" : "brak danych xG"}</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{LABELS[p.selection ?? ""] ?? p.selection}</div>
                        <div className="num text-xs text-muted-foreground">{fmtPct(p.probability)} prawdopodobieństwa</div>
                        {p.rejection_reason && <div className="mt-1 max-w-[240px] text-[11px] text-amber-400">{p.rejection_reason}</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <SelectionBadge status={p.selection_status} />
                        <SettlementBadge status={p.result_status} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
