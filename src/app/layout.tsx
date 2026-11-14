import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// PTG's own faces (files taken from app.padelteamgourmet.com): Bricolage Grotesque for titles,
// Geist for the interface, Archivo Narrow for small labels.
const display = localFont({ src: "./fonts/bricolage.woff2", variable: "--font-display-loaded", weight: "700 800", display: "swap" });
const ui = localFont({ src: "./fonts/geist.woff2", variable: "--font-ui-loaded", weight: "400 700", display: "swap" });
const label = localFont({ src: "./fonts/archivo_narrow.woff2", variable: "--font-label-loaded", weight: "400 700", display: "swap" });

export const metadata: Metadata = {
  title: "PTG Fantasy",
  description: "Fantasy de la liga de pádel de Padel Team Gourmet",
};

export const viewport: Viewport = { themeColor: "#2A5D47" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${ui.variable} ${label.variable}`}>
      <body>{children}</body>
    </html>
  );
}
