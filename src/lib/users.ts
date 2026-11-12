import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { MemberRole, TokenPurpose } from "@prisma/client";
import { prisma } from "./prisma";
import { hashPassword, unusablePasswordHash, validatePassword } from "./password";
import { buildInviteEmail, buildResetEmail } from "./user-email";
import { getPlan } from "./access";
import type { Mailer } from "./alerts";

export const RESET_TTL_MS = 60 * 60_000;
export const INVITE_TTL_MS = 72 * 3600_000;
const TTL: Record<TokenPurpose, number> = { RESET: RESET_TTL_MS, INVITE: INVITE_TTL_MS };

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const appUrl = () => (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const normalizeEmail = (e: string) => e.trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- tokens ----------
/** Cria um token de uso único (invalida os anteriores não usados do mesmo tipo). Só o hash é guardado. */
export async function createToken(userId: string, purpose: TokenPurpose, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordToken.create({ data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + TTL[purpose]) } }),
  ]);
  return token;
}

/** O token ainda é válido? (não consome) */
export async function isTokenValid(token: string | null | undefined, now = new Date()): Promise<boolean> {
  if (!token || token.length < 20) return false;
  const t = await prisma.passwordToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!t && !t.usedAt && t.expiresAt > now;
}

/** Define a nova senha consumindo o token de forma atômica (dois usos simultâneos: só um vence). */
export async function resetPasswordWithToken(token: string, newPassword: string, now = new Date()): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const t = token ? await prisma.passwordToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } }) : null;
  if (!t || t.usedAt || t.expiresAt <= now) return { ok: false, error: "Link inválido ou expirado. Solicite um novo." };
  const policy = validatePassword(newPassword, t.user.email);
  if (policy) return { ok: false, error: policy };
  const passwordHash = await hashPassword(newPassword);
  const claimed = await prisma.passwordToken.updateMany({ where: { id: t.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (claimed.count !== 1) return { ok: false, error: "Link inválido ou expirado. Solicite um novo." };
  await prisma.$transaction([
    prisma.user.update({ where: { id: t.userId }, data: { passwordHash, passwordSetAt: now } }),
    prisma.passwordToken.updateMany({ where: { userId: t.userId, usedAt: null }, data: { usedAt: now } }), // invalida os demais
  ]);
  return { ok: true, userId: t.userId };
}

/** Envia o link de redefinição. Nunca revela se o e-mail existe. */
export async function requestPasswordReset(emailRaw: string, mailer: Mailer | null, log: (m: string) => void = console.log): Promise<void> {
  const email = normalizeEmail(emailRaw);
  if (!EMAIL_RE.test(email)) return;
  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: { take: 1 } } });
  if (!user || user.memberships.length === 0) return;
  const token = await createToken(user.id, "RESET");
  if (!mailer) { log("redefinição de senha: SMTP não configurado; e-mail não enviado"); return; }
  await mailer.send({ to: user.email, ...buildResetEmail({ link: `${appUrl()}/redefinir-senha?token=${token}`, hours: RESET_TTL_MS / 3600_000 }) });
}

export async function changeOwnPassword(userId: string, current: string, next: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return { ok: false, error: "Senha atual incorreta." };
  const policy = validatePassword(next, user.email);
  if (policy) return { ok: false, error: policy };
  if (await bcrypt.compare(next, user.passwordHash)) return { ok: false, error: "A nova senha deve ser diferente da atual." };
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), passwordSetAt: new Date() } });
  await prisma.passwordToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  return { ok: true };
}

// ---------- membros da organização ----------
export interface Actor { organizationId: string; userId: string; role: MemberRole }
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const canManage = (a: Actor) => a.role === "OWNER" || a.role === "ADMIN";
/** OWNER convida qualquer papel; ADMIN só convida/remove MEMBER. */
const canGrant = (a: Actor, role: MemberRole) => a.role === "OWNER" || (a.role === "ADMIN" && role === "MEMBER");

export function listMembers(organizationId: string) {
  return prisma.membership.findMany({
    where: { organizationId }, orderBy: [{ role: "asc" }, { id: "asc" }],
    include: { user: { select: { id: true, email: true, name: true, passwordSetAt: true } } },
  });
}

export async function inviteMember(actor: Actor, input: { email: string; name?: string; role: MemberRole }, mailer: Mailer | null): Promise<Result<{ link: string; emailed: boolean }>> {
  if (!canManage(actor)) return { ok: false, error: "Sem permissão." };
  if (!canGrant(actor, input.role)) return { ok: false, error: "Você só pode convidar membros com o papel Membro." };
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) return { ok: false, error: "E-mail inválido." };

  const plan = await getPlan(actor.organizationId);
  if (plan.maxUsers != null && (await prisma.membership.count({ where: { organizationId: actor.organizationId } })) >= plan.maxUsers) {
    return { ok: false, error: `Seu plano permite até ${plan.maxUsers} usuários.` };
  }
  const existing = await prisma.user.findUnique({ where: { email }, include: { memberships: { where: { organizationId: actor.organizationId } } } });
  if (existing) return { ok: false, error: existing.memberships.length ? "Esse e-mail já é membro da organização." : "Não foi possível convidar este e-mail." };

  const user = await prisma.user.create({ data: { email, name: input.name?.trim() || null, passwordHash: await unusablePasswordHash() } });
  await prisma.membership.create({ data: { organizationId: actor.organizationId, userId: user.id, role: input.role } });
  const token = await createToken(user.id, "INVITE");
  const link = `${appUrl()}/redefinir-senha?token=${token}`;
  const [org, inviter] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    prisma.user.findUnique({ where: { id: actor.userId } }),
  ]);
  let emailed = false;
  if (mailer) {
    try { await mailer.send({ to: email, ...buildInviteEmail({ link, orgName: org.name, inviterName: inviter?.name || inviter?.email || "Um administrador", hours: INVITE_TTL_MS / 3600_000 }) }); emailed = true; }
    catch { /* o administrador copia o link da tela */ }
  }
  return { ok: true, link, emailed };
}

async function ownerCount(organizationId: string) {
  return prisma.membership.count({ where: { organizationId, role: "OWNER" } });
}

export async function changeMemberRole(actor: Actor, targetUserId: string, role: MemberRole): Promise<Result> {
  if (actor.role !== "OWNER") return { ok: false, error: "Somente o proprietário altera papéis." };
  const m = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: actor.organizationId, userId: targetUserId } } });
  if (!m) return { ok: false, error: "Usuário não encontrado." };
  if (m.role === role) return { ok: true };
  if (m.role === "OWNER" && (await ownerCount(actor.organizationId)) <= 1) return { ok: false, error: "A organização precisa de ao menos um proprietário." };
  await prisma.membership.update({ where: { id: m.id }, data: { role } });
  return { ok: true };
}

export async function removeMember(actor: Actor, targetUserId: string): Promise<Result> {
  if (!canManage(actor)) return { ok: false, error: "Sem permissão." };
  if (targetUserId === actor.userId) return { ok: false, error: "Você não pode remover a si mesmo." };
  const m = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: actor.organizationId, userId: targetUserId } },
    include: { user: { select: { isPlatformAdmin: true } } },
  });
  if (!m) return { ok: false, error: "Usuário não encontrado." };
  if (!canGrant(actor, m.role)) return { ok: false, error: "Você não pode remover este usuário." };
  if (m.user.isPlatformAdmin) return { ok: false, error: "Contas de administração da plataforma não podem ser removidas aqui." };
  if (m.role === "OWNER" && (await ownerCount(actor.organizationId)) <= 1) return { ok: false, error: "A organização precisa de ao menos um proprietário." };

  const others = await prisma.membership.count({ where: { userId: targetUserId, organizationId: { not: actor.organizationId } } });
  if (others === 0) await prisma.user.delete({ where: { id: targetUserId } }); // cascata: favoritos, buscas, tokens
  else await prisma.membership.delete({ where: { id: m.id } });
  return { ok: true };
}

/** Reenvia o convite (novo link) para quem ainda não definiu a senha. */
export async function resendInvite(actor: Actor, targetUserId: string, mailer: Mailer | null): Promise<Result<{ link: string; emailed: boolean }>> {
  if (!canManage(actor)) return { ok: false, error: "Sem permissão." };
  const m = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: actor.organizationId, userId: targetUserId } },
    include: { user: { select: { email: true, passwordSetAt: true } } },
  });
  if (!m || !canGrant(actor, m.role)) return { ok: false, error: "Usuário não encontrado." };
  if (m.user.passwordSetAt) return { ok: false, error: "Esse usuário já ativou a conta." };
  const token = await createToken(m.userId, "INVITE");
  const link = `${appUrl()}/redefinir-senha?token=${token}`;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  let emailed = false;
  if (mailer) {
    try { await mailer.send({ to: m.user.email, ...buildInviteEmail({ link, orgName: org.name, inviterName: "Um administrador", hours: INVITE_TTL_MS / 3600_000 }) }); emailed = true; } catch { /* link na tela */ }
  }
  return { ok: true, link, emailed };
}
