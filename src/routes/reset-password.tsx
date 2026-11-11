import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Brand } from "@/components/app/AppShell";
import { Field } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nowe hasło — MONEYBALL GLOBAL 2.0" },
      { name: "description", content: "Ustaw nowe hasło do panelu MONEYBALL GLOBAL 2.0." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState("");
  const handled = useRef(false);

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

    // Supabase may return either a PKCE code, a token_hash, or tokens in the URL hash.
    // Never treat an ordinary logged-in session as proof that a recovery link was opened.
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const tokenType = url.searchParams.get("type");
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const oneTimeToken = hash.get("recovery");
    if (oneTimeToken) {
      setRecoveryToken(oneTimeToken);
      finish(true);
      return () => { active = false; subscription.unsubscribe(); };
    }
    const hashType = hash.get("type");

    const subscription = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") finish(true);
    }).data.subscription;

    const verify = async () => {
      try {
        if (code) {
          const { error } = await sb.auth.exchangeCodeForSession(code);
          if (error) throw error;
          finish(true);
          return;
        }
        if (tokenHash && (tokenType === "recovery" || tokenType === "email")) {
          const { error } = await sb.auth.verifyOtp({
            token_hash: tokenHash,
            type: tokenType as "recovery" | "email",
          });
          if (error) throw error;
          finish(true);
          return;
        }
        if (hashType === "recovery" && hash.get("access_token") && hash.get("refresh_token")) {
          const { error } = await sb.auth.setSession({
            access_token: hash.get("access_token")!,
            refresh_token: hash.get("refresh_token")!,
          });
          if (error) throw error;
          finish(true);
          return;
        }
        // A PASSWORD_RECOVERY event can be delivered asynchronously by detectSessionInUrl.
        const { data } = await sb.auth.getSession();
        if (data.session && hashType === "recovery") {
          finish(true);
          return;
        }
        finish(false, "Ten link nie jest linkiem odzyskiwania hasła albo jest niekompletny. Nie loguj się zwykłym linkiem — wygeneruj jeden nowy link resetujący.");
      } catch (e) {
        finish(false, e instanceof Error ? e.message : "Nie udało się zweryfikować linku odzyskiwania.");
      }
    };

    if (!handled.current) {
      handled.current = true;
      void verify();
    }
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!ready) return setErr("Najpierw otwórz i zweryfikuj link odzyskiwania hasła.");
    if (pw.length < 12) return setErr("Ustaw hasło o długości co najmniej 12 znaków.");
    if (pw !== pw2) return setErr("Hasła się różnią.");
    const sb = getSupabase();
    if (!sb) return setErr("Brak połączenia z bazą.");
    setBusy(true);
    if (recoveryToken) {
      try {
        const response = await fetch("https://gzgeklcukrclgwbsmbsp.supabase.co/functions/v1/moneyball-password-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: recoveryToken, password: pw }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Nie udało się zmienić hasła.");
        await sb.auth.signOut();
        window.history.replaceState({}, document.title, window.location.pathname);
        toast.success("Hasło zmienione. Zaloguj się nowym hasłem.");
        navigate({ to: "/login" });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Nie udało się zmienić hasła.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    toast.success("Hasło zostało zmienione. Możesz korzystać z MONEYBALL.");
    navigate({ to: "/panel" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Brand /></div>
        <div className="surface-card p-6">
          <h1 className="text-3xl font-bold uppercase">Ustaw nowe hasło</h1>
          {checking ? (
            <p className="mt-3 text-sm text-muted-foreground">Weryfikuję bezpieczny link odzyskiwania…</p>
          ) : !ready ? (
            <div className="mt-4 grid gap-3">
              <p className="text-sm text-destructive">{err}</p>
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/login" })}>Wróć do logowania</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 grid gap-4">
              <p className="text-sm text-muted-foreground">Link potwierdzony. Ustaw nowe hasło — nie wpisuj dotychczasowego.</p>
              <Field label="Nowe hasło (minimum 12 znaków)" htmlFor="pw">
                <Input id="pw" type="password" autoComplete="new-password" minLength={12} value={pw} onChange={(e) => setPw(e.target.value)} />
              </Field>
              <Field label="Powtórz nowe hasło" htmlFor="pw2" error={err}>
                <Input id="pw2" type="password" autoComplete="new-password" minLength={12} value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </Field>
              <Button type="submit" disabled={busy}>{busy ? "Zapisywanie…" : "Zapisz nowe hasło"}</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
