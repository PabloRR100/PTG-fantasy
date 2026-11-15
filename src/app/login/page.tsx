"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(params.get("error") === "auth");

  async function signInWithGoogle() {
    setBusy(true);
    setFailed(false);
    const redirect = params.get("redirect") ?? "/";
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <main className="page narrow auth-card">
      <Image src="/brand/icon-192.png" alt="" width={96} height={96} className="auth-logo" priority />
      <h1>Padel Fantasy</h1>
      <p>Fantasy de pádel: ficha jugadores reales, alinéalos y compite con tus amigos.</p>
      <button onClick={signInWithGoogle} disabled={busy}>
        {busy ? "Abriendo Google…" : "Entrar con Google"}
      </button>
      {failed && <p role="alert" className="msg msg-error">No pudimos iniciar sesión. Inténtalo de nuevo.</p>}
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary for the page to prerender.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
