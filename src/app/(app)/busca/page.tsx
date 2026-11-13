import Link from "next/link";
import { parseFilters, searchListings } from "@/lib/search";
import { requireSession } from "@/lib/session";
import { allowedUfsFor, canExportCsv } from "@/lib/access";
import { tenantDb } from "@/lib/tenancy";
import { saveSearch } from "../actions";
import { PropertyMap } from "../PropertyMap";
import { SearchFilters } from "../SearchFilters";
import { prisma } from "@/lib/prisma";
import { AUCTION_LABEL, OCC_LABEL, STATUS_LABEL, TYPE_LABEL, fmtBRL, fmtDate, fmtDaysUntil, fmtM2, fmtPricePerM2, pricePerM2 } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buscar imóveis — Regnus Leilões" };

type SP = Record<string, string | string[] | undefined>;
const val0 = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export default async function BuscaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const u = await requireSession();
  const sources = await prisma.source.findMany({ where: { listings: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const [allowedUfs, csvOk] = await Promise.all([allowedUfsFor(u.organizationId), canExportCsv(u.organizationId)]);
  const vista = val0(sp.vista) === "mapa" ? "mapa" : "lista";
  const { items, nextCursor, total } = vista === "mapa" ? { items: [], nextCursor: null, total: null } : await searchListings(f, { allowedUfs });
  const favIds = await tenantDb(u.organizationId, u.id).favorites.ids(items.map((l) => l.propertyId).filter((x): x is string => !!x));
  const val = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v ?? ""; };
  const activeCount = ["q", "uf", "cidade", "bairro", "tipo", "leilao", "fonte", "ocupacao", "status", "precoMin", "precoMax", "descMin", "areaMin", "quartos", "pracaAte", "financia", "fgts"].filter((k) => (val(k) ?? "").trim() !== "").length;

  const mapQuery = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "cursor" && k !== "vista" && v != null).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v!])).toString();
  const toggle = (v: string) => `/busca?${new URLSearchParams([...new URLSearchParams(mapQuery), ["vista", v]]).toString()}`;

  // link da próxima página preserva os filtros (compartilhável)
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== "cursor" && v != null) next.set(k, Array.isArray(v) ? v.join(",") : v);
  if (nextCursor) next.set("cursor", nextCursor);

  return (
    <div className="layout">
      <SearchFilters activeCount={activeCount}>
      <form className="filters" method="get">
        {vista === "mapa" && <input type="hidden" name="vista" value="mapa" />}
        <label>Busca livre<input name="q" defaultValue={val("q")} placeholder="rua, bairro, palavra…" /></label>
        <label>UF
          <select name="uf" defaultValue={val("uf")}><option value="">Todas</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
        </label>
        <label>Cidade<input name="cidade" defaultValue={val("cidade")} /></label>
        <label>Bairro<input name="bairro" defaultValue={val("bairro")} /></label>
        <label>Tipo
          <select name="tipo" defaultValue={val("tipo")}><option value="">Todos</option>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label>Modalidade
          <select name="leilao" defaultValue={val("leilao")}><option value="">Todas</option>{Object.entries(AUCTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label>Fonte
          <select name="fonte" defaultValue={val("fonte")}><option value="">Todas</option>{sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </label>
        <label>Situação
          <select name="status" defaultValue={val("status")}>
            <option value="">Ativos (abertos e em breve)</option>
            <option value="CLOSED,SOLD,CANCELLED,SUSPENDED">Encerrados / retirados (histórico)</option>
            <option value="UPCOMING,OPEN,CLOSED,SOLD,CANCELLED,SUSPENDED">Todos</option>
          </select>
        </label>
        <label>Ocupação
          <select name="ocupacao" defaultValue={val("ocupacao")}><option value="">Qualquer</option>{["UNOCCUPIED", "OCCUPIED"].map((k) => <option key={k} value={k}>{OCC_LABEL[k]}</option>)}</select>
        </label>
        <label>Lance mínimo de (R$)<input name="precoMin" inputMode="decimal" defaultValue={val("precoMin")} /></label>
        <label>Lance mínimo até (R$)<input name="precoMax" inputMode="decimal" defaultValue={val("precoMax")} /></label>
        <label>Desconto mínimo (%)<input name="descMin" inputMode="decimal" defaultValue={val("descMin")} /></label>
        <label>Área mínima (m²)<input name="areaMin" inputMode="decimal" defaultValue={val("areaMin")} /></label>
        <label>Quartos (mín.)<input name="quartos" inputMode="numeric" defaultValue={val("quartos")} /></label>
        <label>Praça até<input type="date" name="pracaAte" defaultValue={val("pracaAte")} /></label>
        <label><span><input type="checkbox" name="financia" value="1" defaultChecked={!!f.financia} /> Aceita financiamento</span></label>
        <label><span><input type="checkbox" name="fgts" value="1" defaultChecked={!!f.fgts} /> Aceita FGTS</span></label>
        <label>Ordenar por
          <select name="ordem" defaultValue={f.ordem}>
            <option value="desconto">Maior desconto</option><option value="preco">Menor preço</option>
            <option value="praca">Praça mais próxima</option><option value="recentes">Mais recentes</option>
          </select>
        </label>
        <button className="primary" type="submit">Buscar</button>
        <Link href="/busca" className="muted">Limpar filtros</Link>
      </form>
      </SearchFilters>

      <section className="search-results" aria-label="Resultados da busca">
        <div className="search-heading">
          <h1>Buscar imóveis</h1>
          {total != null && <p className="muted">{total.toLocaleString("pt-BR")} imóveis encontrados</p>}
        </div>
        <details className="panel">
          <summary>🔔 Salvar esta busca e receber alertas</summary>
          <form action={saveSearch} className="inline-form" style={{ marginTop: 8 }}>
            <input type="hidden" name="params" value={JSON.stringify(Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "cursor" && v != null && v !== "").map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v])))} />
            <input name="name" aria-label="Nome da busca" placeholder="Nome da busca" required maxLength={80} />
            <select name="frequency" aria-label="Frequência dos alertas" defaultValue="DAILY"><option value="DAILY">Resumo diário</option><option value="IMMEDIATE">Imediato</option></select>
            <button className="primary" type="submit">Salvar</button>
          </form>
        </details>
        <div className="search-toolbar">
          <nav className="view-switch" aria-label="Visualização dos imóveis">
            <Link href={toggle("lista")} aria-current={vista === "lista" ? "page" : undefined}>☰ Lista</Link>
            <Link href={toggle("mapa")} aria-current={vista === "mapa" ? "page" : undefined}>🗺 Mapa</Link>
          </nav>
          {csvOk
            ? <a href={`/api/busca/export?${mapQuery}`}>⬇ Exportar CSV (até 5.000)</a>
            : <span className="muted" title="Disponível em planos com exportação">⬇ Exportar CSV (indisponível no seu plano)</span>}
        </div>
        {vista === "mapa" && <PropertyMap query={mapQuery} />}
        {vista === "lista" && items.length === 0 && <div className="panel">Nenhum imóvel encontrado com esses filtros.</div>}
        <div className="grid">
          {items.map((l) => (
            <Link key={l.id} href={`/imovel/${l.propertyId ?? ""}`} className="card" target="_blank" rel="noopener">
              {l.images[0] ? <img className="photo" src={l.images[0].url} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <div className="photo" />}
              <div className="body">
                <span className="muted">{l.propertyId && favIds.has(l.propertyId) ? "★ " : ""}{TYPE_LABEL[l.property?.type ?? "OTHER"]} · {l.property?.city}/{l.property?.uf}</span>
                <strong>{l.status !== "OPEN" && l.status !== "UPCOMING" && <span className="badge">{STATUS_LABEL[l.status]}</span>} {l.title}</strong>
                <span className="price">{fmtBRL(l.minBid)} {l.discountPct != null && Number(l.discountPct) > 0 && <span className="badge">-{Number(l.discountPct).toFixed(0)}%</span>}</span>
                <span className="muted">Avaliação {fmtBRL(l.appraisalValue)} · {fmtM2(l.property?.privateArea ?? l.property?.totalArea ?? l.property?.landArea)}</span>
                <span className="muted">{AUCTION_LABEL[l.auctionType]} · {l.source.name}{l.nextAuctionAt ? ` · praça ${fmtDate(l.nextAuctionAt)}${fmtDaysUntil(l.nextAuctionAt) ? ` (${fmtDaysUntil(l.nextAuctionAt)})` : ""}` : ""}</span>
                {pricePerM2(l.minBid, l.property) != null && <span className="muted">{fmtPricePerM2(pricePerM2(l.minBid, l.property))}</span>}
              </div>
            </Link>
          ))}
        </div>
        {vista === "lista" && nextCursor && <p className="pagination"><Link href={`/busca?${next.toString()}`}>Próxima página →</Link></p>}
      </section>
    </div>
  );
}
