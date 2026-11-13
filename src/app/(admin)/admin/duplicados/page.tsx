import { prisma } from "@/lib/prisma";
import { TYPE_LABEL, fmtBRL, fmtM2 } from "@/lib/format";
import { mergeDuplicate, rejectDuplicate } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duplicados — Admin Regnus" };

const include = {
  listings: { select: { id: true, title: true, url: true, minBid: true, source: { select: { name: true } } }, take: 5 },
} as const;

export default async function DuplicadosPage() {
  const [pending, total] = await Promise.all([
    prisma.duplicateCandidate.findMany({
      where: { status: "PENDING" }, orderBy: [{ score: "desc" }, { createdAt: "asc" }], take: 50,
      include: { propertyA: { include }, propertyB: { include } },
    }),
    prisma.duplicateCandidate.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <>
      <h1>Possíveis duplicados</h1>
      <p className="muted">{total} par{total === 1 ? "" : "es"} aguardando revisão{total > 50 ? " (mostrando 50)" : ""}. Mesclar move os anúncios e favoritos para o imóvel que você mantiver.</p>
      {pending.length === 0 && <div className="panel">Nada para revisar.</div>}
      {pending.map((c) => (
        <div className="panel" key={c.id}>
          <p><strong>Confiança {(Number(c.score) * 100).toFixed(0)}%</strong> <span className="muted">— {c.reason}</span></p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
            {([["A", c.propertyA], ["B", c.propertyB]] as const).map(([k, p]) => (
              <div key={k} style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 10 }}>
                <strong>Imóvel {k}</strong> <span className="muted">· {TYPE_LABEL[p.type]}</span>
                <div>{[p.street, p.number, p.complement].filter(Boolean).join(", ") || "—"}</div>
                <div className="muted">{p.neighborhood ? `${p.neighborhood} · ` : ""}{p.city}/{p.uf}{p.zip ? ` · CEP ${p.zip}` : ""}</div>
                <div className="muted">Priv. {fmtM2(p.privateArea)} · Total {fmtM2(p.totalArea)} · Terreno {fmtM2(p.landArea)}</div>
                <div className="muted">Matrícula {p.registry ?? "—"} · {p.registryOffice ?? "—"}</div>
                <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                  {p.listings.map((l) => (
                    <li key={l.id}><a href={l.url} target="_blank" rel="noreferrer">{l.source.name}: {l.title}</a> — {fmtBRL(l.minBid)}</li>
                  ))}
                </ul>
                <form action={mergeDuplicate.bind(null, c.id, k)}><button type="submit" className="primary">Manter {k} e mesclar</button></form>
              </div>
            ))}
          </div>
          <form action={rejectDuplicate.bind(null, c.id)} style={{ marginTop: 8 }}><button type="submit">Não são o mesmo imóvel</button></form>
        </div>
      ))}
    </>
  );
}
