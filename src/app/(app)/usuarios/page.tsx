import { requireSession } from "@/lib/session";
import { getPlan } from "@/lib/access";
import { listMembers } from "@/lib/users";
import { changeRoleAction, removeMemberAction, resendInviteAction } from "./actions";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuários — Regnus Leilões" };
const ROLE: Record<string, string> = { OWNER: "Proprietário", ADMIN: "Administrador", MEMBER: "Membro" };

export default async function UsuariosPage() {
  const u = await requireSession();
  if (u.role === "MEMBER") return <div className="panel">Somente administradores da organização gerenciam usuários.</div>;
  const [members, plan] = await Promise.all([listMembers(u.organizationId), getPlan(u.organizationId)]);
  const isOwner = u.role === "OWNER";

  return (
    <>
      <h1>Usuários</h1>
      <p className="muted">{members.length}{plan.maxUsers != null ? ` de ${plan.maxUsers}` : ""} usuários no plano {plan.name}.</p>
      <InviteForm isOwner={isOwner} />
      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="t">
          <thead><tr><th>Usuário</th><th>Papel</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>
            {members.map((m) => {
              const self = m.userId === u.id;
              const canTouch = isOwner || m.role === "MEMBER";
              return (
                <tr key={m.id}>
                  <td><strong>{m.user.name ?? m.user.email}</strong><br /><span className="muted">{m.user.email}</span></td>
                  <td>
                    {isOwner && !self ? (
                      <form action={changeRoleAction.bind(null, m.userId)} style={{ display: "inline-flex", gap: 4 }}>
                        <select name="role" defaultValue={m.role}>{Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                        <button type="submit">Alterar</button>
                      </form>
                    ) : ROLE[m.role]}
                  </td>
                  <td>{m.user.passwordSetAt ? "Ativo" : "Convite pendente"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {!m.user.passwordSetAt && canTouch && <form action={resendInviteAction.bind(null, m.userId)} style={{ display: "inline" }}><button type="submit">Reenviar convite</button></form>}{" "}
                    {!self && canTouch && <form action={removeMemberAction.bind(null, m.userId)} style={{ display: "inline" }}><button type="submit">Remover</button></form>}
                    {self && <span className="muted">você</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
