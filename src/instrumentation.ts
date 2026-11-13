// Executa uma vez ao subir o servidor Node. O worker embutido é opcional (ENABLE_WORKER=1).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENABLE_WORKER !== "1") return;
  const { startEmbeddedWorker } = await import("./worker/embedded");
  startEmbeddedWorker();
}
