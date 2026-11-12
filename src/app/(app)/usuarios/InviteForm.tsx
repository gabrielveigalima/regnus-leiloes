"use client";
import { useActionState } from "react";
import { inviteAction, type InviteState } from "./actions";

export function InviteForm({ isOwner }: { isOwner: boolean }) {
  const [s, action, pending] = useActionState<InviteState | null, FormData>(inviteAction, null);
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Convidar usuário</h2>
      <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="email" type="email" placeholder="E-mail" required />
        <input name="name" placeholder="Nome (opcional)" maxLength={80} />
        <select name="role" defaultValue="MEMBER">
          <option value="MEMBER">Membro</option>
          {isOwner && <option value="ADMIN">Administrador</option>}
          {isOwner && <option value="OWNER">Proprietário</option>}
        </select>
        <button className="primary" disabled={pending}>{pending ? "Convidando…" : "Convidar"}</button>
      </form>
      {s?.error && <p role="alert" style={{ color: "#b42318" }}>{s.error}</p>}
      {s?.link && (
        <div role="status">
          <p>{s.emailed ? "Convite enviado por e-mail." : "E-mail não enviado (SMTP não configurado ou falhou)."} Link de ativação (72 h) — copie e envie ao usuário:</p>
          <pre style={{ background: "#f2f4f7", padding: 8, overflowX: "auto" }}>{s.link}</pre>
        </div>
      )}
    </div>
  );
}
