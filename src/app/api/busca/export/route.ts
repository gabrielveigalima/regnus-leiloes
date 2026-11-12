import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { allowedUfsFor, canExportCsv } from "@/lib/access";
import { parseFilters, buildWhere, buildOrderBy } from "@/lib/search";
import { prisma } from "@/lib/prisma";
import { csvDocument, dec } from "@/lib/csv";
import { AUCTION_LABEL, OCC_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";
const EXPORT_LIMIT = 5000;

const HEADER = ["Fonte", "ID na fonte", "Título", "Tipo", "UF", "Cidade", "Bairro", "Endereço", "Área privativa (m²)", "Área total (m²)", "Terreno (m²)", "Quartos", "Vagas",
  "Ocupação", "Modalidade", "Status", "Valor de avaliação", "Lance mínimo", "Desconto (%)", "Próxima praça", "Financiamento", "FGTS", "Link do anúncio", "ID Regnus"];

/** GET /api/busca/export?<mesmos filtros da busca> — CSV (até 5.000 linhas), conforme o plano. Sessão obrigatória (proxy). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;
  if (!orgId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canExportCsv(orgId))) return Response.json({ error: "O plano da sua organização não inclui exportação CSV." }, { status: 403 });

  const filters = parseFilters(Object.fromEntries(req.nextUrl.searchParams.entries()));
  const rows = await prisma.listing.findMany({
    where: buildWhere({ ...filters, cursor: undefined }, { allowedUfs: await allowedUfsFor(orgId) }),
    orderBy: buildOrderBy(filters.ordem), take: EXPORT_LIMIT,
    include: { property: true, source: { select: { name: true } } },
  });
  const body = csvDocument([HEADER, ...rows.map((l) => {
    const p = l.property;
    return [
      l.source.name, l.externalId, l.title, p ? TYPE_LABEL[p.type] : "", p?.uf, p?.city, p?.neighborhood,
      [p?.street, p?.number, p?.complement].filter(Boolean).join(", "),
      dec(p?.privateArea), dec(p?.totalArea), dec(p?.landArea), p?.bedrooms, p?.parking,
      p ? OCC_LABEL[p.occupation] : "", AUCTION_LABEL[l.auctionType], STATUS_LABEL[l.status],
      dec(l.appraisalValue), dec(l.minBid), dec(l.discountPct), l.nextAuctionAt?.toISOString().slice(0, 16).replace("T", " ") ?? "",
      l.acceptsFinancing ? "Sim" : "Não", l.acceptsFgts ? "Sim" : "Não", l.url, l.propertyId,
    ];
  })]);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="regnus-leiloes-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
