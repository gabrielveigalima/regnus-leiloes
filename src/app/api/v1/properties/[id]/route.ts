import type { NextRequest } from "next/server";
import { withApiKey, apiError } from "@/lib/api-auth";
import { serializeListing, serializeProperty } from "@/lib/api-serialize";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/v1/properties/:id — o imóvel com todos os anúncios (uma entrada por fonte). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApiKey(req, async (ctx) => {
    const { id } = await params;
    const p = await prisma.property.findUnique({
      where: { id },
      include: { listings: { include: { source: { select: { id: true, name: true } }, rounds: true, images: true }, orderBy: { firstSeenAt: "asc" } } },
    });
    // UF fora do plano responde 404 (não revela que o imóvel existe)
    if (!p || (ctx.allowedUfs && (!p.uf || !ctx.allowedUfs.includes(p.uf)))) return apiError(404, "not_found", "Imóvel não encontrado.");
    return Response.json({ data: { ...serializeProperty(p), listings: p.listings.map(serializeListing) } });
  });
}
