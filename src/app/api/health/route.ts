import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const last = await prisma.source.aggregate({ _max: { lastSuccessAt: true } });
    const at = last._max.lastSuccessAt;
    return Response.json({ ok: true, db: "up", lastSuccessfulCrawl: at, ageMinutes: at ? Math.round((Date.now() - at.getTime()) / 60000) : null });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
