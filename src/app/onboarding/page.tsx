import Image from "next/image";
import { redirect } from "next/navigation";
import { CreateTeamForm } from "@/components/forms";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/session";
import { getProfile } from "@/services/game-data";

export default async function OnboardingPage() {
  const db = await createClient();
  const userId = await requireUserId(db);
  if (await getProfile(db, userId)) redirect("/equipo");

  return (
    <main className="page narrow">
      <Image src="/brand/ptg-icon-192.png" alt="PTG" width={72} height={72} className="auth-logo" />
      <h1>Crea tu equipo</h1>
      <p>Te damos 5.000.000 € y una plantilla de 12 jugadores al azar: 3 de cada nivel (Blanco, Azul, Verde y Rosa). Podrás cambiar la alineación y pujar por más jugadores cuando quieras.</p>
      <CreateTeamForm />
    </main>
  );
}
