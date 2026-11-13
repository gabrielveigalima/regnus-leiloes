"use client";
import { useActionState } from "react";
import { inviteAction, type InviteState } from "./actions";

export function InviteForm({ isOwner }: { isOwner: boolean }) {
  const [s, action, pending] = useActionState<InviteState | null, FormData>(inviteAction, null);
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Convidar usuário</h2>
      <form action={action} className="inline-form">
        <input name="email" type="email" placeholder="E-mail" required />
        <input name="name" placeholder="Nome (opcional)" maxLength={80} />
        <select name="role" defaultValue="MEMBER">
          <option value="MEMBER">Membro</option>
          {isOwner && <option value="ADMIN">Administrador</option>}
          {isOwner && <option value="OWNER">Proprietário</option>}
        </select>
        <button className="primary" disabled={pending}>{pending ? "Convidando…" : "Convidar"}</button>
      </form>
      {s?.error && <p role="alert" className="err">{s.error}</p>}
      {s?.link && (
        <div role="status">
          <p>{s.emailed ? "Convite enviado por e-mail." : "E-mail não enviado (SMTP não configurado ou falhou)."} Link de ativação (72 h) — copie e envie ao usuário:</p>
          <pre className="secret">{s.link}</pre>
        </div>
      )}
    </div>
  );
}
