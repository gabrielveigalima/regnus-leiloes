import { prisma } from "./prisma";
import { createToken, INVITE_TTL_MS, normalizeEmail } from "./users";
import { unusablePasswordHash } from "./password";
import { buildInviteEmail } from "./user-email";
import type { Mailer } from "./alerts";

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";

async function uniqueSlug(base: string) {
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await prisma.organization.findUnique({ where: { slug } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Onboarding (somente admin da plataforma): cria a organização, o proprietário convidado e a assinatura manual. */
export async function createOrganization(input: { name: string; planId: string; ownerEmail: string; ownerName?: string }, mailer: Mailer | null):
  Promise<{ ok: true; organizationId: string; link: string; emailed: boolean } | { ok: false; error: string }> {
  const name = input.name.trim();
  const email = normalizeEmail(input.ownerEmail);
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Informe o nome da organização (2 a 80 caracteres)." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "E-mail do proprietário inválido." };
  if (!(await prisma.plan.findUnique({ where: { id: input.planId } }))) return { ok: false, error: "Plano inexistente." };
  if (await prisma.user.findUnique({ where: { email } })) return { ok: false, error: "Já existe um usuário com esse e-mail." };

  const org = await prisma.organization.create({ data: { name, slug: await uniqueSlug(slugify(name)), planId: input.planId } });
  const user = await prisma.user.create({ data: { email, name: input.ownerName?.trim() || null, passwordHash: await unusablePasswordHash() } });
  await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
  await prisma.subscription.create({ data: { organizationId: org.id, planId: input.planId, status: "ACTIVE" } });
  const token = await createToken(user.id, "INVITE");
  const link = `${(process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")}/redefinir-senha?token=${token}`;
  let emailed = false;
  if (mailer) {
    try { await mailer.send({ to: email, ...buildInviteEmail({ link, orgName: name, inviterName: "A equipe Regnus", hours: INVITE_TTL_MS / 3600_000 }) }); emailed = true; } catch { /* link na tela */ }
  }
  return { ok: true, organizationId: org.id, link, emailed };
}

/** Troca o plano (assinatura manual; cobrança real fica para um BillingProvider). */
export async function changePlan(organizationId: string, planId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await prisma.plan.findUnique({ where: { id: planId } }))) return { ok: false, error: "Plano inexistente." };
  await prisma.$transaction([
    prisma.organization.update({ where: { id: organizationId }, data: { planId } }),
    prisma.subscription.updateMany({ where: { organizationId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } }, data: { status: "CANCELLED", endsAt: new Date() } }),
    prisma.subscription.create({ data: { organizationId, planId, status: "ACTIVE" } }),
  ]);
  return { ok: true };
}
