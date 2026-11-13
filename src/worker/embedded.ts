import { workerState } from "./state";

/**
 * Worker dentro do próprio processo web (hospedagens sem VPS, como o Node da Hostinger).
 * Ligado por ENABLE_WORKER=1 em src/instrumentation.ts. Se cair, reinicia; vários processos são seguros
 * (a fila usa lease + SKIP LOCKED). Não bloqueia a subida do site: começa depois de WORKER_START_DELAY_MS.
 */
export function startEmbeddedWorker() {
  const st = workerState();
  if (st.running) return; // já iniciado (HMR / múltiplos register)
  st.running = true;
  st.startedAt = new Date().toISOString();
  const delay = Number(process.env.WORKER_START_DELAY_MS ?? 20_000);

  void (async () => {
    await new Promise((r) => setTimeout(r, delay));
    console.log("[worker] embutido iniciado");
    for (;;) {
      try {
        const { runWorker } = await import("./loop");
        await runWorker({ onLoop: () => { st.lastLoopAt = new Date().toISOString(); } });
      } catch (e) {
        st.lastError = (e as Error).message.slice(0, 300);
        st.restarts++;
        console.error("[worker] erro, reiniciando em 30 s:", st.lastError);
      }
      await new Promise((r) => setTimeout(r, 30_000));
    }
  })();
}
