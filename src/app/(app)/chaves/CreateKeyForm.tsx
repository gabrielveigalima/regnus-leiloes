"use client";
import { useActionState } from "react";
import { createApiKeyAction, type ApiKeyResult } from "../actions";

export function CreateKeyForm() {
  const [state, action, pending] = useActionState<ApiKeyResult | null, FormData>(createApiKeyAction, null);
  return (
    <div className="panel">
      <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="name" placeholder="Nome da chave (ex.: integração CRM)" maxLength={60} required />
        <button className="primary" type="submit" disabled={pending}>{pending ? "Criando…" : "Criar chave"}</button>
      </form>
      {state?.error && <p role="alert" style={{ color: "#b42318" }}>{state.error}</p>}
      {state?.key && (
        <div role="status" style={{ marginTop: 8 }}>
          <strong>Copie agora — esta chave não será exibida novamente:</strong>
          <pre style={{ background: "#f2f4f7", padding: 8, overflowX: "auto" }}>{state.key}</pre>
        </div>
      )}
    </div>
  );
}
