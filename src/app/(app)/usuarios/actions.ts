"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { smtpMailer } from "@/lib/alerts";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { changeMemberRole, inviteMember, removeMember, resendInvite, type Actor } from "@/lib/users";

export interface InviteState { error?: string; link?: string; emailed?: boolean }

async function actor(): Promise<Actor & { email: string }> {
  const u = await requireSession();
  if (u.role !== "OWNER" && u.role !== "ADMIN") throw new Error("Sem permissão.");
  return { organizationId: u.organizationId, userId: u.id, role: u.role, email: u.email ?? "" };
}
const audit = (a: Actor, action: string, detail: object) => prisma.auditLog.create({ data: { organizationId: a.organizationId, userId: a.userId, action, detail } });
const Role = z.enum(["OWNER", "ADMIN", "MEMBER"]);

export async function inviteAction(_p: InviteState | null, fd: FormData): Promise<InviteState> {
  const a = await actor();
  const role = Role.safeParse(fd.get("role"));
  if (!role.success) return { error: "Papel inválido." };
  const r = await inviteMember(a, { email: String(fd.get("email") ?? ""), name: String(fd.get("name") ?? ""), role: role.data }, smtpMailer());
  if (!r.ok) return { error: r.error };
  await audit(a, "user.invite", { email: String(fd.get("email")).toLowerCase().trim(), role: role.data });
  revalidatePath("/usuarios");
  return { link: r.link, emailed: r.emailed };
}

export async function resendInviteAction(userId: string) {
  const a = await actor();
  const r = await resendInvite(a, z.string().min(1).max(40).parse(userId), smtpMailer());
  if (!r.ok) throw new Error(r.error);
  await audit(a, "user.resend_invite", { userId });
  revalidatePath("/usuarios");
}

export async function changeRoleAction(userId: string, fd: FormData) {
  const a = await actor();
  const role = Role.parse(fd.get("role"));
  const r = await changeMemberRole(a, z.string().min(1).max(40).parse(userId), role);
  if (!r.ok) throw new Error(r.error);
  await audit(a, "user.role", { userId, role });
  revalidatePath("/usuarios");
}

export async function removeMemberAction(userId: string) {
  const a = await actor();
  const r = await removeMember(a, z.string().min(1).max(40).parse(userId));
  if (!r.ok) throw new Error(r.error);
  await audit(a, "user.remove", { userId });
  revalidatePath("/usuarios");
}
