import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;

  return (
    <main style={{ maxWidth: 480, margin: "20vh auto", padding: 24 }}>
      <h1>PTG Fantasy</h1>
      <p>Sesión iniciada como {email ?? "usuario"}.</p>
    </main>
  );
}
