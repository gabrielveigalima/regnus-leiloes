"use client";
import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type FormState } from "../auth-actions";

export default function EsqueciSenhaPage() {
  const [state, action, pending] = useActionState<FormState | null, FormData>(forgotPasswordAction, null);
  return (
    <form className="filters" action={action} style={{ maxWidth: 360, margin: "10vh auto" }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Esqueci minha senha</h1>
      {state?.ok ? (
        <p role="status">Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha (válido por 1 hora).</p>
      ) : (
        <>
          <label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
          <button className="primary" disabled={pending}>{pending ? "Enviando…" : "Enviar link"}</button>
        </>
      )}
      <Link href="/login" className="muted">Voltar ao login</Link>
    </form>
  );
}
