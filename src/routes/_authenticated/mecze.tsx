import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, BrainCircuit, CalendarDays, CircleDollarSign, FileUp, Pencil, Plus, RefreshCw, ScanLine, Ticket } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDelete, DataError, EmptyState, PageHeader, PageLoader } from "@/components/app/ui-bits";
import { ScanImportDialog } from "@/components/app/ScanImportDialog";
import { MatchDetailsDialog } from "@/components/app/MatchDetailsDialog";
import { MatchForm } from "@/components/forms/MatchForm";
import { OddsForm, ScanRunForm } from "@/components/forms/SimpleForms";
import { deleteRow } from "@/lib/db";
import { MATCH_STATUS_LABELS, buildCouponBatch, isCouponCandidate } from "@/lib/domain";
import { saveCouponBatch } from "@/lib/coupons";
import { fmtOdds } from "@/lib/format";
import { isEuropeanMatch } from "@/lib/geography";
import { syncResults } from "@/lib/results";
import { importPublicFixturesForDate } from "@/lib/public-fixtures";
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
  const [detailMatch, setDetailMatch] = useState<Match | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [oddsFor, setOddsFor] = useState<string | null>(null);
  const [editScan, setEditScan] = useState<ScanRun | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [globalScanRunning, setGlobalScanRunning] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [couponSize, setCouponSize] = useState<1 | 3>(3);

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
      if (p.market === "GOALS") continue;
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
    .filter((p) => p.market !== "GOALS" && (p.prediction_type === "1X2" || p.prediction_type === "DC"))
    .filter((p) => isEuropeanMatch(matches.find((m) => m.id === p.match_id) ?? {}) && isCouponCandidate(p, matches.find((m) => m.id === p.match_id), Date.now()))
    .filter((p) => {
      const kickoff = matches.find((m) => m.id === p.match_id)?.kickoff_at;
      return !!kickoff && brusselsDayKey(kickoff) === todayKeyForCoupons && !usedCouponMatchIds.has(p.match_id);
    })
    .sort((a, b) => Number(b.probability) - Number(a.probability));
  const couponBatch = buildCouponBatch(couponCandidates, 10, couponSize);
  const createCoupons = useAction(
    () => saveCouponBatch(couponBatch, { namePrefix: "Kupon", stake: 5, recordStake: true, legsPerCoupon: couponSize }),
    { success: (n) => `Utworzono ${n} kupon(y) · ${couponSize === 1 ? "pojedyncze" : "AKO 3-meczowe"} · stawka 5 € każdy` },
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
      // The predictor reads the public, keyless OpenMatchday history generated by GitHub Actions.
      let offset = 0;
      let batches = 0;
      let totalMatches = 0;
      let totalPredictions = 0;
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalSelected = 0;
      let totalCovered = 0;
      let totalMissing = 0;
      let lastData: Record<string, unknown> | null = null;
      while (batches < 20) {
        const { data, error } = await sb.functions.invoke("moneyball-predict", { body: { date, offset } });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Analiza nie została zakończona.");
        lastData = data as Record<string, unknown>;
        totalMatches += Number(data.matches ?? 0);
        totalPredictions += Number(data.predictions ?? 0);
        totalCreated += Number(data.created ?? 0);
        totalUpdated += Number(data.updated ?? 0);
        totalSelected += Number(data.selected ?? 0);
        totalCovered += Number(data.covered ?? 0);
        totalMissing += Number(data.missing ?? 0);
        batches += 1;
        if (data.has_more !== true) break;
        offset += Number(data.batch_size ?? 150);
      }
      if (batches >= 20 && lastData?.has_more === true) {
        throw new Error("Analiza została podzielona na partie, ale limit 20 partii został osiągnięty. Uruchom analizę ponownie, aby kontynuować.");
      }
      await Promise.all(["matches","predictions","coupons","coupon_legs"].map((table) => qc.invalidateQueries({ queryKey: ["table", table] })));
      toast.success("Analiza zakończona: " + totalPredictions + " typów • mecze " + totalMatches + " • partie " + batches + " • nowe " + totalCreated + " / aktualizacje " + totalUpdated + " • wybrane " + totalSelected + " • pokrycie " + totalCovered + "/" + totalMatches + " • brak danych " + totalMissing);
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
      const date = brusselsDayKey(new Date()); // zawsze dzisiejsza data w strefie Europe/Brussels
      const { data, error } = await sb.functions.invoke("footynomad-sync", { body: { date, days: 1 } });
      const edgeCount = Number(data?.combined_count ?? data?.fixtures_count ?? data?.total_found ?? 0);
      if (error || !data?.ok || edgeCount === 0) {
        // Independent keyless GitHub fallback: do not let a missing FootyNomad
        // Edge Function make the daily scan unusable.
        const fallback = await importPublicFixturesForDate(date, matches);
        if (fallback.sourceFixtures === 0) {
          throw new Error(error?.message || data?.error || "Brak meczów w FootyNomad i w publicznym terminarzu GitHub dla tej daty.");
        }
        await Promise.all(["matches","scan_runs","predictions","match_results","odds_snapshots","coupons","coupon_legs","bankroll_transactions"].map((table) => qc.invalidateQueries({ queryKey: ["table", table] })));
        toast.success(`Skan publiczny: ${fallback.sourceFixtures} meczów • live ${fallback.liveFixtures} • GitHub ${fallback.staticFixtures} • dodano ${fallback.newMatches} • istniejące ${fallback.reusedMatches}`);
        await runTodayAnalysis(date);
        return;
      }
      // Always merge the independent keyless GitHub fixture feed, even when
      // FootyNomad succeeds. This fills gaps instead of using GitHub only as a
      // complete-outage fallback. Import is deduplicated against existing rows.
      let publicSummary: Awaited<ReturnType<typeof importPublicFixturesForDate>> | null = null;
      let publicWarning = "";
      try {
        publicSummary = await importPublicFixturesForDate(date, matches);
      } catch (publicError) {
        publicWarning = publicError instanceof Error ? publicError.message : String(publicError);
      }
      await Promise.all(["matches","scan_runs","predictions","match_results","odds_snapshots","coupons","coupon_legs","bankroll_transactions"].map((table) => qc.invalidateQueries({ queryKey: ["table", table] })));
      toast.success(
        "Skan 1 dzień: FootyNomad " + edgeCount + " • źródła publiczne " + (publicSummary?.sourceFixtures ?? 0) +
        " • dodano FN " + (data.inserted ?? 0) + " / GitHub " + (publicSummary?.newMatches ?? 0) +
        (publicWarning ? " • dodatkowe źródło niedostępne" : ""),
      );
      // footynomad-sync now runs the shared result/coupon settlement pipeline itself.
      // Keep the client-side synchronizer only as a fallback if that internal call failed.
      if (data.result_sync?.ok !== true) {
        try { await refreshResults.mutateAsync(undefined); }
        catch { /* refreshResults already reports the source error; keep the completed fixture scan */ }
      }
      await runTodayAnalysis(date);
    } catch (e) {
      toast.error("Nie udało się wykonać skanu: " + (e instanceof Error ? e.message : String(e)));
    } finally { setGlobalScanRunning(false); }
  };

  const todayKey = brusselsDayKey(new Date());
  const matchDayKey = (m: Match): string | null => {
    if (m.kickoff_at) return brusselsDayKey(m.kickoff_at);
    if (m.kickoff_date) return m.kickoff_date.slice(0,10);
    // Older rows retain the fixture date in OpenMatchday external IDs.
    return /:(\d{4}-\d{2}-\d{2}):/.exec(m.external_id ?? "")?.[1] ?? null;
  };
  const filtered = europeanMatches
    .filter((m) => {
      const day = matchDayKey(m);
      if (!day) return false;
      if (view === "today") return day === todayKey;
      if (view === "past") return day < todayKey;
      if (view === "all") return day <= todayKey;
      return true;
    })
    .filter((m) => !q || `${m.home_team} ${m.away_team} ${m.league} ${m.country}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const dayA = matchDayKey(a) ?? "";
      const dayB = matchDayKey(b) ?? "";
      const dayOrder = view === "today" ? dayA.localeCompare(dayB) : dayB.localeCompare(dayA);
      return dayOrder || (view === "today"
        ? (a.kickoff_at ?? "").localeCompare(b.kickoff_at ?? "")
        : (b.kickoff_at ?? "").localeCompare(a.kickoff_at ?? ""));
    });

  // Collapse duplicate provider rows only in the schedule presentation.
  // Underlying match, prediction, result and coupon records remain untouched.
  const normFixtureTeam = (value: string | null | undefined) =>
    String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase().replace(/\\b(fc|cf|sc|afc|club|football|de|the)\\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ").trim().replace(/\\s+/g, " ");
  const fixtureBase = (m: Match) =>
    [matchDayKey(m) ?? "brak-daty", normFixtureTeam(m.home_team), normFixtureTeam(m.away_team)].join("|");
  const providerPriority = (m: Match) =>
    (String(m.source ?? "").toLowerCase() === "footynomad" ? 100 : 0) +
    (m.gender && m.gender !== "unknown" ? 10 : 0) + (m.kickoff_at ? 1 : 0);
  const byFixture = new Map<string, Match[]>();
  for (const m of filtered) {
    const key = fixtureBase(m);
    const bucket = byFixture.get(key) ?? [];
    bucket.push(m);
    byFixture.set(key, bucket);
  }
  const displayGroups = new Map<string, { primary: Match; matches: Match[] }[]>();
  for (const [base, bucket] of byFixture) {
    const knownGenders = [...new Set(bucket.map((m) => m.gender).filter((g): g is "men" | "women" => g === "men" || g === "women"))];
    const genderBuckets = new Map<string, Match[]>();
    for (const m of bucket) {
      const gender = m.gender === "men" || m.gender === "women"
        ? m.gender
        : knownGenders.length === 1 ? knownGenders[0] : "unknown";
      const rows = genderBuckets.get(gender) ?? [];
      rows.push(m);
      genderBuckets.set(gender, rows);
    }
    for (const [gender, rows] of genderBuckets) {
      const primary = [...rows].sort((a, b) => providerPriority(b) - providerPriority(a))[0];
      const day = matchDayKey(primary) ?? "brak-daty";
      const list = displayGroups.get(day) ?? [];
      list.push({ primary, matches: rows });
      displayGroups.set(day, list);
    }
  }

  const detailGroup = detailMatch
    ? displayGroups.get(matchDayKey(detailMatch) ?? "brak-daty")?.find((group) => group.matches.some((m) => m.id === detailMatch.id))
    : undefined;
  const detailResult = detailGroup
    ? detailGroup.matches.map((m) => resultBy.get(m.id)).find((r) => r?.verified === true) ??
      detailGroup.matches.map((m) => resultBy.get(m.id)).find(Boolean)
    : detailMatch ? resultBy.get(detailMatch.id) : undefined;
  const detailOdds = detailGroup
    ? detailGroup.matches.map((m) => latestOdds.get(m.id)).filter(Boolean)
      .sort((a, b) => (b?.captured_at ?? "").localeCompare(a?.captured_at ?? ""))[0]
    : detailMatch ? latestOdds.get(detailMatch.id) : undefined;

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
              {globalScanRunning ? "Skanuję 1 dzień…" : "Skanuj 1 dzień"}
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
          <p className="text-sm text-muted-foreground">Tworzy kupony z dzisiejszych typów WYBRANY powyżej 75%. Wybierz kupon pojedynczy albo AKO z 3 różnych meczów. Stawka wirtualna: 5 € na kupon.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={couponSize === 1 ? "default" : "outline"} onClick={() => setCouponSize(1)}>Pojedynczy (1 mecz)</Button>
            <Button type="button" size="sm" variant={couponSize === 3 ? "default" : "outline"} onClick={() => setCouponSize(3)}>AKO (3 mecze)</Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Dostępne kupony do utworzenia: {couponBatch.length} · wykorzystane mecze są pomijane.</p>
          {couponBatch.length === 0 && <p className="mt-1 text-xs text-warning">Brak {couponSize} wolnych, dzisiejszych typów WYBRANY powyżej 75% z przyszłą godziną rozpoczęcia.</p>}
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
          {[...displayGroups.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="eyebrow mb-2 capitalize">{day === "brak-daty" ? "Bez daty" : fmtDayLong(list[0].primary.kickoff_at ?? `${day}T12:00:00.000Z`)}</h2>
              <div className="grid gap-2">
                {list.map((group) => {
                  const m = group.primary;
                  const r = group.matches.map((row) => resultBy.get(row.id)).find((row) => row?.verified === true) ??
                    group.matches.map((row) => resultBy.get(row.id)).find(Boolean);
                  const c = group.matches.reduce((acc, row) => {
                    const count = predCount.get(row.id);
                    return { x12: acc.x12 + (count?.x12 ?? 0), dc: acc.dc + (count?.dc ?? 0), sel: acc.sel + (count?.sel ?? 0) };
                  }, { x12: 0, dc: 0, sel: 0 });
                  const o = group.matches.map((row) => latestOdds.get(row.id)).filter(Boolean)
                    .sort((a, b) => (b?.captured_at ?? "").localeCompare(a?.captured_at ?? ""))[0];
                  return (
                    <article
                      key={m.id}
                      className="surface-card grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 p-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3 sm:p-4"
                    >
                      <div className="num pt-0.5 text-center text-sm font-bold tabular-nums text-primary sm:text-base">
                        {m.kickoff_at ? fmtTime(m.kickoff_at) : "Godzina nieznana"}
                      </div>

                      <div className="min-w-0">
                        <button
                          type="button"
                          className="group/match block w-full whitespace-normal break-words text-left text-[0.95rem] font-semibold leading-snug text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-base"
                          onClick={() => setDetailMatch(m)}
                          aria-label={`Otwórz analizę meczu ${m.home_team} – ${m.away_team}`}
                        >
                          {m.home_team} <span className="px-1 text-muted-foreground">–</span> {m.away_team}
                          <span className="ml-2 inline-flex align-middle text-[10px] font-medium text-primary opacity-90 group-hover/match:underline">ANALIZA ↗</span>
                        </button>
                        <div className="mt-1 whitespace-normal break-words text-xs leading-relaxed text-muted-foreground">
                          {m.league ?? "Rozgrywki nieznane"}{m.country ? ` · ${m.country}` : ""}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {r ? (
                            <span className="num rounded-md bg-secondary px-2 py-1 text-sm font-bold">
                              {r.home_goals}:{r.away_goals}
                            </span>
                          ) : (
                            <Badge variant={m.status === "cancelled" || m.status === "postponed" ? "muted" : "outline"}>
                              {MATCH_STATUS_LABELS[m.status ?? "scheduled"] ?? m.status}
                            </Badge>
                          )}
                          {group.matches.length > 1 && (
                            <Badge variant="outline">Połączono {group.matches.length} rekordy</Badge>
                          )}
                          {c.x12 + c.dc > 0 ? (
                            <>
                              <Badge variant="secondary">1X2: {c.x12}</Badge>
                              <Badge variant="secondary">DC: {c.dc}</Badge>
                              <Badge variant="outline">Wybrane: {c.sel}</Badge>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Brak prognoz</span>
                          )}
                        </div>
                        {o && (
                          <div className="num mt-1 whitespace-normal text-xs leading-relaxed text-muted-foreground">
                            Kursy{o.bookmaker ? ` (${o.bookmaker})` : ""}: 1 {fmtOdds(o.odds_1)} · X {fmtOdds(o.odds_x)} · 2 {fmtOdds(o.odds_2)}
                          </div>
                        )}
                        {r && (
                          <div className="mt-1 whitespace-normal break-words text-[11px] leading-relaxed text-muted-foreground">
                            {r.verified === true ? "Wynik potwierdzony" : "Wynik do weryfikacji"}{r.source ? ` · źródło: ${r.source}` : ""}
                          </div>
                        )}
                        <Button variant="outline" size="sm" className="mt-2 h-9 w-full justify-center gap-2 text-xs font-semibold sm:w-auto" onClick={() => setDetailMatch(m)}>
                          <Activity className="size-4" /> Otwórz szczegóły meczu i wyjaśnienie typu
                        </Button>
                      </div>

                      <div className="col-span-2 flex items-center justify-end border-t border-border/60 pt-1 sm:col-span-1 sm:border-0 sm:pt-0">
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
                        {group.matches.length === 1 ? (
                          <ConfirmDelete
                            title="Usunąć mecz?"
                            description="Usunięcie meczu może usunąć też jego prognozy i wynik (zależnie od ustawień bazy). Tej operacji nie można cofnąć."
                            onConfirm={() => del.mutate(m.id)}
                          />
                        ) : (
                          <Badge variant="outline" title="Rekordy pozostają w bazie, aby zachować prognozy i kupony">
                            Zachowano powiązania
                          </Badge>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <MatchDetailsDialog
        match={detailMatch}
        open={detailMatch != null}
        onOpenChange={(open) => !open && setDetailMatch(null)}
        predictions={detailMatch ? preds.filter((p) => {
          const selectedGroup = displayGroups.get(matchDayKey(detailMatch) ?? "brak-daty")?.find((g) => g.matches.some((m) => m.id === detailMatch.id));
          return selectedGroup ? selectedGroup.matches.some((m) => m.id === p.match_id) : p.match_id === detailMatch.id;
        }) : []}
        odds={detailOdds}
        result={detailResult}
        matches={matches}
        results={results}
      />
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
