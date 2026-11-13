"use client";
import { useActionState } from "react";
import { resetPasswordAction, type FormState } from "../auth-actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState | null, FormData>(resetPasswordAction, null);
  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="token" value={token} />
      <p className="muted" style={{ margin: 0 }}>Mínimo de 10 caracteres, com letras e números.</p>
      <label>Nova senha<input name="password" type="password" autoComplete="new-password" required minLength={10} /></label>
      <label>Confirmar senha<input name="confirm" type="password" autoComplete="new-password" required minLength={10} /></label>
      {state?.error && <p role="alert" className="err" style={{ margin: 0 }}>{state.error}</p>}
      <button className="primary" disabled={pending}>{pending ? "Salvando…" : "Salvar senha"}</button>
    </form>
  );
}
