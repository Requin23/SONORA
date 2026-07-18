import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sonora",
  description: "Plateforme de chansons personnalisees avec paiement YengaPay et production manuelle via Suno.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
