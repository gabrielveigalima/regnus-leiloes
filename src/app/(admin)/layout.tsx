import type { ReactNode } from "react";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/session";
import { SignOutButton } from "../(app)/SignOutButton";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatformAdmin();
  return (
    <>
      <header className="top">
        <Link href="/busca"><img src="/logo_transparente.png" alt="Regnus Leilões" height={32} /></Link>
        <Link href="/admin/fontes">Fontes</Link>
        <Link href="/admin/execucoes">Execuções</Link>
        <Link href="/busca">← App</Link>
        <span style={{ flex: 1 }} />
        <span style={{ color: "#fff", fontSize: 13 }}>{user.email}</span>
        <SignOutButton />
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
