import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataError, EmptyState, PageHeader, PageLoader, SelectionBadge, SettlementBadge, StatCard } from "@/components/app/ui-bits";
import { fmtMoney, fmtOdds, fmtPct, matchLabel, parseDecimal } from "@/lib/format";
import { ensureTables, useTable } from "@/lib/queries";
import { fmtDateTime } from "@/lib/time";
import { isEuropeanMatch } from "@/lib/geography";
import type { Prediction } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/wybrane-typy")({
  head: () => ({ meta: [{ title: "Wybrane typy — MONEYBALL GLOBAL" }, { name: "description", content: "Rejestr wybranych prognoz z kursami i symulacją zysku lub straty." }] }),
  loader: ({ context }) => ensureTables(context.queryClient, ["matches", "predictions"]),
  pendingComponent: PageLoader,
  errorComponent: DataError,
  component: WybraneTypy,
});

const GOAL_LABELS: Record<string, string> = {
  "OVER_1.5": "Gole: OVER 1.5", "UNDER_1.5": "Gole: UNDER 1.5",
  "OVER_2.5": "Gole: OVER 2.5", "UNDER_2.5": "Gole: UNDER 2.5",
  "OVER_3.5": "Gole: OVER 3.5", "UNDER_3.5": "Gole: UNDER 3.5",
  BTTS_YES: "Obie drużyny strzelą: TAK", BTTS_NO: "Obie drużyny strzelą: NIE",
};
const PICK_LABELS: Record<string, string> = {
  "1": "1 · wygrana gospodarzy", X: "X · remis", "2": "2 · wygrana gości",
  "1X": "1X · gospodarze lub remis", X2: "X2 · remis lub goście", "12": "12 · bez remisu",
};

function WybraneTypy() {
  const matches = useTable("matches");
  const predictions = useTable("predictions");
  const [stakeText, setStakeText] = useState("5");
  const stake = parseDecimal(stakeText);
  const validStake = stake != null && stake > 0;
  const byId = useMemo(() => new Map(matches.filter(isEuropeanMatch).map((m) => [m.id, m])), [matches]);

  const selected = useMemo(() => {
    const rows = predictions.filter((p) => p.selection_status === "WYBRANY" && byId.has(p.match_id));
    const latestGoals = new Map<string, Prediction>();
    const standard: Prediction[] = [];
    for (const p of rows) {
      if (p.market === "GOALS") {
        const key = `${p.match_id}|${p.selection ?? p.pick}`;
        const old = latestGoals.get(key);
        if (!old || (p.created_at ?? "").localeCompare(old.created_at ?? "") > 0) latestGoals.set(key, p);
      } else {
        standard.push(p);
      }
    }
    return [...standard, ...latestGoals.values()].sort((a, b) =>
      (byId.get(b.match_id)?.kickoff_at ?? "").localeCompare(byId.get(a.match_id)?.kickoff_at ?? ""),
    );
  }, [predictions, byId]);

  const settled = selected.filter((p) => ["won", "lost", "void"].includes(String(p.result_status)));
  const pending = selected.filter((p) => !p.result_status || p.result_status === "pending");
  const totalStaked = validStake ? settled.length * stake : 0;
  const returns = validStake ? settled.reduce((sum, p) => {
    if (p.result_status === "won") return sum + (Number(p.odds) > 1 ? stake * Number(p.odds) : stake);
    if (p.result_status === "void") return sum + stake;
    return sum;
  }, 0) : 0;
  const net = returns - totalStaked;
  const pendingPotential = validStake ? pending.reduce((sum, p) => sum + (Number(p.odds) > 1 ? stake * Number(p.odds) : 0), 0) : 0;
  const potentialAll = validStake ? selected.reduce((sum, p) => sum + (Number(p.odds) > 1 ? stake * Number(p.odds) : 0), 0) : 0;

  return (
    <div>
      <PageHeader eyebrow="REJESTR SYMULACYJNY · EUROPE/BRUSSELS" title="Wybrane typy" description="Każdy zatwierdzony typ jest liczony jako osobny zakład. Kurs jest pobierany z zapisanej prognozy; brak kursu jest wyraźnie oznaczony." />
      <section className="surface-card mb-4 p-4">
        <label htmlFor="selected-stake" className="mb-2 block text-sm font-medium">Stawka na każdy wybrany typ (€)</label>
        <Input id="selected-stake" type="number" inputMode="decimal" min="0.01" step="0.50" value={stakeText} onChange={(e) => setStakeText(e.target.value)} className="num max-w-40" />
        {!validStake && <p className="mt-1 text-xs text-destructive">Wpisz stawkę większą od 0 €.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Domyślnie 5 € na każdy typ. Zmiana stawki przelicza symulację na ekranie — nie zapisuje prawdziwej transakcji.</p>
      </section>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Wybrane typy" value={selected.length} />
        <StatCard label="Rozliczone" value={settled.length} />
        <StatCard label="Stawka rozliczona" value={fmtMoney(totalStaked)} />
        <StatCard label="Zysk / strata" value={validStake ? fmtMoney(net) : "—"} tone={net > 0 ? "primary" : net < 0 ? "danger" : "default"} hint="Tylko rozliczone typy" />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Zwrot z rozliczonych" value={validStake ? fmtMoney(returns) : "—"} />
        <StatCard label="Potencjalny zwrot oczekujących" value={validStake ? fmtMoney(pendingPotential) : "—"} hint="Nie jest zyskiem — mecze nie są rozliczone" />
      </div>
      {selected.length === 0 ? (
        <EmptyState icon={Target} title="Brak wybranych typów" description="Po zatwierdzeniu prognoz jako WYBRANY pojawią się tutaj wraz z kursem i symulacją stawki." />
      ) : (
        <div className="grid gap-3">
          {selected.map((p) => {
            const m = byId.get(p.match_id);
            const isGoals = p.market === "GOALS";
            const pick = isGoals ? (GOAL_LABELS[p.selection ?? ""] ?? p.selection ?? p.pick) : (PICK_LABELS[p.pick] ?? p.pick);
            const status = p.result_status ?? "pending";
            const payout = !validStake || !(Number(p.odds) > 1) ? null : status === "won" ? stake * Number(p.odds) : status === "void" ? stake : status === "lost" ? 0 : stake * Number(p.odds);
            const profit = payout == null || !validStake || status === "pending" ? null : payout - stake;
            return (
              <article key={p.id} className="surface-card flex flex-wrap items-center gap-3 p-3 sm:p-4">
                <div className="min-w-0 flex-1 basis-44">
                  <div className="font-semibold">{matchLabel(m)}</div>
                  <div className="text-xs text-muted-foreground">{m?.league ?? "—"} · {fmtDateTime(m?.kickoff_at)}</div>
                  <div className="mt-1 text-sm font-medium text-primary">{pick}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Model: {fmtPct(p.probability)} · Stawka: {validStake ? fmtMoney(stake) : "—"}</div>
                </div>
                <div className="flex min-w-28 flex-col items-end gap-1">
                  <div className="num text-lg font-bold">{p.odds != null && Number(p.odds) > 1 ? fmtOdds(p.odds) : "Brak kursu"}</div>
                  <div className="text-[11px] text-muted-foreground">Kurs typu</div>
                  <SelectionBadge status={p.selection_status} />
                  <SettlementBadge status={status} />
                  {profit != null && <div className={profit > 0 ? "text-sm font-semibold text-emerald-500" : profit < 0 ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>{profit > 0 ? "+" : ""}{fmtMoney(profit)}</div>}
                  {status === "pending" && payout != null && <div className="text-xs text-muted-foreground">Zwrot możliwy: {fmtMoney(payout)}</div>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-5 text-xs text-muted-foreground">Zysk/strata jest liczony dla rozliczonych typów: wygrana = stawka × kurs, przegrana = −stawka, zwrot = 0 €. Typ bez kursu nie jest doliczany do potencjalnego zwrotu. To symulacja, nie rzeczywisty bankroll.</p>
    </div>
  );
}
