import type { ReactNode } from "react";
import { requirePlatformAdmin } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatformAdmin();
  return (
    <>
      <AppHeader
        items={[
          { href: "/admin/fontes", label: "Fontes" }, { href: "/admin/execucoes", label: "Execuções" },
          { href: "/admin/duplicados", label: "Duplicados" }, { href: "/admin/organizacoes", label: "Organizações" },
          { href: "/busca", label: "← Aplicativo" },
        ]}
        userLabel={user.name ?? user.email ?? ""}
        home="/admin/fontes"
      />
      <main className="wrap">{children}</main>
    </>
  );
}
