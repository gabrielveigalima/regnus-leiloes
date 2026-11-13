/** Estado do worker embutido, em globalThis (instrumentation e rotas são bundles diferentes no mesmo processo). */
export interface EmbeddedWorkerState { running: boolean; startedAt: string | null; lastLoopAt: string | null; restarts: number; lastError: string | null }

const g = globalThis as unknown as { __regnusWorker?: EmbeddedWorkerState };

export function workerState(): EmbeddedWorkerState {
  return (g.__regnusWorker ??= { running: false, startedAt: null, lastLoopAt: null, restarts: 0, lastError: null });
}
