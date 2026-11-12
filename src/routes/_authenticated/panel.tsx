import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Ticket, Trophy, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataError, EmptyState, NoGuarantee, PageHeader, PageLoader, StatCard } from "@/components/app/ui-bits";
import { bankrollBalance, hitRate, isCouponCandidate } from "@/lib/domain";
import { fmtMoney, fmtPct } from "@/lib/format";
import { ensureTables, useTable } from "@/lib/queries";
import { brusselsDayKey } from "@/lib/time";
import { isEuropeanMatch } from "@/lib/geography";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => ({ meta: [{ title: "Panel — MONEYBALL GLOBAL 2.0" }, { name: "description", content: "Podsumowanie prognoz, kuponów i bankrolla." }, { property: "og:title", content: "Panel — MONEYBALL" }, { property: "og:description", content: "Podsumowanie prognoz." }] }),
  loader: ({ context }) => ensureTables(context.queryClient, ["matches", "predictions", "coupons", "coupon_legs", "bankroll_transactions", "match_results"]),
  pendingComponent: PageLoader,
  errorComponent: DataError,
  component: Panel,
});

function Panel() {
  const matches = useTable("matches");
  const preds = useTable("predictions");
  const coupons = useTable("coupons");
  const couponLegs = useTable("coupon_legs");
  const txs = useTable("bankroll_transactions");
  const results = useTable("match_results");
  const now = Date.now();
  const europeanMatches = matches.filter(isEuropeanMatch);
  const europeanMatchIds = new Set(europeanMatches.map((m) => m.id));
  const europeanPredictions = preds.filter((p) => europeanMatchIds.has(p.match_id));
  const europeanCouponIds = new Set(couponLegs.filter((leg) => europeanMatchIds.has(leg.match_id)).map((leg) => leg.coupon_id));
  const byId = new Map(europeanMatches.map((m) => [m.id, m]));
  const balance = bankrollBalance(txs);
  const today = brusselsDayKey(new Date());
  const todayCount = europeanMatches.filter((m) => m.kickoff_at && brusselsDayKey(m.kickoff_at) === today).length;
  // Dashboard reports overall model hit rate; the Statistics page separates selected and rejected picks.
  const validPicks = europeanPredictions.filter((p) =>
    (p.prediction_type === "1X2" && ["1", "X", "2"].includes(p.pick)) ||
    (p.prediction_type === "DC" && ["1X", "X2", "12"].includes(p.pick)),
  );
  const hr1 = hitRate(validPicks.filter((p) => p.prediction_type === "1X2").map((p) => p.result_status));
  const hrDc = hitRate(validPicks.filter((p) => p.prediction_type === "DC").map((p) => p.result_status));
  const candidates = new Set(europeanPredictions.filter((p) => isCouponCandidate(p, byId.get(p.match_id), now)).map((p) => p.match_id)).size;
  const resultIds = new Set(results.map((r) => r.match_id));
  const toSettle = europeanMatches.filter((m) => m.kickoff_at && new Date(m.kickoff_at).getTime() < now && !resultIds.has(m.id) && m.status !== "cancelled" && m.status !== "postponed").length;

  return (
    <div>
      <PageHeader eyebrow="Europe/Brussels" title="Panel" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/bankroll" aria-label="Otwórz szczegóły bankrolla" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard label="Bankroll" value={balance == null ? "brak danych" : fmtMoney(balance)} hint="Kliknij, aby zobaczyć transakcje i saldo" icon={Wallet} tone="primary" className="h-full transition-colors group-hover:border-primary/60" />
        </Link>
        <Link to="/mecze" aria-label="Otwórz dzisiejsze mecze" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard label="Mecze dziś" value={todayCount} hint="Kliknij, aby zobaczyć terminarz" icon={CalendarDays} className="h-full transition-colors group-hover:border-primary/60" />
        </Link>
        <Link to="/statystyki" aria-label="Otwórz szczegółowe statystyki 1X2" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard label="Skuteczność 1X2" value={fmtPct(hr1.rate)} hint={`${hr1.won}/${hr1.settled} · kliknij po szczegóły`} icon={Trophy} className="h-full transition-colors group-hover:border-primary/60" />
        </Link>
        <Link to="/statystyki" aria-label="Otwórz szczegółowe statystyki Double Chance" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard label="Skuteczność DC" value={fmtPct(hrDc.rate)} hint={`${hrDc.won}/${hrDc.settled} · kliknij po szczegóły`} icon={Trophy} className="h-full transition-colors group-hover:border-primary/60" />
        </Link>
        <Link to="/kupony" aria-label="Otwórz kupony w grze i ich szczegóły" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard label="Kupony w grze" value={coupons.filter((c) => europeanCouponIds.has(c.id) && (c.status ?? "pending") === "pending" && couponLegs.filter((l) => l.coupon_id === c.id).length === 3).length} hint="Kliknij, aby zobaczyć kupony i wszystkie zdarzenia" icon={Ticket} className="h-full transition-colors group-hover:border-primary/60" />
        </Link>
        <Link to="/kupony" aria-label="Otwórz listę kandydatów do kuponów" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard label="Kandydaci >75%" value={candidates} hint="Kliknij, aby zobaczyć kandydatów i generator kuponów" className="h-full transition-colors group-hover:border-primary/60" />
        </Link>
        <Link to="/historia" aria-label="Otwórz mecze do rozliczenia" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard label="Do rozliczenia / weryfikacji" value={toSettle} hint="Kliknij, aby sprawdzić brakujące wyniki" tone={toSettle ? "warning" : "default"} className="h-full transition-colors group-hover:border-primary/60" />
        </Link>
      </div>
      {europeanMatches.length === 0 && (
        <div className="mt-6">
          <EmptyState icon={CalendarDays} title="Brak meczów europejskich" description="Wykonaj europejski skan FootyNomad lub zaimportuj europejskie mecze w Terminarzu." action={<Button asChild><Link to="/mecze">Przejdź do Terminarza</Link></Button>} />
        </div>
      )}
      <NoGuarantee className="mt-6" />
    </div>
  );
}
