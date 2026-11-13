"use client";
import { useActionState } from "react";
import { changePasswordAction, updateProfileAction, type AccountState } from "./actions";

export function ProfileForm({ name }: { name: string }) {
  const [s, action, pending] = useActionState<AccountState | null, FormData>(updateProfileAction, null);
  return (
    <form action={action} className="panel" style={{ display: "grid", gap: 8, maxWidth: 420 }}>
      <h2 style={{ margin: 0 }}>Perfil</h2>
      <label>Nome<input name="name" defaultValue={name} maxLength={80} /></label>
      {s?.ok && <p role="status" style={{ margin: 0 }}>{s.ok}</p>}
      <span><button className="primary" disabled={pending}>Salvar</button></span>
    </form>
  );
}

export function PasswordForm() {
  const [s, action, pending] = useActionState<AccountState | null, FormData>(changePasswordAction, null);
  return (
    <form action={action} className="panel" style={{ display: "grid", gap: 8, maxWidth: 420 }}>
      <h2 style={{ margin: 0 }}>Alterar senha</h2>
      <label>Senha atual<input name="current" type="password" autoComplete="current-password" required /></label>
      <label>Nova senha (mín. 10, letras e números)<input name="next" type="password" autoComplete="new-password" required minLength={10} /></label>
      <label>Confirmar nova senha<input name="confirm" type="password" autoComplete="new-password" required minLength={10} /></label>
      {s?.error && <p role="alert" className="err" style={{ margin: 0 }}>{s.error}</p>}
      {s?.ok && <p role="status" style={{ margin: 0 }}>{s.ok}</p>}
      <span><button className="primary" disabled={pending}>Alterar senha</button></span>
    </form>
  );
}
