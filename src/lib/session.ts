import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";

/** Sessão obrigatória; redireciona ao login. Toda consulta de dados de usuário usa organizationId daqui. */
export async function requireSession() {
  const s = await getServerSession(authOptions);
  if (!s?.user?.id || !s.user.organizationId) redirect("/login");
  return s.user;
}

/** Somente administradores da plataforma (Regnus). */
export async function requirePlatformAdmin() {
  const u = await requireSession();
  if (!u.isPlatformAdmin) redirect("/busca");
  return u;
}
