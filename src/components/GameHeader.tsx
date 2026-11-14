import Image from "next/image";
import { Drawer } from "@/components/Drawer";
import { Nav } from "@/components/Nav";

type Props = { teamName: string; budget: string; avatarUrl: string | null; isAdmin: boolean };

/** Top bar: profile photo (opens the side menu) on the left, PTG mark, and the page tabs. */
export function GameHeader({ teamName, budget, avatarUrl, isAdmin }: Props) {
  return (
    <header className="topbar">
      <Drawer teamName={teamName} budget={budget} avatarUrl={avatarUrl} isAdmin={isAdmin} />
      <div className="brand">
        <Image src="/brand/ptg-icon-192.png" alt="" width={40} height={40} className="brand-logo" priority />
        <div>
          <span className="brand-title">PTG Fantasy</span>
          <span className="budget">{teamName} · {budget}</span>
        </div>
      </div>
      <Nav isAdmin={isAdmin} />
    </header>
  );
}
