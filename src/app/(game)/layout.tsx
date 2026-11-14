import { GameHeader } from "@/components/GameHeader";
import { formatMoney } from "@/lib/format";
import { requireManager } from "@/lib/session";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const { profile, avatarUrl } = await requireManager();

  return (
    <div className="shell">
      <GameHeader teamName={profile.team_name} budget={formatMoney(profile.budget)} avatarUrl={avatarUrl} isAdmin={profile.is_admin} />
      <main className="page">{children}</main>
    </div>
  );
}
