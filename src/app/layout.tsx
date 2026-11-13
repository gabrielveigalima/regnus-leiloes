import type { ReactNode } from "react";
import { Cinzel, Inter, Montserrat } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-brand" });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-heading" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });

export const metadata = {
  title: "Regnus Leilões",
  description: "Imóveis em leilão no Brasil — Grupo Regnus",
  icons: { icon: "/icon.png", shortcut: "/icon.png", apple: "/icon.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${cinzel.variable} ${montserrat.variable} ${inter.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
