import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BrainCircuit, CalendarDays, CircleDollarSign, FileUp, Pencil, Plus, RefreshCw, ScanLine, Ticket } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDelete, DataError, EmptyState, PageHeader, PageLoader } from "@/components/app/ui-bits";
import { ScanImportDialog } from "@/components/app/ScanImportDialog";
import { MatchForm } from "@/components/forms/MatchForm";
import { OddsForm, ScanRunForm } from "@/components/forms/SimpleForms";
import { deleteRow } from "@/lib/db";
import { MATCH_STATUS_LABELS, buildCouponBatch, isCouponCandidate } from "@/lib/domain";
import { saveCouponBatch } from "@/lib/coupons";
import { fmtOdds } from "@/lib/format";
import { isEuropeanMatch } from "@/lib/geography";
import { syncResults } from "@/lib/results";
import { ensureTables, useAction, useTable } from "@/lib/queries";
import { brusselsDayKey, fmtDateTime, fmtDayLong, fmtTime } from "@/lib/time";
import type { Match, ScanRun } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/mecze")({
  head: () => ({
    meta: [
      { title: "Terminarz i mecze — MONEYBALL GLOBAL 2.0" },
      { name: "description", content: "Wszystkie zeskanowane mecze, import skanów CSV, kursy i wyniki." },
      { property: "og:title", content: "Terminarz — MONEYBALL GLOBAL 2.0" },
      { property: "og:description", content: "Zeskanowane mecze, kursy i wyniki." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    ensureTables(context.queryClient, [
      "matches",
      "scan_runs",
      "predictions",
      "match_results",
      "odds_snapshots",
      "coupons",
      "coupon_legs",
    ]),
  pendingComponent: PageLoader,
  errorComponent: DataError,
  component: Mecze,
});

type View = "today" | "past" | "all" | "scans";

function Mecze() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const matches = useTable("matches");
  const scans = useTable("scan_runs");
  const preds = useTable("predictions");
  const coupons = useTable("coupons");
  const couponLegs = useTable("coupon_legs");
  const results = useTable("match_results");
  const odds = useTable("odds_snapshots");
  const [view, setView] = useState<View>("today");
  const [q, setQ] = useState("");
  const [editMatch, setEditMatch] = useState<Match | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [oddsFor, setOddsFor] = useState<string | null>(null);
  const [editScan, setEditScan] = useState<ScanRun | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [globalScanRunning, setGlobalScanRunning] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  const europeanMatches = useMemo(() => matches.filter(isEuropeanMatch), [matches]);
  const resultBy = useMemo(() => new Map(results.map((r) => [r.match_id, r])), [results]);
  const latestOdds = useMemo(() => {
    const m = new Map<string, (typeof odds)[number]>();
    for (const o of odds) {
      const cur = m.get(o.match_id);
      if (!cur || (o.captured_at ?? "") > (cur.captured_at ?? "")) m.set(o.match_id, o);
    }
    return m;
  }, [odds]);
  const predCount = useMemo(() => {
    const m = new Map<string, { x12: number; dc: number; sel: number }>();
    for (const p of preds) {
      const c = m.get(p.match_id) ?? { x12: 0, dc: 0, sel: 0 };
      if (p.prediction_type === "DC") c.dc++;
      else c.x12++;
      if (p.selection_status === "WYBRANY") c.sel++;
      m.set(p.match_id, c);
    }
    return m;
  }, [preds]);

  const todayKeyForCoupons = brusselsDayKey(new Date());
  const activeCouponIds = new Set(coupons.filter((coupon) => (coupon.status ?? "pending") === "pending").map((coupon) => coupon.id));
  const usedCouponMatchIds = new Set(couponLegs.filter((leg) => activeCouponIds.has(leg.coupon_id)).map((leg) => leg.match_id));
  const couponCandidates = preds
    .filter((p) => isEuropeanMatch(matches.find((m) => m.id === p.match_id) ?? {}) && isCouponCandidate(p, matches.find((m) => m.id === p.match_id), Date.now()))
    .filter((p) => {
      const kickoff = matches.find((m) => m.id === p.match_id)?.kickoff_at;
      return !!kickoff && brusselsDayKey(kickoff) === todayKeyForCoupons && !usedCouponMatchIds.has(p.match_id);
    })
    .sort((a, b) => Number(b.probability) - Number(a.probability));
  const couponBatch = buildCouponBatch(couponCandidates, 10);
  const createCoupons = useAction(
    () => saveCouponBatch(couponBatch, { namePrefix: "Kupon", stake: 5, recordStake: true }),
    { success: (n) => `Utworzono ${n} kupon(y) · stawka 5 € każdy` },
  );

  const del = useAction((id: string) => deleteRow("matches", id), { success: "Usunięto mecz" });
  const delScan = useAction((id: string) => deleteRow("scan_runs", id), { success: "Usunięto skan" });
  const refreshResults = useAction(() => syncResults(7), {
    success: (r) => `Wyniki sprawdzone · ${r.results_saved ?? 0} zapisów · ${r.alternate_results_matched ?? 0} dopasowań ze źródeł dodatkowych · ${r.predictions_settled ?? 0} rozliczeń prognoz`,
  });

  // Keep match results current without requiring the user to press "Odśwież wyniki".
  // Reuse the existing verified multi-source synchronizer; do not add another provider.
  const automaticResultsSync = useRef(false);
  useEffect(() => {
    let disposed = false;
    const refreshAutomatically = async () => {
      if (disposed || document.visibilityState !== "visible" || automaticResultsSync.current) return;
      automaticResultsSync.current = true;
      try {
        await syncResults(7);
        if (!disposed) {
          await Promise.all(
            ["matches", "match_results", "predictions", "coupons", "coupon_legs"].map((table) =>
              qc.invalidateQueries({ queryKey: ["table", table] }),
            ),
          );
        }
      } catch (error) {
        // Keep background refresh quiet; the manual button still displays actionable errors.
        console.warn("Automatyczna synchronizacja wyników MONEYBALL:", error);
      } finally {
        automaticResultsSync.current = false;
      }
    };

    const onFocus = () => void refreshAutomatically();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshAutomatically();
    };

    void refreshAutomatically();
    const interval = window.setInterval(() => void refreshAutomatically(), 5 * 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [qc]);

  const runTodayAnalysis = async (date = brusselsDayKey(new Date())) => {
    if (analysisRunning) return;
    const sb = getSupabase();
    if (!sb) { toast.error("Brak połączenia z bazą danych."); return; }
    setAnalysisRunning(true);
    try {
      const { data, error } = await sb.functions.invoke("moneyball-predict", { body: { date } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Analiza nie została zakończona.");
      await Promise.all(["matches","predictions","coupons","coupon_legs"].map((table) => qc.invalidateQueries({ queryKey: ["table", table] })));
      toast.success("Analiza zakończona: " + (data.predictions ?? 0) + " typów • pokrycie danych " + (data.covered ?? 0) + "/" + (data.matches ?? 0) + " • forma FootyNomad " + (data.footy_form_matches ?? 0) + " • bez danych " + (data.missing ?? 0));
    } catch (e) {
      toast.error("Skan zapisany, ale analiza nie powiodła się: " + (e instanceof Error ? e.message : String(e)));
    } finally { setAnalysisRunning(false); }
  };

  const runTodayScan = async () => {
    if (globalScanRunning || analysisRunning) return;
    const sb = getSupabase();
    if (!sb) { toast.error("Brak połączenia z bazą danych."); return; }
    setGlobalScanRunning(true);
    try {
      const date = brusselsDayKey(new Date());
      const { data, error } = await sb.functions.invoke("footynomad-sync", { body: { date } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Skan nie został zakończony.");
      await Promise.all(["matches","scan_runs","predictions","match_results","odds_snapshots","coupons","coupon_legs"].map((table) => qc.invalidateQueries({ queryKey: ["table", table] })));
      toast.success("Skan zakończony: " + (data.combined_count ?? data.fixtures_count ?? data.total_found ?? 0) + " meczów • dodano " + (data.inserted ?? 0) + " • zaktualizowano " + (data.updated ?? 0));
      try { await refreshResults.mutateAsync(undefined); } catch { /* refreshResults already reports the source error; keep the completed fixture scan */ }
      await runTodayAnalysis(date);
    } catch (e) {
      toast.error("Nie udało się wykonać skanu: " + (e instanceof Error ? e.message : String(e)));
    } finally { setGlobalScanRunning(false); }
  };

  const todayKey = brusselsDayKey(new Date());
  const now = Date.now();
  const filtered = europeanMatches
    .filter((m) => {
      if (!m.kickoff_at) return false;
      const day = brusselsDayKey(m.kickoff_at);
      if (view === "today") return day === todayKey;
      if (view === "past") return day < todayKey;
      if (view === "all") return day <= todayKey;
      return true;
    })
    .filter((m) => !q || `${m.home_team} ${m.away_team} ${m.league} ${m.country}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) =>
      view === "today"
        ? (a.kickoff_at ?? "").localeCompare(b.kickoff_at ?? "")
        : (b.kickoff_at ?? "").localeCompare(a.kickoff_at ?? ""),
    );

  const groups = new Map<string, Match[]>();
  for (const m of filtered) {
    const k = m.kickoff_at ? brusselsDayKey(m.kickoff_at) : "brak-daty";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Europe/Brussels"
        title="Terminarz / Mecze"
        description="Europejskie rozgrywki klubowe i reprezentacyjne, w tym Liga Narodów UEFA. Wyniki pobierane i rozliczane automatycznie."
        actions={
          <>
            <Button variant="outline" onClick={() => refreshResults.mutate(undefined)} disabled={refreshResults.isPending || globalScanRunning || analysisRunning}>
              <RefreshCw className={refreshResults.isPending ? "animate-spin" : ""} />
              {refreshResults.isPending ? "Sprawdzam wyniki…" : "Odśwież wyniki"}
            </Button>
            <Button onClick={runTodayScan} disabled={globalScanRunning || analysisRunning}>
              <ScanLine className={globalScanRunning ? "animate-pulse" : ""} />
              {globalScanRunning ? "Skanuję dzisiejsze mecze…" : "Skanuj dzisiaj"}
            </Button>
            <Button variant="outline" onClick={() => void runTodayAnalysis()} disabled={globalScanRunning || analysisRunning}>
              <BrainCircuit className={analysisRunning ? "animate-pulse" : ""} />
              {analysisRunning ? "Analizuję mecze…" : "Analizuj mecze"}
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp /> Import CSV
            </Button>
            <Button
              onClick={() => {
                setEditMatch(null);
                setMatchOpen(true);
              }}
            >
              <Plus /> Dodaj mecz
            </Button>
          </>
        }
      />

      <section className="surface-card mb-5 flex flex-col gap-3 border-2 border-primary bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold uppercase">Generator kuponów</h2>
          <p className="text-sm text-muted-foreground">Tworzy kupony bezpośrednio z dzisiejszych typów WYBRANY powyżej 75%. Każdy kupon ma 3 różne mecze i stawkę wirtualną 5 €.</p>
          <p className="mt-1 text-xs text-muted-foreground">Dostępne kupony do utworzenia: {couponBatch.length} · wykorzystane mecze są pomijane.</p>
          {couponBatch.length === 0 && <p className="mt-1 text-xs text-warning">Brak 3 wolnych, dzisiejszych typów WYBRANY powyżej 75% z przyszłą godziną rozpoczęcia.</p>}
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
          <Button size="lg" className="w-full text-base font-bold" disabled={createCoupons.isPending || couponBatch.length === 0} onClick={() => createCoupons.mutate(undefined)}>
            <Ticket className="mr-2 size-5" /> {createCoupons.isPending ? "TWORZENIE…" : `GENERUJ I ZAPISZ (${couponBatch.length})`}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/kupony" })}>Otwórz kupony</Button>
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["today", "Dzisiaj"],
            ["past", "Historia"],
            ["all", "Dzisiaj + historia"],
            ["scans", `Skany (${scans.length})`],
          ] as const
        ).map(([v, l]) => (
          <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)}>
            {l}
          </Button>
        ))}
        {view !== "scans" && (
          <Input placeholder="Szukaj drużyny lub ligi…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 max-w-xs" />
        )}
      </div>

      {view === "scans" ? (
        scans.length === 0 ? (
          <EmptyState
            icon={ScanLine}
            title="Brak skanów"
            description="Skan powstaje automatycznie przy imporcie CSV. Możesz też dodać go ręcznie."
            action={
              <Button
                onClick={() => {
                  setEditScan(null);
                  setScanOpen(true);
                }}
              >
                <Plus /> Nowy skan
              </Button>
            }
          />
        ) : (
          <div className="grid gap-2">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditScan(null);
                  setScanOpen(true);
                }}
              >
                <Plus /> Nowy skan
              </Button>
            </div>
            {[...scans]
              .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""))
              .map((s) => {
                const n = matches.filter((m) => m.scan_run_id === s.id).length;
                return (
                  <div key={s.id} className="surface-card flex items-center gap-3 p-3">
                    <ScanLine className="size-5 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{fmtDateTime(s.started_at)}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.source ?? "—"} · {s.matches_count ?? n} meczów
                        {s.notes ? ` · ${s.notes}` : ""}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edytuj skan"
                      onClick={() => {
                        setEditScan(s);
                        setScanOpen(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmDelete
                      title="Usunąć skan?"
                      description="Mecze z tego skanu pozostaną w bazie (o ile baza na to pozwala)."
                      onConfirm={() => delScan.mutate(s.id)}
                    />
                  </div>
                );
              })}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={europeanMatches.length === 0 ? "Brak meczów europejskich" : "Brak meczów w tym widoku"}
          description={
            europeanMatches.length === 0
              ? "Wykonaj europejski skan FootyNomad albo zaimportuj europejskie mecze. Aplikacja nie tworzy przykładowych danych."
              : "Zmień filtr lub wyszukiwanie."
          }
          action={
            europeanMatches.length === 0 ? (
              <Button onClick={() => setImportOpen(true)}>
                <FileUp /> Import skanu
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-5">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="eyebrow mb-2 capitalize">{day === "brak-daty" ? "Bez daty" : fmtDayLong(list[0].kickoff_at)}</h2>
              <div className="grid gap-2">
                {list.map((m) => {
                  const r = resultBy.get(m.id);
                  const c = predCount.get(m.id);
                  const o = latestOdds.get(m.id);
                  return (
                    <div key={m.id} className="surface-card flex flex-wrap items-center gap-3 p-3">
                      <div className="num w-12 text-center text-sm font-semibold text-primary">{fmtTime(m.kickoff_at)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {m.home_team} – {m.away_team}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {m.league ?? "—"}
                          {m.country ? ` · ${m.country}` : ""}
                          {c ? ` · 1X2: ${c.x12} · DC: ${c.dc} · wybrane: ${c.sel}` : " · brak prognoz"}
                        </div>
                        {o && (
                          <div className="num text-xs text-muted-foreground">
                            Kursy{o.bookmaker ? ` (${o.bookmaker})` : ""}: 1 {fmtOdds(o.odds_1)} · X {fmtOdds(o.odds_x)} · 2{" "}
                            {fmtOdds(o.odds_2)}
                          </div>
                        )}
                        {r && (
                          <div className="text-xs text-muted-foreground">
                            {r.verified === true ? "WYNIK POTWIERDZONY" : "WYNIK DO WERYFIKACJI"}{r.source ? ` · źródło: ${r.source}` : ""}
                          </div>
                        )}
                      </div>
                      {r ? (
                        <div className="num rounded-md bg-secondary px-2 py-1 text-lg font-semibold">
                          {r.home_goals}:{r.away_goals}
                        </div>
                      ) : (
                        <Badge variant={m.status === "cancelled" || m.status === "postponed" ? "muted" : "outline"}>
                          {MATCH_STATUS_LABELS[m.status ?? "scheduled"] ?? m.status}
                        </Badge>
                      )}
                      <div className="flex items-center">
                        <Button variant="ghost" size="icon" aria-label="Kursy" title="Dodaj kursy" onClick={() => setOddsFor(m.id)}>
                          <CircleDollarSign />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edytuj mecz"
                          onClick={() => {
                            setEditMatch(m);
                            setMatchOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <ConfirmDelete
                          title="Usunąć mecz?"
                          description="Usunięcie meczu może usunąć też jego prognozy i wynik (zależnie od ustawień bazy). Tej operacji nie można cofnąć."
                          onConfirm={() => del.mutate(m.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <MatchForm open={matchOpen} onOpenChange={setMatchOpen} match={editMatch} scanRuns={scans} />
      <ScanImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ScanRunForm open={scanOpen} onOpenChange={setScanOpen} scan={editScan} />
      <OddsForm
        open={oddsFor != null}
        onOpenChange={(o) => !o && setOddsFor(null)}
        matches={europeanMatches}
        defaultMatchId={oddsFor ?? undefined}
      />
    </div>
  );
}
