import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Execuções — Admin Regnus" };

export default async function ExecucoesPage({ searchParams }: { searchParams: Promise<{ fonte?: string }> }) {
  const { fonte } = await searchParams;
  const sourceId = fonte && /^[a-z0-9_-]{1,40}$/i.test(fonte) ? fonte : undefined;
  const runs = await prisma.crawlRun.findMany({
    where: sourceId ? { sourceId } : {}, orderBy: { startedAt: "desc" }, take: 100,
    include: { source: { select: { name: true } } },
  });

  return (
    <>
      <h1>Execuções {sourceId && <span className="muted">— {sourceId} (<Link href="/admin/execucoes">todas</Link>)</span>}</h1>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="t">
          <thead><tr><th>Início</th><th>Fonte</th><th>Tipo</th><th>Status</th><th>Duração</th><th>Vistos</th><th>Novos</th><th>Atualiz.</th><th>Removidos</th><th>Erros</th><th>Log</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.startedAt)}</td>
                <td><Link href={`/admin/execucoes?fonte=${r.sourceId}`}>{r.source.name}</Link></td>
                <td>{r.isFull ? "completa" : "parcial"}</td>
                <td>{r.status}</td>
                <td>{r.finishedAt ? `${Math.round((+r.finishedAt - +r.startedAt) / 1000)}s` : "—"}</td>
                <td>{r.seen}</td><td>{r.created}</td><td>{r.updated}</td><td>{r.removed}</td><td>{r.errors}</td>
                <td>{r.log ? <details><summary>ver</summary><pre style={{ maxWidth: 420, whiteSpace: "pre-wrap", fontSize: 12 }}>{r.log}</pre></details> : ""}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={11} className="muted">Nenhuma execução registrada.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
