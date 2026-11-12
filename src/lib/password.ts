import bcrypt from "bcrypt";

const COMMON = new Set(["1234567890", "123456789012", "senha12345", "password123", "qwertyuiop", "regnus12345", "regnusleiloes", "administrador"]);

/** Política: ≥ 10 caracteres, letra e número, sem partes do e-mail, fora de uma lista de senhas óbvias. Retorna mensagem de erro ou null. */
export function validatePassword(pw: string, email?: string): string | null {
  if (pw.length < 10) return "A senha deve ter pelo menos 10 caracteres.";
  if (pw.length > 128) return "A senha deve ter no máximo 128 caracteres.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use letras e números.";
  if (COMMON.has(pw.toLowerCase())) return "Senha muito comum.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) return "A senha não pode conter o seu e-mail.";
  if (/^(.)\1+$/.test(pw)) return "Senha muito simples.";
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);

/** Hash de uma senha aleatória inalcançável (conta convidada que ainda não definiu senha). */
export async function unusablePasswordHash() {
  const { randomBytes } = await import("node:crypto");
  return bcrypt.hash(randomBytes(32).toString("base64url"), 12);
}
