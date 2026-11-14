"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions";
import { initialsOf } from "@/lib/avatar";

type Props = { teamName: string; budget: string; avatarUrl: string | null; isAdmin: boolean };

const FOCUSABLE = 'a[href], button:not([disabled])';

/** Profile photo, or the team's initials when there is no photo or it fails to load. */
function Avatar({ url, name, size }: { url: string | null; name: string; size: "sm" | "lg" }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`avatar avatar-${size}`}>
      {url && !failed ? (
        // referrerPolicy: Google's photo host rejects some cross-site referrers.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
}

export function Drawer({ teamName, budget, avatarUrl, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  const links = [
    { href: "/equipo", label: "Equipo" },
    { href: "/mercado", label: "Mercado" },
    { href: "/jugadores", label: "Jugadores" },
    { href: "/clasificacion", label: "Clasificación" },
    { href: "/normas", label: "Normas de juego" },
    ...(isAdmin ? [{ href: "/admin", label: "Administración" }] : []),
  ];

  // Navigating anywhere (link, back button) closes the menu.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      trigger.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") return setOpen(false);
      if (event.key !== "Tab" || !panel.current) return;
      // Keep Tab inside the open menu.
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="avatar-button"
        aria-label="Abrir menú"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="game-menu"
        onClick={() => setOpen(true)}
      >
        <Avatar url={avatarUrl} name={teamName} size="sm" />
      </button>

      <div className={`drawer-overlay ${open ? "is-open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        id="game-menu"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        className={`drawer ${open ? "is-open" : ""}`}
        // A closed menu must not be reachable by keyboard or screen reader.
        inert={!open}
      >
        <div className="drawer-head">
          <Avatar url={avatarUrl} name={teamName} size="lg" />
          <div className="drawer-who">
            <strong>{teamName}</strong>
            <span>{budget} disponibles</span>
          </div>
          <button type="button" className="drawer-close" aria-label="Cerrar menú" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <nav aria-label="Menú del juego" className="drawer-links">
          {links.map((link) => (
            <Link key={link.href} href={link.href} aria-current={pathname.startsWith(link.href) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="drawer-foot">
          <button type="submit" className="link-button">Cerrar sesión</button>
        </form>
      </div>
    </>
  );
}
