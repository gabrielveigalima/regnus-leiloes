import Link from "next/link";
import { requireSession } from "@/lib/session";
import { tenantDb } from "@/lib/tenancy";
import { TYPE_LABEL, fmtBRL } from "@/lib/format";
import { toggleFavorite, updateFavorite } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Favoritos — Regnus Leilões" };

export default async function FavoritosPage() {
  const u = await requireSession();
  const favs = await tenantDb(u.organizationId, u.id).favorites.list();

  return (
    <>
      <h1>Favoritos</h1>
      {favs.length === 0 && <div className="panel">Você ainda não favoritou nenhum imóvel. <Link href="/busca">Buscar imóveis</Link></div>}
      {favs.map((f) => {
        const l = f.property.listings[0];
        return (
          <div className="panel" key={f.id}>
            <h3 style={{ margin: 0 }}><Link href={`/imovel/${f.propertyId}`} target="_blank" rel="noopener">{l?.title ?? "Imóvel"}</Link></h3>
            <p className="muted">{TYPE_LABEL[f.property.type]} · {f.property.city}/{f.property.uf} · {fmtBRL(l?.minBid)}{f.label ? ` · [${f.label}]` : ""}</p>
            <form action={updateFavorite.bind(null, f.propertyId)} style={{ display: "grid", gap: 6, maxWidth: 520 }}>
              <input name="label" placeholder="Etiqueta (ex.: analisar)" defaultValue={f.label ?? ""} maxLength={40} />
              <textarea name="note" placeholder="Nota" defaultValue={f.note ?? ""} maxLength={2000} rows={2} />
              <span><button className="primary" type="submit">Salvar</button></span>
            </form>
            <form action={toggleFavorite.bind(null, f.propertyId)} style={{ marginTop: 6 }}><button type="submit">Remover dos favoritos</button></form>
          </div>
        );
      })}
    </>
  );
}
