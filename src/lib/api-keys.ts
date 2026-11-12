import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

const PREFIX_LEN = 8;

export interface NewApiKey { key: string; prefix: string; hash: string }

/** Formato: `rl_<prefixo 8>_<segredo 43>`. O segredo só existe na criação; guardamos prefixo (visível) e sha256. */
export function generateApiKey(): NewApiKey {
  const prefix = randomBytes(6).toString("base64url").slice(0, PREFIX_LEN);
  const secret = randomBytes(32).toString("base64url");
  return { key: `rl_${prefix}_${secret}`, prefix, hash: hashSecret(secret) };
}

export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

export function parseApiKey(raw: string | null | undefined): { prefix: string; secret: string } | null {
  const m = /^rl_([A-Za-z0-9_-]{8})_([A-Za-z0-9_-]{43})$/.exec((raw ?? "").trim());
  return m ? { prefix: m[1]!, secret: m[2]! } : null;
}

export function verifySecret(secret: string, expectedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), "hex"), b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type KeyAuth =
  | { ok: true; keyId: string; organizationId: string; allowedUfs: string[] | null }
  | { ok: false; status: 401 | 403; error: string };

/** Valida a chave e o acesso à API do plano. Mesma resposta para chave inexistente e segredo errado. */
export async function authenticateApiKey(raw: string | null | undefined): Promise<KeyAuth> {
  const parsed = parseApiKey(raw);
  if (!parsed) return { ok: false, status: 401, error: "Chave de API ausente ou inválida." };
  const row = await prisma.apiKey.findUnique({
    where: { prefix: parsed.prefix },
    include: { organization: { include: { plan: true } } },
  });
  if (!row || row.revokedAt || !verifySecret(parsed.secret, row.hash)) return { ok: false, status: 401, error: "Chave de API ausente ou inválida." };
  if (!row.organization.plan.apiAccess) return { ok: false, status: 403, error: "O plano da organização não inclui acesso à API." };
  const ufs = row.organization.plan.allowedUfs;
  return { ok: true, keyId: row.id, organizationId: row.organizationId, allowedUfs: Array.isArray(ufs) ? (ufs as string[]) : null };
}

/** Lê `Authorization: Bearer <chave>` ou `X-API-Key`. */
export function extractKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return headers.get("x-api-key");
}
