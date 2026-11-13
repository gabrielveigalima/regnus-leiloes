import Link from "next/link";
import { isTokenValid } from "@/lib/users";
import { ResetForm } from "./ResetForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Definir senha — Regnus Leilões" };

export default async function RedefinirSenhaPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = await isTokenValid(token);
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-top"><img src="/logo-horizontal.png" alt="Regnus Leilões" /></div>
        <div className="auth-body">
          <h1>Definir senha</h1>
          {valid && token ? <ResetForm token={token} /> : (
            <p role="alert" className="err">Link inválido ou expirado. <Link href="/esqueci-senha">Solicitar um novo</Link></p>
          )}
        </div>
      </div>
    </div>
  );
}
