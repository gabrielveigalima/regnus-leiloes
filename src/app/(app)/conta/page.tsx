import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PasswordForm, ProfileForm } from "./AccountForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minha conta — Regnus Leilões" };

export default async function ContaPage() {
  const u = await requireSession();
  const me = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { name: true, email: true } });
  return (
    <>
      <h1>Minha conta</h1>
      <p className="muted">{me.email}</p>
      <ProfileForm name={me.name ?? ""} />
      <PasswordForm />
    </>
  );
}
