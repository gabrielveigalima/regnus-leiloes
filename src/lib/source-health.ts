export type Health = "OK" | "INACTIVE" | "NO_CONNECTOR" | "BLOCKED" | "NEVER" | "FAILING" | "VOLUME_DROP" | "STALE";

export interface HealthRun { status: string; seen: number; errors: number; isFull: boolean; startedAt: Date }
export interface HealthInput {
  active: boolean; hasConnector: boolean; blockedByRobots: boolean; intervalMinutes: number;
  lastSuccessAt: Date | null;
  runs: HealthRun[]; // mais recentes primeiro
  now?: Date;
}

export const HEALTH_LABEL: Record<Health, string> = {
  OK: "Saudável", INACTIVE: "Desativada", NO_CONNECTOR: "Sem conector", BLOCKED: "Bloqueada por robots",
  NEVER: "Nunca coletou", FAILING: "Com falhas", VOLUME_DROP: "Queda de volume (>50%)", STALE: "Desatualizada",
};

/** Queda de volume >50% entre as duas últimas coletas completas bem-sucedidas = parser provavelmente quebrado. */
export function volumeDrop(runs: HealthRun[]): { dropped: boolean; previous?: number; current?: number } {
  const ok = runs.filter((r) => r.isFull && (r.status === "SUCCESS" || r.status === "PARTIAL"));
  const [cur, prev] = ok;
  if (!cur || !prev || prev.seen === 0) return { dropped: false };
  return { dropped: cur.seen < prev.seen * 0.5, previous: prev.seen, current: cur.seen };
}

export function errorRate(run: HealthRun | undefined): number {
  if (!run) return 0;
  const total = run.seen + run.errors;
  return total === 0 ? 0 : run.errors / total;
}

export function computeHealth(i: HealthInput): Health {
  const now = i.now ?? new Date();
  if (!i.hasConnector) return "NO_CONNECTOR";
  if (i.blockedByRobots) return "BLOCKED";
  if (!i.active) return "INACTIVE";
  const last = i.runs[0];
  if (!last && !i.lastSuccessAt) return "NEVER";
  if (last && (last.status === "FAILED" || last.status === "BLOCKED" || errorRate(last) > 0.2)) return "FAILING";
  if (volumeDrop(i.runs).dropped) return "VOLUME_DROP";
  if (i.lastSuccessAt && now.getTime() - i.lastSuccessAt.getTime() > i.intervalMinutes * 2 * 60_000) return "STALE";
  return "OK";
}
