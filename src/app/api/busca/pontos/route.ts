import type { NextRequest } from "next/server";
import { parseFilters, searchMapPoints } from "@/lib/search";

export const dynamic = "force-dynamic";

// Protegida pelo proxy (exige login). Mesmos filtros da /busca.
export async function GET(req: NextRequest) {
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = parseFilters(sp);
  return Response.json(await searchMapPoints({ ...filters, cursor: undefined }));
}
