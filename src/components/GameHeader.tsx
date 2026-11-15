import Link from "next/link";
import { Icon } from "@/components/Icons";
import { Drawer } from "@/components/Drawer";
import { Nav } from "@/components/Nav";

type Props = { teamName: string; budget: string; avatarUrl: string | null; isAdmin: boolean; unread?: number };

/** Top bar, two rows: profile photo (opens the side menu) | title | bell, then the page tabs. */
export function GameHeader({ teamName, budget, avatarUrl, isAdmin, unread = 0 }: Props) {
  return (
    <header className="topbar">
      <Drawer teamName={teamName} budget={budget} avatarUrl={avatarUrl} isAdmin={isAdmin} />
      <div className="brand">
        <span className="brand-title">Padel Fantasy</span>
        <span className="budget">{teamName} · {budget}</span>
      </div>
      <Link href="/buzon" className="bell" aria-label={unread > 0 ? `Buzón: ${unread} sin leer` : "Buzón"}>
        <Icon name="bell" size={22} />
        {unread > 0 && <span className="bell-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </Link>
      <Nav />
    </header>
  );
}
