import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;

test("usuários: tokens de uso único, convites, papéis, limites do plano e isolamento", { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  process.env.NEXTAUTH_URL = "https://app.test";
  const bcrypt = (await import("bcrypt")).default;
  const { prisma } = await import("../src/lib/prisma");
  const U = await import("../src/lib/users");
  const O = await import("../src/lib/orgs");
  const sfx = Date.now().toString(36);
  const sent: { to: string; subject: string; text: string }[] = [];
  const mailer = { send: async (m: { to: string; subject: string; text: string; html: string }) => { sent.push(m); } };

  await prisma.plan.upsert({ where: { id: "USR" }, update: { maxUsers: 3 }, create: { id: "USR", name: "usr", maxUsers: 3 } });
  const orgA = await prisma.organization.create({ data: { name: "A", slug: `ua-${sfx}`, planId: "USR" } });
  const orgB = await prisma.organization.create({ data: { name: "B", slug: `ub-${sfx}`, planId: "USR" } });
  const mkUser = async (e: string, pw = "SenhaAntiga123") => prisma.user.create({ data: { email: `${e}-${sfx}@t.com`, passwordHash: await bcrypt.hash(pw, 4), passwordSetAt: new Date() } });
  const owner = await mkUser("owner"), admin = await mkUser("admin"), outsider = await mkUser("out");
  await prisma.membership.createMany({ data: [
    { organizationId: orgA.id, userId: owner.id, role: "OWNER" }, { organizationId: orgA.id, userId: admin.id, role: "ADMIN" },
    { organizationId: orgB.id, userId: outsider.id, role: "OWNER" },
  ] });
  const aOwner = { organizationId: orgA.id, userId: owner.id, role: "OWNER" as const };
  const aAdmin = { organizationId: orgA.id, userId: admin.id, role: "ADMIN" as const };
  const created: string[] = [owner.id, admin.id, outsider.id];

  try {
    // --- redefinição de senha ---
    await U.requestPasswordReset(`NAOEXISTE-${sfx}@t.com`, mailer, () => {});
    assert.equal(sent.length, 0, "não deve enviar para e-mail inexistente");
    await U.requestPasswordReset(owner.email.toUpperCase(), mailer, () => {});
    assert.equal(sent.length, 1);
    const tok1 = sent[0]!.text.match(/token=([\w-]+)/)![1]!;
    assert.ok(await U.isTokenValid(tok1));
    const stored = await prisma.passwordToken.findFirstOrThrow({ where: { userId: owner.id } });
    assert.notEqual(stored.tokenHash, tok1); // só o hash é guardado
    assert.equal((await U.resetPasswordWithToken(tok1, "curta1")).ok, false); // política
    assert.ok(await U.isTokenValid(tok1), "senha fraca não consome o token");
    const ok = await U.resetPasswordWithToken(tok1, "NovaSenha-2026");
    assert.equal(ok.ok, true);
    assert.equal((await U.resetPasswordWithToken(tok1, "OutraSenha-2026")).ok, false, "token é de uso único");
    assert.ok(await bcrypt.compare("NovaSenha-2026", (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash));
    // novo pedido invalida o anterior
    await U.requestPasswordReset(owner.email, mailer, () => {});
    await U.requestPasswordReset(owner.email, mailer, () => {});
    const [, t2, t3] = sent.map((m) => m.text.match(/token=([\w-]+)/)?.[1]);
    assert.equal(await U.isTokenValid(t2), false);
    assert.equal(await U.isTokenValid(t3), true);
    // expirado
    const old = await U.createToken(owner.id, "RESET", new Date(Date.now() - 2 * 3600_000));
    assert.equal(await U.isTokenValid(old), false);
    assert.equal((await U.resetPasswordWithToken(old, "QualquerSenha-1234")).ok, false);
    // dois usos simultâneos: só um vence
    const tk = await U.createToken(owner.id, "RESET");
    const race = await Promise.all([U.resetPasswordWithToken(tk, "Corrida-Senha-1"), U.resetPasswordWithToken(tk, "Corrida-Senha-2")]);
    assert.equal(race.filter((r) => r.ok).length, 1);

    // --- troca da própria senha ---
    assert.equal((await U.changeOwnPassword(admin.id, "errada", "NovaSenha-2026")).ok, false);
    assert.equal((await U.changeOwnPassword(admin.id, "SenhaAntiga123", "SenhaAntiga123")).ok, false);
    assert.equal((await U.changeOwnPassword(admin.id, "SenhaAntiga123", "fraca")).ok, false);
    assert.equal((await U.changeOwnPassword(admin.id, "SenhaAntiga123", "Outra-Senha-777")).ok, true);

    // --- convites ---
    sent.length = 0;
    const inv = await U.inviteMember(aOwner, { email: ` Novo-${sfx}@T.com `, name: "Novo", role: "MEMBER" }, mailer);
    assert.ok(inv.ok && inv.emailed && inv.link.startsWith("https://app.test/redefinir-senha?token="));
    assert.equal(sent[0]!.to, `novo-${sfx}@t.com`);
    const invited = await prisma.user.findUniqueOrThrow({ where: { email: `novo-${sfx}@t.com` } });
    created.push(invited.id);
    assert.equal(invited.passwordSetAt, null);
    assert.equal(await bcrypt.compare("", invited.passwordHash), false);
    // limite do plano (3 usuários: owner, admin, novo)
    const full = await U.inviteMember(aOwner, { email: `x-${sfx}@t.com`, role: "MEMBER" }, mailer);
    assert.deepEqual(full, { ok: false, error: "Seu plano permite até 3 usuários." });
    // e-mail já existente: mensagem genérica se for de outra org
    await prisma.plan.update({ where: { id: "USR" }, data: { maxUsers: null } });
    assert.deepEqual(await U.inviteMember(aOwner, { email: outsider.email, role: "MEMBER" }, mailer), { ok: false, error: "Não foi possível convidar este e-mail." });
    assert.match((await U.inviteMember(aOwner, { email: admin.email, role: "MEMBER" }, mailer) as { error: string }).error, /já é membro/);
    assert.equal((await U.inviteMember(aOwner, { email: "invalido", role: "MEMBER" }, mailer)).ok, false);
    // permissões: ADMIN só convida MEMBER
    assert.equal((await U.inviteMember(aAdmin, { email: `adm2-${sfx}@t.com`, role: "ADMIN" }, mailer)).ok, false);
    const byAdmin = await U.inviteMember(aAdmin, { email: `byadmin-${sfx}@t.com`, role: "MEMBER" }, null);
    assert.ok(byAdmin.ok && !byAdmin.emailed); // sem SMTP, o link vai para a tela
    created.push((await prisma.user.findUniqueOrThrow({ where: { email: `byadmin-${sfx}@t.com` } })).id);
    // aceitar convite = definir senha; depois não dá para reenviar
    const accept = await U.resetPasswordWithToken(inv.link.split("token=")[1]!, "Bem-Vindo-2026x");
    assert.equal(accept.ok, true);
    assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: invited.id } })).passwordSetAt);
    assert.equal((await U.resendInvite(aOwner, invited.id, mailer)).ok, false);
    const pendingId = (await prisma.user.findUniqueOrThrow({ where: { email: `byadmin-${sfx}@t.com` } })).id;
    assert.equal((await U.resendInvite(aOwner, pendingId, mailer)).ok, true);

    // --- papéis ---
    assert.equal((await U.changeMemberRole(aAdmin, invited.id, "ADMIN")).ok, false); // só OWNER altera papéis
    assert.equal((await U.changeMemberRole(aOwner, owner.id, "ADMIN")).ok, false, "último proprietário");
    assert.equal((await U.changeMemberRole(aOwner, invited.id, "ADMIN")).ok, true);
    assert.equal((await U.changeMemberRole(aOwner, outsider.id, "MEMBER")).ok, false, "usuário de outra org");

    // --- remoção ---
    assert.equal((await U.removeMember(aOwner, owner.id)).ok, false, "a si mesmo");
    assert.equal((await U.removeMember(aAdmin, invited.id)).ok, false, "ADMIN não remove ADMIN");
    assert.equal((await U.removeMember(aOwner, outsider.id)).ok, false, "outra org");
    assert.equal(await prisma.user.count({ where: { id: outsider.id } }), 1);
    await prisma.favorite.count(); // sanity
    assert.equal((await U.removeMember(aOwner, invited.id)).ok, true);
    assert.equal(await prisma.user.count({ where: { id: invited.id } }), 0);
    // propriedade: com 2 OWNERS pode remover um
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA.id, userId: admin.id } }, data: { role: "OWNER" } });
    assert.equal((await U.removeMember(aOwner, admin.id)).ok, true);

    // --- onboarding de organização (admin da plataforma) ---
    await prisma.plan.upsert({ where: { id: "USR2" }, update: {}, create: { id: "USR2", name: "usr2" } });
    const noPlan = await O.createOrganization({ name: "Nova Org", planId: "NAO", ownerEmail: `own-${sfx}@t.com` }, mailer);
    assert.equal(noPlan.ok, false);
    const dup = await O.createOrganization({ name: "Nova Org", planId: "USR", ownerEmail: outsider.email }, mailer);
    assert.equal(dup.ok, false);
    const no = await O.createOrganization({ name: `Nova Org ${sfx}`, planId: "USR", ownerEmail: `own-${sfx}@t.com`, ownerName: "Dono" }, mailer);
    assert.ok(no.ok);
    if (no.ok) {
      const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: no.organizationId }, include: { user: true } });
      assert.equal(m.role, "OWNER");
      created.push(m.userId);
      assert.equal(await prisma.subscription.count({ where: { organizationId: no.organizationId, status: "ACTIVE" } }), 1);
      assert.equal((await O.changePlan(no.organizationId, "USR2")).ok, true);
      assert.equal((await prisma.organization.findUniqueOrThrow({ where: { id: no.organizationId } })).planId, "USR2");
      assert.equal(await prisma.subscription.count({ where: { organizationId: no.organizationId, status: "ACTIVE" } }), 1);
      assert.equal(await prisma.subscription.count({ where: { organizationId: no.organizationId } }), 2); // a antiga fica CANCELLED
      assert.equal((await O.changePlan(no.organizationId, "NAO")).ok, false);
      await prisma.organization.delete({ where: { id: no.organizationId } });
    }
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  }
});
