"use client";
import { useActionState } from "react";
import { createOrgAction, type OrgState } from "../org-actions";

export function CreateOrgForm({ plans }: { plans: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<OrgState | null, FormData>(createOrgAction, null);
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Nova organização</h2>
      <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="name" placeholder="Nome da organização" required maxLength={80} />
        <select name="planId" defaultValue={plans[0]?.id}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input name="ownerEmail" type="email" placeholder="E-mail do proprietário" required />
        <input name="ownerName" placeholder="Nome do proprietário" maxLength={80} />
        <button className="primary" disabled={pending}>{pending ? "Criando…" : "Criar e convidar"}</button>
      </form>
      {s?.error && <p role="alert" className="err">{s.error}</p>}
      {s?.link && (
        <div role="status">
          <p>{s.emailed ? "Convite enviado por e-mail." : "E-mail não enviado."} Link de ativação (72 h):</p>
          <pre className="secret">{s.link}</pre>
        </div>
      )}
    </div>
  );
}
