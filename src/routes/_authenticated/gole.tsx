import { createFileRoute } from "@tanstack/react-router";
import { DataError, PageLoader } from "@/components/app/ui-bits";
import { GoalsView } from "@/components/app/GoalsView";
import { ensureTables } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/gole")({
  head: () => ({ meta: [{ title: "Prognozy goli — MONEYBALL GLOBAL" }, { name: "description", content: "Prognozy Over/Under, BTTS i oczekiwane gole." }] }),
  loader: ({ context }) => ensureTables(context.queryClient, ["matches", "predictions"]),
  pendingComponent: PageLoader,
  errorComponent: DataError,
  component: GoalsView,
});
