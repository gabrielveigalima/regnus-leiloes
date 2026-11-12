import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApiKey, apiError } from "@/lib/api-auth";
import { parseFilters, searchListings } from "@/lib/search";
import { serializeListing, serializeProperty } from "@/lib/api-serialize";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const LimitSchema = z.coerce.number().int().min(1).max(100).catch(25);

/** GET /api/v1/properties — mesmos filtros da busca web (ver docs/api.md). Paginação por cursor. */
export async function GET(req: NextRequest) {
  return withApiKey(req, async (ctx) => {
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    let filters;
    try { filters = parseFilters(sp); } catch { return apiError(400, "invalid_filters", "Filtros inválidos."); }
    const limit = LimitSchema.parse(sp.limit ?? 25);
    const { items, nextCursor, total } = await searchListings(filters, { allowedUfs: ctx.allowedUfs, pageSize: limit });
    const full = await prisma.listing.findMany({
      where: { id: { in: items.map((i) => i.id) } },
      include: { source: { select: { id: true, name: true } }, rounds: true, images: true },
    });
    const byId = new Map(full.map((l) => [l.id, l]));
    return Response.json({
      data: items.flatMap((i) => {
        const l = byId.get(i.id);
        return l && i.property ? [{ ...serializeProperty(i.property), listing: serializeListing(l) }] : [];
      }),
      next_cursor: nextCursor,
      total,
    });
  });
}
