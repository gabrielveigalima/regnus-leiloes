import type { ReactNode } from "react";
import Link from "next/link";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="top">
        <Link href="/busca"><img src="/logo_transparente.png" alt="Regnus Leilões" height={32} /></Link>
        <Link href="/busca">Buscar imóveis</Link>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
