import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

/**
 * Sessão válida ou null. Confere no banco se o usuário ainda é membro da organização e usa o papel ATUAL
 * (o JWT dura 12 h: sem isso, quem foi removido ou rebaixado manteria o acesso).
 */
export async function getValidSession() {
  const s = await getServerSession(authOptions);
  const u = s?.user;
  if (!u?.id || !u.organizationId) return null;
  const m = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: u.organizationId, userId: u.id } }, select: { role: true } });
  if (!m) return null;
  return { ...u, role: m.role };
}

/** Sessão obrigatória; redireciona ao login. Toda consulta de dados de usuário usa organizationId daqui. */
export async function requireSession() {
  const u = await getValidSession();
  if (!u) redirect("/login");
  return u;
}

/** Somente administradores da plataforma (Regnus). */
export async function requirePlatformAdmin() {
  const u = await requireSession();
  if (!u.isPlatformAdmin) redirect("/busca");
  return u;
}
