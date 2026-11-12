import Link from "next/link";
import { isTokenValid } from "@/lib/users";
import { ResetForm } from "./ResetForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Definir senha — Regnus Leilões" };

export default async function RedefinirSenhaPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = await isTokenValid(token);
  return (
    <div className="filters" style={{ maxWidth: 380, margin: "10vh auto" }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Definir senha</h1>
      {valid && token ? <ResetForm token={token} /> : (
        <p role="alert">Link inválido ou expirado. <Link href="/esqueci-senha">Solicitar um novo</Link></p>
      )}
    </div>
  );
}
