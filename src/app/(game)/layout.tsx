import { GameHeader } from "@/components/GameHeader";
import { InstallBanner } from "@/components/InstallBanner";
import { UpdateBanner } from "@/components/UpdateBanner";
import { PushReminderBanner } from "@/components/PushReminderBanner";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { formatMoney } from "@/lib/format";
import { requireManager } from "@/lib/session";
import { getUnreadCount } from "@/services/game-data";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const { db, userId, profile, avatarUrl } = await requireManager();
  const unread = await getUnreadCount(db, userId);

  return (
    <div className="shell">
      <GameHeader teamName={profile.team_name} budget={formatMoney(profile.budget)} avatarUrl={avatarUrl} isAdmin={profile.is_admin} unread={unread} />
      <ServiceWorkerRegistrar />
      <main className="page">
        <UpdateBanner />
        <InstallBanner />
        <PushReminderBanner />
        {children}
      </main>
    </div>
  );
}
