/** Janela fixa por chave (em memória; suficiente para uma instância). */
export class FixedWindowLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private limit = 60, private windowMs = 60_000, private now: () => number = Date.now) {}

  hit(key: string): { allowed: boolean; limit: number; remaining: number; resetAt: number } {
    const t = this.now();
    let e = this.hits.get(key);
    if (!e || t >= e.resetAt) { e = { count: 0, resetAt: t + this.windowMs }; this.hits.set(key, e); }
    e.count++;
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (t >= v.resetAt) this.hits.delete(k);
    return { allowed: e.count <= this.limit, limit: this.limit, remaining: Math.max(0, this.limit - e.count), resetAt: e.resetAt };
  }
}
