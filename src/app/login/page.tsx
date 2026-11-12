"use client";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", { email: fd.get("email"), password: fd.get("password"), redirect: false });
    setBusy(false);
    if (res?.ok) {
      const cb = params.get("callbackUrl") ?? "/busca";
      window.location.href = cb.startsWith("/") && !cb.startsWith("//") ? cb : "/busca";
    } else setError("E-mail ou senha inválidos (ou muitas tentativas; aguarde alguns minutos).");
  }

  return (
    <form className="filters" onSubmit={onSubmit} style={{ maxWidth: 360, margin: "10vh auto" }}>
      <img src="/logo_transparente.png" alt="Regnus Leilões" height={40} style={{ background: "#0f2a4a", padding: 8, borderRadius: 6 }} />
      <label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
      <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
      {params.get("redefinida") && <p role="status" style={{ margin: 0 }}>Senha definida. Entre com a nova senha.</p>}
      {error && <p role="alert" style={{ color: "#b42318", margin: 0 }}>{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
      <a href="/esqueci-senha" className="muted">Esqueci minha senha</a>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
