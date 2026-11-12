/** Parser mínimo de robots.txt (User-agent / Allow / Disallow, maior prefixo vence). */
export interface RobotsRules { allow: string[]; disallow: string[] }

export function parseRobots(txt: string, agent: string): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === "allow" && v) cur.allow.push(v);
    if (k === "disallow" && v) cur.disallow.push(v);
  }
  const a = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return { allow: chosen.flatMap((g) => g.allow), disallow: chosen.flatMap((g) => g.disallow) };
}

const toRe = (p: string) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));

export function isAllowed(rules: RobotsRules, path: string): boolean {
  const best = (list: string[]) => list.filter((p) => toRe(p).test(path)).reduce((m, p) => Math.max(m, p.length), -1);
  const d = best(rules.disallow), a = best(rules.allow);
  return d < 0 || a >= d;
}

export class RobotsCache {
  private cache = new Map<string, { at: number; rules: RobotsRules }>();
  constructor(private fetchText: (url: string) => Promise<string | null>, private agent: string, private ttlMs = 86_400_000) {}

  async allowed(url: string): Promise<boolean> {
    const u = new URL(url);
    let e = this.cache.get(u.origin);
    if (!e || Date.now() - e.at > this.ttlMs) {
      const txt = await this.fetchText(`${u.origin}/robots.txt`);
      e = { at: Date.now(), rules: txt ? parseRobots(txt, this.agent) : { allow: [], disallow: [] } };
      this.cache.set(u.origin, e);
    }
    return isAllowed(e.rules, u.pathname + u.search);
  }
}
