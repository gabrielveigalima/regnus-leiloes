import type { ReactNode } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { SignOutButton } from "./SignOutButton";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();
  return (
    <>
      <header className="top">
        <Link href="/busca"><img src="/logo_transparente.png" alt="Regnus Leilões" height={32} /></Link>
        <Link href="/busca">Buscar imóveis</Link>
        <Link href="/favoritos">Favoritos</Link>
        <Link href="/alertas">Alertas</Link>
        {(user.role === "OWNER" || user.role === "ADMIN") && <Link href="/usuarios">Usuários</Link>}
        {(user.role === "OWNER" || user.role === "ADMIN") && <Link href="/chaves">API</Link>}
        {user.isPlatformAdmin && <Link href="/admin/fontes">Admin</Link>}
        <span style={{ flex: 1 }} />
        <Link href="/conta" style={{ fontSize: 13 }}>{user.name ?? user.email}</Link>
        <SignOutButton />
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
