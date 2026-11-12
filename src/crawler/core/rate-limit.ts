/** Limita requisições por domínio (padrão 1 req/s), serializando por host. */
export class DomainRateLimiter {
  private next = new Map<string, number>();
  constructor(private minIntervalMs = 1000, private now: () => number = Date.now,
              private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}

  async wait(host: string): Promise<void> {
    const t = this.now();
    const slot = Math.max(t, this.next.get(host) ?? 0);
    this.next.set(host, slot + this.minIntervalMs);
    if (slot > t) await this.sleep(slot - t);
  }
}
