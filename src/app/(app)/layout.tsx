import type { ReactNode } from "react";
import { requireSession } from "@/lib/session";
import { AppHeader, type NavItem } from "@/components/AppHeader";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();
  const admin = user.role === "OWNER" || user.role === "ADMIN";
  const items: NavItem[] = [
    { href: "/busca", label: "Buscar imóveis" },
    { href: "/favoritos", label: "Favoritos" },
    { href: "/alertas", label: "Alertas" },
    ...(admin ? [{ href: "/usuarios", label: "Usuários" }, { href: "/chaves", label: "API" }] : []),
    ...(user.isPlatformAdmin ? [{ href: "/admin/fontes", label: "Admin" }] : []),
  ];
  return (
    <>
      <AppHeader items={items} userLabel={user.name ?? user.email ?? ""} />
      <main className="wrap">{children}</main>
    </>
  );
}
