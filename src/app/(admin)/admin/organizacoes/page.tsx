import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { changePlanAction } from "../org-actions";
import { CreateOrgForm } from "./CreateOrgForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizações — Admin Regnus" };

export default async function OrganizacoesPage() {
  const [orgs, plans] = await Promise.all([
    prisma.organization.findMany({ orderBy: { createdAt: "asc" }, include: { plan: true, _count: { select: { memberships: true, apiKeys: true, savedSearches: true } } } }),
    prisma.plan.findMany({ orderBy: { id: "asc" } }),
  ]);
  return (
    <>
      <h1>Organizações</h1>
      <CreateOrgForm plans={plans.map((p) => ({ id: p.id, name: p.name }))} />
      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="t">
          <thead><tr><th>Organização</th><th>Plano</th><th>Usuários</th><th>Buscas salvas</th><th>Chaves de API</th><th>Criada em</th></tr></thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td><strong>{o.name}</strong><br /><span className="muted">{o.slug}</span></td>
                <td>
                  <form action={changePlanAction.bind(null, o.id)} style={{ display: "inline-flex", gap: 4 }}>
                    <select name="planId" defaultValue={o.planId}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                    <button type="submit">Alterar</button>
                  </form>
                </td>
                <td>{o._count.memberships}{o.plan.maxUsers != null ? ` / ${o.plan.maxUsers}` : ""}</td>
                <td>{o._count.savedSearches}{o.plan.maxSavedSearches != null ? ` / ${o.plan.maxSavedSearches}` : ""}</td>
                <td>{o._count.apiKeys}</td>
                <td>{fmtDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
