/** Rate limit de tentativas de login (em memória; suficiente para uma instância). */
export class LoginLimiter {
  private fails = new Map<string, { count: number; first: number }>();
  constructor(private max = 5, private windowMs = 15 * 60_000, private now: () => number = Date.now) {}

  isBlocked(key: string): boolean {
    const e = this.fails.get(key);
    if (!e) return false;
    if (this.now() - e.first > this.windowMs) { this.fails.delete(key); return false; }
    return e.count >= this.max;
  }
  recordFailure(key: string) {
    const e = this.fails.get(key);
    if (!e || this.now() - e.first > this.windowMs) this.fails.set(key, { count: 1, first: this.now() });
    else e.count++;
  }
  reset(key: string) { this.fails.delete(key); }
}
