import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  History,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Settings,
  ShieldHalf,
  Target,
  Ticket,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
const logo = "https://raw.githubusercontent.com/damianwalus3-jpg/moneyball-global/main/src/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type NavTo =
  | "/panel"
  | "/mecze"
  | "/prognozy-1x2"
  | "/double-chance"
  | "/kupony"
  | "/historia"
  | "/statystyki"
  | "/bankroll"
  | "/ustawienia";

const NAV: { to: NavTo; label: string; short: string; icon: LucideIcon }[] = [
  { to: "/panel", label: "Panel", short: "Panel", icon: LayoutDashboard },
  { to: "/mecze", label: "Terminarz / Mecze", short: "Mecze", icon: CalendarDays },
  { to: "/prognozy-1x2", label: "Prognozy 1X2", short: "1X2", icon: Target },
  { to: "/double-chance", label: "Double Chance", short: "DC", icon: ShieldHalf },
  { to: "/kupony", label: "Kupony", short: "Kupony", icon: Ticket },
  { to: "/historia", label: "Historia / Rozliczenia", short: "Historia", icon: History },
  { to: "/statystyki", label: "Statystyki", short: "Statystyki", icon: BarChart3 },
  { to: "/bankroll", label: "Bankroll", short: "Bankroll", icon: Wallet },
  { to: "/ustawienia", label: "Ustawienia", short: "Ustawienia", icon: Settings },
];
const MOBILE_MAIN: NavTo[] = ["/panel", "/mecze", "/prognozy-1x2", "/double-chance", "/kupony"];

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={logo} alt="" width={36} height={36} className="size-9 rounded-lg" />
      <div className="leading-none">
        <div className="font-display text-lg font-bold tracking-wide">MONEYBALL</div>
        {!compact && <div className="eyebrow mt-0.5 text-primary">Global 2.0</div>}
      </div>
    </div>
  );
}

export function AppShell({ email, children }: { email: string | null; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Refresh the authenticated user's fixtures immediately on every app entry,
  // then repeat every 15 minutes while the app is visible.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    let lastAttemptAt = 0;
    let running = false;
    let disposed = false;

    const brusselsDate = () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Brussels",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

    const syncFixtures = async (force = false) => {
      if (disposed || running) return;
      if (!force && Date.now() - lastAttemptAt < 15 * 60_000) return;
      running = true;
      lastAttemptAt = Date.now();
      try {
        // Fixture import and result settlement are separate backend jobs.
        // Run both on app entry and on the 15-minute refresh cycle.
        const fixtureSync = await sb.functions.invoke("footynomad-sync", {
          body: { date: brusselsDate() },
        });
        if (fixtureSync.error) {
          console.error("[MONEYBALL] Synchronizacja terminarza nie powiodła się:", fixtureSync.error);
        }

        const resultSync = await sb.functions.invoke("moneyball-results-sync");
        if (resultSync.error) {
          console.error("[MONEYBALL] Synchronizacja wyników nie powiodła się:", resultSync.error);
        } else if (resultSync.data?.ok === false) {
          console.error("[MONEYBALL] Rozliczanie wyników zgłosiło błędy:", resultSync.data.errors ?? resultSync.data.error);
        }

        if (!disposed && (!fixtureSync.error || !resultSync.error)) {
          await qc.invalidateQueries({ queryKey: ["table"] });
        }
      } catch (error) {
        console.error("[MONEYBALL] Automatyczna synchronizacja nie powiodła się:", error);
      } finally {
        running = false;
      }
    };

    // Always fetch fresh fixtures when the authenticated app shell is opened.
    void syncFixtures(true);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncFixtures();
    }, 60_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void syncFixtures();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [qc]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await getSupabase()?.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  const moreActive = !MOBILE_MAIN.some(isActive);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
                isActive(n.to) && "bg-sidebar-accent font-semibold text-primary",
              )}
            >
              <n.icon className="size-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="truncate text-xs text-muted-foreground">{email ?? "—"}</div>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={signOut}>
            <LogOut /> Wyloguj
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
        <Brand compact />
        <span className="eyebrow">Europe/Brussels</span>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-6">
          {NAV.filter((n) => MOBILE_MAIN.includes(n.to)).map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground",
                isActive(n.to) && "text-primary",
              )}
            >
              <n.icon className="size-5" />
              {n.short}
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground",
              moreActive && "text-primary",
            )}
          >
            <MoreHorizontal className="size-5" />
            Więcej
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl bg-card">
          <SheetHeader>
            <SheetTitle className="font-display uppercase">Więcej</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 py-4">
            {NAV.filter((n) => !MOBILE_MAIN.includes(n.to)).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-sm",
                  isActive(n.to) && "border-primary/50 text-primary",
                )}
              >
                <n.icon className="size-5" />
                {n.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="truncate text-xs text-muted-foreground">{email}</span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut /> Wyloguj
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
