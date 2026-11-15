"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/tablon", label: "Tablón" },
  { href: "/equipo", label: "Equipo" },
  { href: "/mercado", label: "Mercado" },
  { href: "/jugadores", label: "Jugadores" },
  { href: "/clasificacion", label: "Clasificación" },
];

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Administración" }] : LINKS;
  return (
    <nav aria-label="Principal" className="nav">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={pathname.startsWith(l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
