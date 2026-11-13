import { prisma } from "@/lib/prisma";
import { verifyUnsubscribe } from "@/lib/unsub";
import { unsubscribeAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parar de receber alerta — Regnus Leilões" };

// Confirmação em duas etapas: abrir o link (GET) não apaga nada, para scanners de e-mail não cancelarem alertas sozinhos.
export default async function CancelarPage({ searchParams }: { searchParams: Promise<{ id?: string; sig?: string; feito?: string }> }) {
  const { id, sig, feito } = await searchParams;
  const valid = verifyUnsubscribe(id, sig);
  const search = valid && id ? await prisma.savedSearch.findUnique({ where: { id }, select: { name: true } }) : null;
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-top"><img src="/logo-horizontal.png" alt="Regnus Leilões" /></div>
        <div className="auth-body">
          <h1>Parar de receber alerta</h1>
          {feito ? <p role="status">Pronto: você não receberá mais esse alerta.</p>
            : search && id && sig ? (
              <form action={unsubscribeAction} style={{ display: "grid", gap: 8 }}>
                <p>Excluir a busca salva <strong>{search.name}</strong> e parar de receber os e-mails dela?</p>
                <input type="hidden" name="id" value={id} /><input type="hidden" name="sig" value={sig} />
                <button className="primary" type="submit">Sim, parar de receber</button>
              </form>
            ) : <p role="alert" className="err">Link inválido, ou o alerta já foi removido.</p>}
        </div>
      </div>
    </div>
  );
}
