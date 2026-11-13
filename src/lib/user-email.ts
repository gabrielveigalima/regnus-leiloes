const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function buildResetEmail(opts: { link: string; hours: number }) {
  const { link, hours } = opts;
  return {
    subject: "Regnus Leilões: redefinição de senha",
    text: `Recebemos um pedido para redefinir a sua senha.\n\nAcesse (válido por ${hours} h, uso único):\n${link}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.\n`,
    html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px"><p>Recebemos um pedido para redefinir a sua senha.</p><p><a href="${esc(link)}">Redefinir senha</a> (válido por ${hours} h, uso único)</p><p style="color:#667085;font-size:12px">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p></div>`,
  };
}

export function buildInviteEmail(opts: { link: string; orgName: string; inviterName: string; hours: number }) {
  const { link, orgName, inviterName, hours } = opts;
  return {
    subject: `Convite para o Regnus Leilões — ${orgName}`,
    text: `${inviterName} convidou você para a organização "${orgName}" no Regnus Leilões.\n\nDefina sua senha (válido por ${hours} h):\n${link}\n`,
    html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px"><p><strong>${esc(inviterName)}</strong> convidou você para a organização <strong>${esc(orgName)}</strong> no Regnus Leilões.</p><p><a href="${esc(link)}">Definir minha senha</a> (válido por ${hours} h)</p></div>`,
  };
}
