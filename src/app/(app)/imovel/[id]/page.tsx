import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { tenantDb } from "@/lib/tenancy";
import { PropertyMap } from "../../PropertyMap";
import { FavoriteButton } from "../../FavoriteButton";
import { updateFavorite } from "../../actions";
import { AUCTION_LABEL, OCC_LABEL, STATUS_LABEL, TYPE_LABEL, fmtBRL, fmtDate, fmtDaysUntil, fmtM2, fmtPricePerM2, pricePerM2 } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ImovelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.property.findUnique({
    where: { id },
    include: {
      listings: {
        orderBy: { firstSeenAt: "asc" },
        include: {
          source: { select: { name: true } },
          rounds: { orderBy: { number: "asc" } },
          images: { orderBy: { position: "asc" } },
          events: { orderBy: { at: "desc" }, take: 30 },
        },
      },
    },
  });
  if (!p) notFound();
  const u = await requireSession();
  const fav = await tenantDb(u.organizationId, u.id).favorites.get(p.id);

  const images = p.listings.flatMap((l) => l.images);
  const events = p.listings.flatMap((l) => l.events.map((e) => ({ ...e, source: l.source.name }))).sort((a, b) => +b.at - +a.at);
  const address = [p.street, p.number, p.complement].filter(Boolean).join(", ");
  const main = p.listings[0];

  return (
    <>
      <p><Link href="/busca">← Voltar à busca</Link></p>
      <div className="property-heading">
        <h1>{main?.title ?? "Imóvel"}</h1>
        <FavoriteButton propertyId={p.id} favorited={!!fav} />
      </div>
      {fav && (
        <form action={updateFavorite.bind(null, p.id)} className="panel" style={{ display: "grid", gap: 6, maxWidth: 520 }}>
          <input name="label" placeholder="Etiqueta" defaultValue={fav.label ?? ""} maxLength={40} />
          <textarea name="note" placeholder="Nota" defaultValue={fav.note ?? ""} maxLength={2000} rows={2} />
          <span><button className="primary" type="submit">Salvar nota</button></span>
        </form>
      )}
      <p className="muted">{address} {p.neighborhood && `· ${p.neighborhood}`} · {p.city}/{p.uf} {p.zip && `· CEP ${p.zip.replace(/(\d{5})(\d{3})/, "$1-$2")}`}</p>

      {images.length > 0 && (
        <div className="panel gallery">
          {images.map((i) => <img key={i.id} src={i.url} alt="Foto do imóvel" referrerPolicy="no-referrer" />)}
        </div>
      )}

      <div className="panel">
        <h2>Dados do imóvel</h2>
        <dl className="property-facts">
          <div><dt>Tipo</dt><dd>{TYPE_LABEL[p.type]}</dd></div>
          <div><dt>Ocupação</dt><dd>{OCC_LABEL[p.occupation]}</dd></div>
          <div><dt>Área privativa</dt><dd>{fmtM2(p.privateArea)}</dd></div>
          <div><dt>Área total</dt><dd>{fmtM2(p.totalArea)}</dd></div>
          <div><dt>Terreno</dt><dd>{fmtM2(p.landArea)}</dd></div>
          <div><dt>Quartos / vagas</dt><dd>{p.bedrooms ?? "—"} / {p.parking ?? "—"}</dd></div>
          <div><dt>Matrícula</dt><dd>{p.registry ?? "—"}</dd></div>
          <div><dt>Cartório</dt><dd>{p.registryOffice ?? "—"}</dd></div>
        </dl>
        {p.lat != null && p.lng != null && (
          <>
            {p.geoPrecision && p.geoPrecision !== "ADDRESS" && <p className="muted">Localização aproximada ({p.geoPrecision === "CITY" ? "centro da cidade" : "rua"}).</p>}
            <PropertyMap single={{ lat: Number(p.lat), lng: Number(p.lng), title: main?.title ?? "Imóvel" }} height={320} />
          </>
        )}
      </div>

      {p.listings.map((l) => (
        <div className="panel" key={l.id}>
          <h2>{l.source.name} <span className="badge">{STATUS_LABEL[l.status]}</span></h2>
          <p>
            <strong className="price">{fmtBRL(l.minBid)}</strong>{" "}
            {l.discountPct != null && Number(l.discountPct) > 0 && <span className="badge">-{Number(l.discountPct).toFixed(1)}%</span>}
            <span className="muted"> · Avaliação {fmtBRL(l.appraisalValue)} · {fmtPricePerM2(pricePerM2(l.minBid, p))}{l.nextAuctionAt && fmtDaysUntil(l.nextAuctionAt) ? ` · praça ${fmtDaysUntil(l.nextAuctionAt)}` : ""} · {AUCTION_LABEL[l.auctionType]}
              {l.seller ? ` · Comitente: ${l.seller}` : ""}{l.acceptsFinancing ? " · Aceita financiamento" : ""}{l.acceptsFgts ? " · Aceita FGTS" : ""}</span>
          </p>
          {l.rounds.length > 0 && (
            <div className="table-scroll" role="region" aria-label={`Praças de ${l.source.name}`} tabIndex={0}>
              <table className="t"><thead><tr><th>Praça</th><th>Data</th><th>Lance mínimo</th></tr></thead>
                <tbody>{l.rounds.map((r) => <tr key={r.id}><td>{r.number}ª</td><td>{fmtDate(r.date)}</td><td>{fmtBRL(r.minBid)}</td></tr>)}</tbody></table>
            </div>
          )}
          {l.description && <p>{l.description}</p>}
          {l.caseNumber && <p className="muted">Processo: {l.caseNumber}</p>}
          <p>
            <a href={l.url} target="_blank" rel="noreferrer">Ver anúncio original em {l.source.name} ↗</a>
            {l.noticeUrl && <> · <a href={l.noticeUrl} target="_blank" rel="noreferrer">Edital ↗</a></>}
          </p>
        </div>
      ))}

      <div className="panel">
        <h2>Linha do tempo</h2>
        {events.length === 0 ? <p className="muted">Sem eventos.</p> : (
          <div className="table-scroll" role="region" aria-label="Linha do tempo do imóvel" tabIndex={0}>
            <table className="t"><tbody>{events.map((e) => (
              <tr key={e.id}><td>{fmtDate(e.at)}</td><td>{e.source}</td><td>{eventLabel(e.kind)}</td><td>{e.oldValue ?? ""} {e.oldValue && e.newValue ? "→" : ""} {e.newValue ?? ""}</td></tr>
            ))}</tbody></table>
          </div>
        )}
      </div>
    </>
  );
}

const eventLabel = (k: string) => ({ CREATED: "Anúncio criado", PRICE_CHANGE: "Mudança de preço", STATUS_CHANGE: "Mudança de status", DATE_CHANGE: "Mudança de data", REMOVED: "Removido da fonte" }[k] ?? k);
