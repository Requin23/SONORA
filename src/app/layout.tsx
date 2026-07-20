import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sonora",
  description: "Plateforme de chansons personnalisées avec paiement YengaPay et production manuelle via Suno.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
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
