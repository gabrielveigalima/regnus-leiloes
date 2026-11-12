"use server";
import { requireSession } from "@/lib/session";
import { changeOwnPassword } from "@/lib/users";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { LoginLimiter } from "@/lib/login-limit";

export interface AccountState { ok?: string; error?: string }
const limiter = new LoginLimiter(5, 15 * 60_000); // tentativas de "senha atual" por usuário

export async function changePasswordAction(_p: AccountState | null, fd: FormData): Promise<AccountState> {
  const u = await requireSession();
  if (limiter.isBlocked(u.id)) return { error: "Muitas tentativas. Aguarde alguns minutos." };
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "As senhas não conferem." };
  const r = await changeOwnPassword(u.id, String(fd.get("current") ?? ""), next);
  if (!r.ok) { if (r.error === "Senha atual incorreta.") limiter.recordFailure(u.id); return { error: r.error }; }
  limiter.reset(u.id);
  await prisma.auditLog.create({ data: { organizationId: u.organizationId, userId: u.id, action: "password.change" } });
  return { ok: "Senha alterada." };
}

export async function updateProfileAction(_p: AccountState | null, fd: FormData): Promise<AccountState> {
  const u = await requireSession();
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  await prisma.user.update({ where: { id: u.id }, data: { name: name || null } });
  revalidatePath("/conta");
  return { ok: "Perfil atualizado." };
}
