"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/tablon", label: "Tablón" },
  { href: "/equipo", label: "Equipo" },
  { href: "/mercado", label: "Mercado" },
  { href: "/jornada", label: "Jornada" },
  { href: "/clasificacion", label: "Clasificación" },
];

/** The five main tabs, second row of the top bar; the rest (Jugadores, Buzón, Normas, Ajustes, Administración) is in the side menu. */
export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={pathname.startsWith(l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
