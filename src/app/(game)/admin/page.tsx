import { notFound } from "next/navigation";
import { CloseMarketButton } from "@/components/forms";
import { requireManager } from "@/lib/session";

export default async function AdminPage() {
  const { profile } = await requireManager();
  // Presentation only: admin_close_market() checks is_admin again inside the database.
  if (!profile.is_admin) notFound();

  return (
    <>
      <h1>Administración</h1>
      <p className="lead">
        Resuelve las pujas abiertas, guarda las alineaciones del ciclo y abre las subastas nuevas, igual que el cierre automático de las 06:00.
        Solo para pruebas y demos: no se puede deshacer.
      </p>
      <CloseMarketButton />
    </>
  );
}
