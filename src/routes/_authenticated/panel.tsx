import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Ticket, Trophy, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataError, EmptyState, NoGuarantee, PageHeader, PageLoader, StatCard } from "@/components/app/ui-bits";
import { bankrollBalance, hitRate, isCouponCandidate } from "@/lib/domain";
import { fmtMoney, fmtPct } from "@/lib/format";
import { ensureTables, useTable } from "@/lib/queries";
import { brusselsDayKey } from "@/lib/time";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => ({ meta: [{ title: "Panel — MONEYBALL GLOBAL 2.0" }, { name: "description", content: "Podsumowanie prognoz, kuponów i bankrolla." }, { property: "og:title", content: "Panel — MONEYBALL" }, { property: "og:description", content: "Podsumowanie prognoz." }] }),
  loader: ({ context }) => ensureTables(context.queryClient, ["matches", "predictions", "coupons", "bankroll_transactions", "match_results"]),
  pendingComponent: PageLoader,
  errorComponent: DataError,
  component: Panel,
});

function Panel() {
  const matches = useTable("matches");
  const preds = useTable("predictions");
  const coupons = useTable("coupons");
  const txs = useTable("bankroll_transactions");
  const results = useTable("match_results");
  const now = Date.now();
  const byId = new Map(matches.map((m) => [m.id, m]));
  const balance = bankrollBalance(txs);
  const today = brusselsDayKey(new Date());
  const todayCount = matches.filter((m) => m.kickoff_at && brusselsDayKey(m.kickoff_at) === today).length;
  // Dashboard reports overall model hit rate; the Statistics page separates selected and rejected picks.
  const validPicks = preds.filter((p) =>
    (p.prediction_type === "1X2" && ["1", "X", "2"].includes(p.pick)) ||
    (p.prediction_type === "DC" && ["1X", "X2", "12"].includes(p.pick)),
  );
  const hr1 = hitRate(validPicks.filter((p) => p.prediction_type === "1X2").map((p) => p.result_status));
  const hrDc = hitRate(validPicks.filter((p) => p.prediction_type === "DC").map((p) => p.result_status));
  const candidates = new Set(preds.filter((p) => isCouponCandidate(p, byId.get(p.match_id), now)).map((p) => p.match_id)).size;
  const resultIds = new Set(results.map((r) => r.match_id));
  const toSettle = matches.filter((m) => m.kickoff_at && new Date(m.kickoff_at).getTime() < now && !resultIds.has(m.id) && m.status !== "cancelled" && m.status !== "postponed").length;

  return (
    <div>
      <PageHeader eyebrow="Europe/Brussels" title="Panel" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bankroll" value={balance == null ? "brak danych" : fmtMoney(balance)} icon={Wallet} tone="primary" />
        <StatCard label="Mecze dziś" value={todayCount} icon={CalendarDays} />
        <StatCard label="Skuteczność 1X2" value={fmtPct(hr1.rate)} hint={`${hr1.won}/${hr1.settled} · model ogółem`} icon={Trophy} />
        <StatCard label="Skuteczność DC" value={fmtPct(hrDc.rate)} hint={`${hrDc.won}/${hrDc.settled} · model ogółem`} icon={Trophy} />
        <StatCard label="Kupony w grze" value={coupons.filter((c) => (c.status ?? "pending") === "pending").length} icon={Ticket} />
        <StatCard label="Kandydaci >75%" value={candidates} hint="mecze do kuponów" />
        <StatCard label="Do rozliczenia" value={toSettle} tone={toSettle ? "warning" : "default"} />
      </div>
      {matches.length === 0 && (
        <div className="mt-6">
          <EmptyState icon={CalendarDays} title="Brak meczów" description="Zaimportuj skan CSV lub dodaj pierwszy mecz w Terminarzu." action={<Button asChild><Link to="/mecze">Przejdź do Terminarza</Link></Button>} />
        </div>
      )}
      <NoGuarantee className="mt-6" />
    </div>
  );
}
