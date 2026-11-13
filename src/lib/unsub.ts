import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET não definido");
  return s;
}
const mac = (id: string) => createHmac("sha256", secret()).update(`unsub:${id}`).digest("base64url");

/** Link de descadastro de uma busca salva (assinado; não exige login). */
export function unsubscribeUrl(appUrl: string, savedSearchId: string): string {
  return `${appUrl}/alertas/cancelar?id=${encodeURIComponent(savedSearchId)}&sig=${mac(savedSearchId)}`;
}

export function verifyUnsubscribe(id: string | undefined, sig: string | undefined): boolean {
  if (!id || !sig) return false;
  const a = Buffer.from(mac(id)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
