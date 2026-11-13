"use client";
import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type FormState } from "../auth-actions";

export default function EsqueciSenhaPage() {
  const [state, action, pending] = useActionState<FormState | null, FormData>(forgotPasswordAction, null);
  return (
    <div className="auth-wrap">
      <form className="auth-card" action={action}>
        <div className="auth-top"><img src="/logo-horizontal.png" alt="Regnus Leilões" /></div>
        <div className="auth-body">
          <h1>Esqueci minha senha</h1>
          {state?.ok ? (
            <p role="status">Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha (válido por 1 hora).</p>
          ) : (
            <>
              <label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
              <button className="primary" disabled={pending}>{pending ? "Enviando…" : "Enviar link"}</button>
            </>
          )}
          <Link href="/login" className="muted">Voltar ao login</Link>
        </div>
      </form>
    </div>
  );
}
