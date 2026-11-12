import type { NextRequest } from "next/server";
import { authenticateApiKey, extractKey } from "./api-keys";
import { FixedWindowLimiter } from "./rate-limit";

const limiter = new FixedWindowLimiter(Number(process.env.API_RATE_LIMIT ?? 60), 60_000);

export interface ApiContext { keyId: string; organizationId: string; allowedUfs: string[] | null }

export const apiError = (status: number, code: string, message: string, headers?: HeadersInit) =>
  Response.json({ error: { code, message } }, { status, headers });

/** Autentica a chave, aplica o limite por chave e injeta os cabeçalhos X-RateLimit-* na resposta. */
export async function withApiKey(req: NextRequest, handler: (ctx: ApiContext) => Promise<Response>, rl = limiter): Promise<Response> {
  const auth = await authenticateApiKey(extractKey(req.headers));
  if (!auth.ok) return apiError(auth.status, auth.status === 401 ? "unauthorized" : "forbidden", auth.error, auth.status === 401 ? { "WWW-Authenticate": "Bearer" } : undefined);

  const r = rl.hit(auth.keyId);
  const rlHeaders: Record<string, string> = {
    "X-RateLimit-Limit": String(r.limit), "X-RateLimit-Remaining": String(r.remaining), "X-RateLimit-Reset": String(Math.ceil(r.resetAt / 1000)),
  };
  if (!r.allowed) {
    return apiError(429, "rate_limited", "Limite de requisições excedido.", { ...rlHeaders, "Retry-After": String(Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000))) });
  }
  const res = await handler({ keyId: auth.keyId, organizationId: auth.organizationId, allowedUfs: auth.allowedUfs });
  for (const [k, v] of Object.entries(rlHeaders)) res.headers.set(k, v);
  return res;
}
