import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brand } from "@/components/app/AppShell";
import { Field } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase";

type RecoveryPayload = { kind: "token_hash" | "code"; value: string };

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nowe hasło — MONEYBALL GLOBAL 2.0" },
      { name: "description", content: "Ustaw nowe hasło do panelu MONEYBALL GLOBAL 2.0." },
      { property: "og:title", content: "Nowe hasło — MONEYBALL GLOBAL 2.0" },
      { property: "og:description", content: "Ustaw nowe hasło do panelu." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState<RecoveryPayload | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setErr("Brak połączenia z bazą. Otwórz aplikację ponownie.");
      setChecking(false);
      return;
    }

    let active = true;
    const finish = (ok: boolean, message = "") => {
      if (!active) return;
      setReady(ok);
      setErr(message);
      setChecking(false);
    };

    // A PASSWORD_RECOVERY session is accepted only when Supabase explicitly emits
    // the recovery event; an ordinary existing login session is not sufficient.
    const subscription = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") finish(true);
    }).data.subscription;

    const url = new URL(window.location.href);
    const query = url.searchParams;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const errorDescription =
      query.get("error_description") ||
      hash.get("error_description") ||
      query.get("error") ||
      hash.get("error");

    if (errorDescription) {
      finish(false, errorDescription.replace(/\+/g, " "));
      return () => {
        active = false;
        subscription.unsubscribe();
      };
    }

    const tokenHash = query.get("token_hash");
    const tokenType = query.get("type");
    const code = query.get("code");
    const hashType = hash.get("type");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    // Important: do not consume token_hash or PKCE code during page load.
    // Email security scanners often pre-open links. Verification is deferred
    // until the user explicitly taps the confirmation button.
    if (tokenHash && tokenType === "recovery") {
      setPending({ kind: "token_hash", value: tokenHash });
      setChecking(false);
    } else if (code) {
      setPending({ kind: "code", value: code });
      setChecking(false);
    } else if (hashType === "recovery" && accessToken && refreshToken) {
      // Legacy implicit-flow links have already been verified by Supabase
      // before redirecting here, so only establish the returned session.
      sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (!active) return;
          if (error) finish(false, "Link resetujący jest nieprawidłowy lub wygasł. Poproś o nowy link.");
          else {
            window.history.replaceState({}, document.title, window.location.pathname);
            finish(true);
          }
        })
        .catch(() => finish(false, "Nie udało się potwierdzić linku. Sprawdź połączenie i spróbuj ponownie."));
    } else {
      finish(false, "Nie znaleziono danych odzyskiwania hasła. Wróć do logowania i poproś o nowy link.");
    }

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function confirmRecoveryLink() {
    const sb = getSupabase();
    if (!sb || !pending || verifying) return;
    setVerifying(true);
    setErr("");
    try {
      const result = pending.kind === "token_hash"
        ? await sb.auth.verifyOtp({ token_hash: pending.value, type: "recovery" })
        : await sb.auth.exchangeCodeForSession(pending.value);
      if (result.error) throw result.error;

      window.history.replaceState({}, document.title, window.location.pathname);
      setPending(null);
      setReady(true);
      setErr("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setErr(/expired|invalid|otp|token|already/i.test(message)
        ? "Ten link został już użyty, jest nieprawidłowy albo wygasł. Nie wysyłaj kolejnych próśb — skontaktuj się z pomocą lub użyj najnowszego, nieotwieranego linku."
        : message || "Nie udało się potwierdzić linku. Spróbuj ponownie.");
    } finally {
      setVerifying(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!ready) return setErr("Najpierw potwierdź link odzyskiwania hasła.");
    if (pw.length < 12) return setErr("Hasło musi mieć co najmniej 12 znaków.");
    if (pw.length > 128) return setErr("Hasło może mieć maksymalnie 128 znaków.");
    if (pw !== pw2) return setErr("Hasła się różnią.");

    const sb = getSupabase();
    if (!sb) return setErr("Brak połączenia z bazą.");

    setBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Hasło zostało zmienione. Zaloguj się nowym hasłem.");
      await sb.auth.signOut();
      navigate({ to: "/login", replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nie udało się zapisać nowego hasła.";
      setErr(/expired|invalid|otp|token/i.test(message)
        ? "Sesja odzyskiwania wygasła. Nie zmieniono hasła; potrzebny będzie nowy, ważny link."
        : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Brand /></div>
        <div className="surface-card p-6">
          <h1 className="text-3xl font-bold uppercase">Ustaw nowe hasło</h1>
          {checking ? (
            <p className="mt-3 text-sm text-muted-foreground">Sprawdzam link odzyskiwania…</p>
          ) : pending ? (
            <div className="mt-5 grid gap-4">
              <p className="text-sm text-muted-foreground">
                Link dotarł do aplikacji. Naciśnij przycisk, aby potwierdzić go bezpiecznie i przejść do ustawienia nowego hasła.
              </p>
              {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
              <Button type="button" disabled={verifying} onClick={confirmRecoveryLink}>
                {verifying ? "Potwierdzanie linku…" : "Potwierdź link i kontynuuj"}
              </Button>
            </div>
          ) : ready ? (
            <form onSubmit={submit} className="mt-5 grid gap-4">
              <p className="text-sm text-muted-foreground">Link został potwierdzony. Ustaw nowe hasło.</p>
              <Field label="Nowe hasło (minimum 12 znaków)" htmlFor="pw">
                <Input id="pw" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={pw} onChange={(e) => setPw(e.target.value)} />
              </Field>
              <Field label="Powtórz nowe hasło" htmlFor="pw2" error={err}>
                <Input id="pw2" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </Field>
              <Button type="submit" disabled={busy}>{busy ? "Zapisywanie…" : "Zapisz nowe hasło"}</Button>
            </form>
          ) : (
            <div className="mt-4 grid gap-3">
              {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/login" })}>Wróć do logowania</Button>
            </div>
          )}
          {!pending && !checking && !ready && err && <p role="alert" className="mt-3 text-sm text-destructive">{err}</p>}
        </div>
      </div>
    </div>
  );
}
