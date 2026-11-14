"use client";

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
    <main style={{ maxWidth: 360, margin: "20vh auto", padding: 24, textAlign: "center" }}>
      <h1>PTG Fantasy</h1>
      <p>Fantasy de la liga de pádel de Padel Team Gourmet.</p>
      <button onClick={signInWithGoogle} disabled={busy} style={{ padding: "12px 20px", fontSize: 16 }}>
        {busy ? "Abriendo Google…" : "Entrar con Google"}
      </button>
      {failed && <p role="alert">No pudimos iniciar sesión. Inténtalo de nuevo.</p>}
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
