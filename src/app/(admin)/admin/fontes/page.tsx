import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { connectors } from "@/crawler/registry";
import { HEALTH_LABEL, computeHealth, errorRate, volumeDrop, type Health } from "@/lib/source-health";
import { fmtDate } from "@/lib/format";
import { clearRobotsBlock, runSourceNow, setSourceActive } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fontes — Admin Regnus" };

const COLOR: Record<Health, string> = {
  OK: "#067647", INACTIVE: "#667085", NO_CONNECTOR: "#667085", BLOCKED: "#b42318", NEVER: "#667085",
  FAILING: "#b42318", VOLUME_DROP: "#b54708", STALE: "#b54708",
};

export default async function FontesPage() {
  const [sources, counts, pendingJobs] = await Promise.all([
    prisma.source.findMany({ orderBy: [{ active: "desc" }, { id: "asc" }], include: { runs: { orderBy: { startedAt: "desc" }, take: 6 } } }),
    prisma.listing.groupBy({ by: ["sourceId"], where: { status: { in: ["OPEN", "UPCOMING"] } }, _count: true }),
    prisma.crawlJob.groupBy({ by: ["sourceId"], where: { status: { in: ["PENDING", "RUNNING"] } }, _count: true }),
  ]);
  const open = new Map(counts.map((c) => [c.sourceId, c._count]));
  const queued = new Map(pendingJobs.map((c) => [c.sourceId, c._count]));

  return (
    <>
      <h1>Fontes</h1>
      <p className="muted">“Rodar agora” enfileira uma coleta completa; o worker (<code>npm run worker</code> ou <code>worker:tick</code>) precisa estar ativo para executá-la.</p>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="t">
          <thead><tr><th>Fonte</th><th>Saúde</th><th>Anúncios abertos</th><th>Última coleta</th><th>Última execução</th><th>Erros</th><th>Ações</th></tr></thead>
          <tbody>
            {sources.map((s) => {
              const health = computeHealth({ active: s.active, hasConnector: !!connectors[s.id], blockedByRobots: s.blockedByRobots, intervalMinutes: s.intervalMinutes, lastSuccessAt: s.lastSuccessAt, runs: s.runs });
              const last = s.runs[0];
              const drop = volumeDrop(s.runs);
              const hasConnector = !!connectors[s.id];
              return (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><br /><span className="muted">{s.id} · a cada {Math.round(s.intervalMinutes / 60)}h</span></td>
                  <td>
                    <span style={{ color: COLOR[health], fontWeight: 600 }}>{HEALTH_LABEL[health]}</span>
                    {drop.dropped && <div className="muted">{drop.previous} → {drop.current} anúncios</div>}
                    {s.lastError && health === "FAILING" && <div className="muted" title={s.lastError}>{s.lastError.slice(0, 80)}</div>}
                  </td>
                  <td>{(open.get(s.id) ?? 0).toLocaleString("pt-BR")}</td>
                  <td>{fmtDate(s.lastSuccessAt)}</td>
                  <td>{last ? <>{last.status}<br /><span className="muted">{last.seen} vistos · {last.created} novos · {last.updated} atual. · {last.removed} rem.</span></> : "—"}</td>
                  <td>{last ? `${(errorRate(last) * 100).toFixed(1)}%` : "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {hasConnector ? (
                      <>
                        <form action={setSourceActive.bind(null, s.id, !s.active)} style={{ display: "inline" }}><button type="submit">{s.active ? "Desativar" : "Ativar"}</button></form>{" "}
                        <form action={runSourceNow.bind(null, s.id)} style={{ display: "inline" }}>
                          <button type="submit" className="primary" disabled={(queued.get(s.id) ?? 0) > 0}>{(queued.get(s.id) ?? 0) > 0 ? "Na fila" : "Rodar agora"}</button>
                        </form>{" "}
                      </>
                    ) : <span className="muted">sem conector </span>}
                    {s.blockedByRobots && <form action={clearRobotsBlock.bind(null, s.id)} style={{ display: "inline" }}><button type="submit">Reverificar robots</button></form>}
                    {" "}<Link href={`/admin/execucoes?fonte=${s.id}`}>histórico</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
