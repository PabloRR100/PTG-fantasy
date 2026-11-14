import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PTG Fantasy",
  description: "Fantasy de la liga de pádel de Padel Team Gourmet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
