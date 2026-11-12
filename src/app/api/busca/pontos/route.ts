import type { NextRequest } from "next/server";
import { getValidSession } from "@/lib/session";
import { allowedUfsFor } from "@/lib/access";
import { parseFilters, searchMapPoints } from "@/lib/search";

export const dynamic = "force-dynamic";

// Protegida pelo proxy (exige login). Mesmos filtros da /busca.
export async function GET(req: NextRequest) {
  const orgId = (await getValidSession())?.organizationId;
  if (!orgId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = parseFilters(sp);
  return Response.json(await searchMapPoints({ ...filters, cursor: undefined }, { allowedUfs: await allowedUfsFor(orgId) }));
}
