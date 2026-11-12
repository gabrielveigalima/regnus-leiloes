import { request } from "undici";
import { DomainRateLimiter } from "./rate-limit";
import { RobotsCache } from "./robots";

export const USER_AGENT = process.env.CRAWLER_USER_AGENT ?? "RegnusBot/1.0 (+https://regnus.com.br/bot)";

export class RobotsBlockedError extends Error {
  constructor(public url: string) { super(`Bloqueado por robots.txt: ${url}`); }
}

export interface HttpResponse { status: number; body: string; notModified: boolean }

export class HttpClient {
  private limiter = new DomainRateLimiter(Number(process.env.CRAWLER_MIN_INTERVAL_MS ?? 1000));
  private robots = new RobotsCache(async (u) => {
    try {
      const r = await request(u, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
      const t = await r.body.text();
      return r.statusCode === 200 ? t : null;
    } catch { return null; }
  }, USER_AGENT);
  private validators = new Map<string, { etag?: string; lastModified?: string }>();

  constructor(private opts: { retries?: number; timeoutMs?: number; respectRobots?: boolean } = {}) {}

  async get(url: string, headers: Record<string, string> = {}, encoding = "utf-8"): Promise<HttpResponse> {
    if (this.opts.respectRobots !== false && !(await this.robots.allowed(url))) throw new RobotsBlockedError(url);
    const retries = this.opts.retries ?? 4;
    const host = new URL(url).host;
    for (let attempt = 0; ; attempt++) {
      await this.limiter.wait(host);
      const v = this.validators.get(url);
      const h: Record<string, string> = { "user-agent": USER_AGENT, ...headers };
      if (v?.etag) h["if-none-match"] = v.etag;
      if (v?.lastModified) h["if-modified-since"] = v.lastModified;
      try {
        const r = await request(url, { headers: h, signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30000) });
        const body = new TextDecoder(encoding).decode(await r.body.arrayBuffer());
        if (r.statusCode === 304) return { status: 304, body: "", notModified: true };
        if (r.statusCode === 429 || r.statusCode >= 500) {
          if (attempt >= retries) throw new Error(`HTTP ${r.statusCode} em ${url}`);
          const ra = Number(r.headers["retry-after"]);
          await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt));
          continue;
        }
        if (r.statusCode >= 400) throw new Error(`HTTP ${r.statusCode} em ${url}`);
        const etag = r.headers["etag"], lm = r.headers["last-modified"];
        if (etag || lm) this.validators.set(url, { etag: String(etag ?? ""), lastModified: String(lm ?? "") });
        return { status: r.statusCode, body, notModified: false };
      } catch (e) {
        if (e instanceof RobotsBlockedError || attempt >= retries || (e as Error).message.startsWith("HTTP 4")) throw e;
        await sleep(backoff(attempt));
      }
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const backoff = (attempt: number) => Math.min(60000, 1000 * 2 ** attempt) + Math.random() * 500;
