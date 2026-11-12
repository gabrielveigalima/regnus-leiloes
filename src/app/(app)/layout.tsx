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
        {user.isPlatformAdmin && <Link href="/admin/fontes">Admin</Link>}
        <span style={{ flex: 1 }} />
        <span style={{ color: "#fff", fontSize: 13 }}>{user.name ?? user.email}</span>
        <SignOutButton />
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
