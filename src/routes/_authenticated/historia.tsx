import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, History } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataError,
  EmptyState,
  PageHeader,
  PageLoader,
  SelectionBadge,
  SettlementBadge,
  TypeBadge,
} from "@/components/app/ui-bits";
import { syncResults } from "@/lib/results";
import { fmtPct, matchLabel } from "@/lib/format";
import { isEuropeanMatch } from "@/lib/geography";
import { ensureTables, useTable } from "@/lib/queries";
import { fmtDateTime } from "@/lib/time";

export const Route = createFileRoute("/_authenticated/historia")({
  head: () => ({
    meta: [
      { title: "Historia i rozliczenia — MONEYBALL GLOBAL 2.0" },
      { name: "description", content: "Automatyczne pobieranie wyników i rozliczanie prognoz 1X2, Double Chance i kuponów." },
      { property: "og:title", content: "Historia i rozliczenia — MONEYBALL GLOBAL 2.0" },
      { property: "og:description", content: "Wyniki meczów i rozliczenia prognoz." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    ensureTables(context.queryClient, ["matches", "predictions", "match_results", "coupons", "coupon_legs"]),
  pendingComponent: PageLoader,
  errorComponent: DataError,
  component: Historia,
});

function Historia() {
  const qc = useQueryClient();
  const matches = useTable("matches");
  const preds = useTable("predictions");
  const results = useTable("match_results");
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [q, setQ] = useState("");
  const syncInFlight = useRef(false);
  const [syncMessage, setSyncMessage] = useState("Synchronizacja automatyczna aktywna");

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      if (disposed || document.visibilityState !== "visible" || syncInFlight.current) return;
      syncInFlight.current = true;
      try {
        const result = await syncResults(7);
        if (disposed) return;
        await Promise.all(["matches", "match_results", "predictions", "coupons", "coupon_legs"].map((table) =>
          qc.invalidateQueries({ queryKey: ["table", table] }),
        ));
        setSyncMessage(`Automatycznie sprawdzono wyniki · ${result.results_saved ?? 0} nowych rozliczeń`);
      } catch (error) {
        if (!disposed) setSyncMessage(`Kolejna automatyczna próba po błędzie: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        syncInFlight.current = false;
      }
    };
    const onFocus = () => void refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5 * 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [qc]);
  const europeanMatches = useMemo(() => matches.filter(isEuropeanMatch), [matches]);
  const europeanMatchIds = useMemo(() => new Set(europeanMatches.map((m) => m.id)), [europeanMatches]);
  const europeanResults = results.filter((r) => europeanMatchIds.has(r.match_id));
  const resultBy = useMemo(() => new Map(europeanResults.map((r) => [r.match_id, r])), [europeanResults]);
  const now = Date.now();

  const isVoided = (m: Match) => m.status === "cancelled" || m.status === "postponed";
  const todo = europeanMatches
    .filter((m) => m.kickoff_at && new Date(m.kickoff_at).getTime() < now && !resultBy.has(m.id) && !isVoided(m))
    .sort((a, b) => (a.kickoff_at ?? "").localeCompare(b.kickoff_at ?? ""));
  const done = europeanMatches
    .filter((m) => resultBy.has(m.id) || isVoided(m))
    .sort((a, b) => (b.kickoff_at ?? "").localeCompare(a.kickoff_at ?? ""));
  const list = (tab === "todo" ? todo : done).filter(
    (m) => !q || `${matchLabel(m)} ${m.league}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Wyniki · rozliczenia"
        title="Historia / Rozliczenia"
        description="Wyniki są pobierane automatycznie z niezależnych źródeł. Po potwierdzeniu rezultatu Moneyball rozlicza prognozy 1X2, DC i powiązane kupony."
      />
      <p className="mb-3 text-xs text-muted-foreground" role="status">{syncMessage} · sprawdzanie co 5 minut</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={tab === "todo" ? "default" : "outline"} onClick={() => setTab("todo")}>
          Do rozliczenia ({todo.length})
        </Button>
        <Button size="sm" variant={tab === "done" ? "default" : "outline"} onClick={() => setTab("done")}>
          Rozliczone ({done.length})
        </Button>
        <Input placeholder="Szukaj…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 max-w-xs" />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={tab === "todo" ? CheckCircle2 : History}
          title={tab === "todo" ? "Nic do rozliczenia" : "Brak rozliczonych meczów"}
          description={
            tab === "todo"
              ? "Mecze pojawią się tutaj po godzinie rozpoczęcia, jeśli nie mają jeszcze wyniku."
              : "Mecz pojawi się tutaj po pobraniu i potwierdzeniu wyniku przez źródło danych."
          }
        />
      ) : (
        <div className="grid gap-2">
          {list.map((m) => {
            const r = resultBy.get(m.id);
            const mp = preds.filter((p) => p.match_id === m.id);
            return (
              <div key={m.id} className="surface-card p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{matchLabel(m)}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.league ?? "—"} · {fmtDateTime(m.kickoff_at)}
                    </div>
                  </div>
                  {r ? (
                    <div className="num rounded-md bg-secondary px-2 py-1 text-lg font-semibold">
                      {r.home_goals}:{r.away_goals}
                    </div>
                  ) : isVoided(m) ? (
                    <SettlementBadge status="void" />
                  ) : null}
                  {m.status === "unknown" && !r && <span className="text-xs text-muted-foreground">Weryfikacja automatyczna</span>}
                </div>
                {mp.length > 0 && (
                  <div className="mt-2 grid gap-1 border-t border-border pt-2">
                    {mp.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <TypeBadge type={p.prediction_type} />
                        <span className="num w-7 font-semibold text-primary">{p.pick}</span>
                        <span className="num text-xs text-muted-foreground">{fmtPct(p.probability)}</span>
                        <SelectionBadge status={p.selection_status} />
                        <span className="flex-1" />
                        <SettlementBadge status={p.result_status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
