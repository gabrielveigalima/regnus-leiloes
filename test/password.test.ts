import test from "node:test";
import assert from "node:assert/strict";
import { validatePassword } from "../src/lib/password";
import { buildInviteEmail, buildResetEmail } from "../src/lib/user-email";
import { slugify } from "../src/lib/orgs";

test("política de senha", () => {
  assert.equal(validatePassword("Abc12345", "a@b.com"), "A senha deve ter pelo menos 10 caracteres.");
  assert.equal(validatePassword("abcdefghijk", "a@b.com"), "Use letras e números.");
  assert.equal(validatePassword("1234567890", "a@b.com"), "Use letras e números.");
  assert.equal(validatePassword("senha12345", "x@y.com"), "Senha muito comum.");
  assert.match(validatePassword("gabriel12345xx", "gabriel@regnus.com")!, /e-mail/);
  assert.equal(validatePassword("a".repeat(129) + "1", "x@y.com"), "A senha deve ter no máximo 128 caracteres.");
  assert.equal(validatePassword("Cavalo-Azul-42x", "gabriel@regnus.com"), null);
});
test("e-mails: link presente e HTML escapado", () => {
  const r = buildResetEmail({ link: "https://app/redefinir-senha?token=abc", hours: 1 });
  assert.match(r.text, /token=abc/);
  assert.match(r.html, /href="https:\/\/app\/redefinir-senha\?token=abc"/);
  const i = buildInviteEmail({ link: "https://app/x?a=1&b=2", orgName: "<Org>", inviterName: "Ana & Cia", hours: 72 });
  assert.ok(!i.html.includes("<Org>"));
  assert.match(i.html, /&amp;b=2/);
  assert.match(i.subject, /<Org>/); // assunto é texto puro
});
test("slugify", () => {
  assert.equal(slugify("Grupo Regnus Ltda."), "grupo-regnus-ltda");
  assert.equal(slugify("Ação & Cia!!"), "acao-cia");
  assert.equal(slugify("***"), "org");
});
