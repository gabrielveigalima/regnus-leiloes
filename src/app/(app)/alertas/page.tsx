import Link from "next/link";
import { requireSession } from "@/lib/session";
import { tenantDb } from "@/lib/tenancy";
import { fmtDate } from "@/lib/format";
import { deleteSearch, setSearchFrequency } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alertas — Regnus Leilões" };

export default async function AlertasPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const u = await requireSession();
  const { ok, erro } = await searchParams;
  const searches = await tenantDb(u.organizationId, u.id).savedSearches.list();

  return (
    <>
      <h1>Buscas salvas e alertas</h1>
      <p className="muted">Você recebe um e-mail em <strong>{u.email}</strong> quando surgem imóveis novos ou queda de preço que casam com a busca. Crie alertas em <Link href="/busca">Buscar imóveis</Link>.</p>
      {ok && <div className="panel" role="status">Busca salva. Alertas valem a partir de agora.</div>}
      {erro && <div className="panel err" role="alert">{erro}</div>}
      {searches.length === 0 && <div className="panel">Nenhuma busca salva ainda.</div>}
      {searches.map((s) => {
        const qs = new URLSearchParams(s.filters as Record<string, string>).toString();
        return (
          <div className="panel" key={s.id}>
            <h3 style={{ margin: 0 }}><Link href={`/busca?${qs}`}>{s.name}</Link></h3>
            <p className="muted">Última verificação: {fmtDate(s.lastRunAt ?? s.createdAt)}</p>
            <form action={setSearchFrequency.bind(null, s.id)} style={{ display: "inline-flex", gap: 6 }}>
              <select name="frequency" defaultValue={s.frequency}><option value="DAILY">Resumo diário</option><option value="IMMEDIATE">Imediato</option></select>
              <button type="submit">Alterar</button>
            </form>{" "}
            <form action={deleteSearch.bind(null, s.id)} style={{ display: "inline" }}><button type="submit">Excluir</button></form>
          </div>
        );
      })}
    </>
  );
}
