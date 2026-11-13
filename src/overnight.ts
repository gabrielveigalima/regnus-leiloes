import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "@/lib/prisma";
import { geocodeBatch } from "@/lib/geocode";
import { getConnector } from "@/crawler/registry";
import { runConnector } from "@/crawler/core/runner";

/**
 * Trabalho pesado sem supervisão (rodar no PC, de madrugada): enriquece (lê o detalhe do que falta) e geocodifica
 * em ciclos até o horário limite ou até não haver mais nada a fazer. Retomável e seguro de interromper (Ctrl+C).
 *   npm run overnight:prod -- --until 07:00 [--sources caixa,megaleiloes] [--no-geocode]
 */
export function parseDeadline(opts: { until?: string; hours?: string; minutes?: string }, now = new Date()): number {
  if (opts.minutes) return now.getTime() + Number(opts.minutes) * 60_000;
  if (opts.hours) return now.getTime() + Number(opts.hours) * 3600_000;
  if (opts.until) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(opts.until);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('--until deve ser HH:MM (ex.: 07:00)');
    const t = new Date(now); t.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1); // próxima ocorrência (ex.: 07:00 de amanhã)
    return t.getTime();
  }
  return now.getTime() + 8 * 3600_000;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString("pt-BR");
const log = (m: string) => console.log(`[${stamp()}] ${m}`);

async function remaining(sources: string[]) {
  const [detail, geo] = await Promise.all([
    Promise.all(sources.map(async (s) => `${s}: ${await prisma.listing.count({ where: { sourceId: s, detailAt: null, status: { in: ["OPEN", "UPCOMING"] } } })}`)),
    prisma.property.count({ where: { geocodedAt: null, lat: null, city: { not: null }, uf: { not: null } } }),
  ]);
  return `sem detalhe → ${detail.join(", ")} | sem coordenadas → ${geo}`;
}

async function main() {
  const { values } = parseArgs({ options: {
    until: { type: "string" }, hours: { type: "string" }, minutes: { type: "string" },
    sources: { type: "string", default: "caixa,megaleiloes" }, "no-geocode": { type: "boolean" },
    batch: { type: "string", default: "800" }, concurrency: { type: "string", default: "1" },
  } });
  const deadline = parseDeadline(values);
  const sources = values.sources!.split(",").map((s) => s.trim()).filter(Boolean);
  const batch = Number(values.batch);
  process.env.CAIXA_DETAIL = "1"; process.env.MEGA_DETAIL = "1"; process.env.BIASI_DETAIL = "1";
  log(`início; limite ${new Date(deadline).toLocaleString("pt-BR")}; fontes: ${sources.join(", ")}${values["no-geocode"] ? "" : " + geocodificação"}`);
  log(await remaining(sources));

  let failures = 0;
  while (Date.now() < deadline) {
    let progress = false;
    try {
      for (const id of sources) {
        if (Date.now() >= deadline) break;
        const r = await runConnector(getConnector(id), { enrichOnly: true, limit: batch, deadline, concurrency: Number(values.concurrency) });
        log(`${id}: ${r.seen} detalhados, ${r.errors} erros`);
        if (r.seen > 0) progress = true;
      }
      if (!values["no-geocode"] && Date.now() < deadline) {
        const g = await geocodeBatch({ limit: 150, deadline });
        log(`geocodificação: ${g.processed} imóveis (${g.address} endereço, ${g.street} rua, ${g.city} cidade, ${g.failed} sem resultado)`);
        if (g.processed > 0) progress = true;
      }
      failures = 0;
    } catch (e) {
      // Queda de rede/banco (ex.: IP mudou, MySQL remoto bloqueou): espera e tenta de novo.
      failures++;
      log(`erro (${failures}/10): ${(e as Error).message.split("\n").filter(Boolean).pop()}`);
      if (failures >= 10) { log("10 falhas seguidas; encerrando."); process.exitCode = 1; break; }
      await sleep(Math.min(300_000, 30_000 * failures));
      continue;
    }
    if (!progress) { log("nada mais a detalhar nem a geocodificar; encerrando."); break; }
  }
  log("fim. " + await remaining(sources).catch(() => ""));
}

if (process.argv[1]?.endsWith("overnight.ts")) {
  main().then(() => prisma.$disconnect()).then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
}
