import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canUseApi } from "@/lib/access";
import { fmtDate } from "@/lib/format";
import { revokeApiKey } from "../actions";
import { CreateKeyForm } from "./CreateKeyForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chaves de API — Regnus Leilões" };

export default async function ChavesPage() {
  const u = await requireSession();
  const isAdmin = u.role === "OWNER" || u.role === "ADMIN";
  const [apiOk, keys] = await Promise.all([
    canUseApi(u.organizationId),
    isAdmin ? prisma.apiKey.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
  ]);

  return (
    <>
      <h1>Chaves de API</h1>
      {!isAdmin && <div className="panel">Somente administradores da organização gerenciam chaves de API.</div>}
      {isAdmin && !apiOk && <div className="panel">O plano da sua organização não inclui acesso à API.</div>}
      {isAdmin && apiOk && (
        <>
          <p className="muted">Use <code>Authorization: Bearer &lt;chave&gt;</code>. Limite de {process.env.API_RATE_LIMIT ?? 60} requisições por minuto por chave. Veja <code>docs/api.md</code>.</p>
          <CreateKeyForm />
        </>
      )}
      {keys.map((k) => (
        <div className="panel" key={k.id}>
          <strong>{k.name}</strong> <code>rl_{k.prefix}_…</code>
          <span className="muted"> · criada em {fmtDate(k.createdAt)}{k.revokedAt ? ` · revogada em ${fmtDate(k.revokedAt)}` : ""}</span>{" "}
          {!k.revokedAt && <form action={revokeApiKey.bind(null, k.id)} style={{ display: "inline" }}><button type="submit">Revogar</button></form>}
        </div>
      ))}
    </>
  );
}
