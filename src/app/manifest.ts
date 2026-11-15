import type { MetadataRoute } from "next";

// What makes the web installable ("Add to Home Screen"). iPhone only allows web push from an installed app,
// so without this manifest iOS users could never get notifications. Colors are the app's own.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Padel Fantasy",
    short_name: "Padel Fantasy",
    description: "Fantasy de pádel: ficha jugadores reales, alinéalos y compite con tus amigos",
    lang: "es",
    start_url: "/equipo",
    scope: "/",
    display: "standalone",
    background_color: "#F4EFE1",
    theme_color: "#2A5D47",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
