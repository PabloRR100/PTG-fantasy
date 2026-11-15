import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icons";
import { Drawer } from "@/components/Drawer";
import { Nav } from "@/components/Nav";

type Props = { teamName: string; budget: string; avatarUrl: string | null; isAdmin: boolean; unread?: number };

/** Top bar: profile photo (opens the side menu) on the left, brand mark, and the page tabs. */
export function GameHeader({ teamName, budget, avatarUrl, isAdmin, unread = 0 }: Props) {
  return (
    <header className="topbar">
      <Drawer teamName={teamName} budget={budget} avatarUrl={avatarUrl} isAdmin={isAdmin} />
      <div className="brand">
        <Image src="/brand/icon-192.png" alt="" width={40} height={40} className="brand-logo" priority />
        <div>
          <span className="brand-title">Padel Fantasy</span>
          <span className="budget">{teamName} · {budget}</span>
        </div>
      </div>
      <Nav isAdmin={isAdmin} />
      <Link href="/buzon" className="bell" aria-label={unread > 0 ? `Buzón: ${unread} sin leer` : "Buzón"}>
        <Icon name="bell" size={22} />
        {unread > 0 && <span className="bell-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </Link>
    </header>
  );
}
