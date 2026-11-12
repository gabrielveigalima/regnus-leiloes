import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const { prepareDatabase, resolveDatabaseUrl } = require("../scratch/prepare-db.js");

test("prebuild: sem banco configurado só gera o cliente e não migra", () => {
  const calls: string[][] = [];
  const logs: string[] = [];
  const r = prepareDatabase({ env: {}, projectDir: "/nonexistent", run: (_: string, args: string[]) => { calls.push(args.slice(1)); }, logger: { log: (m: string) => logs.push(m) } });
  assert.equal(r.migrated, false);
  assert.deepEqual(calls, [["generate"]]);
  assert.ok(logs.some((l) => /Banco não configurado/.test(l)));
});

test("prebuild: com banco usa migrate deploy (nunca db push / accept-data-loss)", () => {
  const calls: { args: string[]; url?: string }[] = [];
  prepareDatabase({
    env: { DATABASE_URL: "mysql://u:p@h:3306/d" }, projectDir: "/nonexistent",
    run: (_: string, args: string[], o: { env: Record<string, string> }) => { calls.push({ args: args.slice(1), url: o.env.DATABASE_URL }); }, logger: { log() {} },
  });
  const migrate = calls.find((c) => c.args[0] === "migrate")!;
  assert.deepEqual(migrate.args, ["migrate", "deploy"]);
  assert.equal(migrate.url, "mysql://u:p@h:3306/d");
  assert.ok(!calls.some((c) => c.args.includes("push") || c.args.includes("--accept-data-loss") || c.args.includes("--force-reset")));
});

test("URL do banco a partir de DB_* (Hostinger), com escape e localhost → 127.0.0.1", () => {
  assert.equal(resolveDatabaseUrl({ DB_USER: "u@x", DB_PASSWORD: "p:w/d", DB_HOST: "localhost", DB_NAME: "n" }), "mysql://u%40x:p%3Aw%2Fd@127.0.0.1:3306/n");
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: "mysql://a:b@c/d" }), "mysql://a:b@c/d");
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: "mysql://${DB_USER}@c/d" }), null);
  // painel da hospedagem com aspas/espaços no valor (causa real de falha no deploy)
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: ' "mysql://a:b@c:3306/d" ' }), "mysql://a:b@c:3306/d");
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: "'mysql://a:b@c/d'" }), "mysql://a:b@c/d");
  // URL inválida: usa DB_* se houver, senão erro claro sem vazar o segredo
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: "postgres://x", DB_USER: "u", DB_HOST: "h", DB_NAME: "n" }), "mysql://u:@h:3306/n");
  assert.throws(() => resolveDatabaseUrl({ DATABASE_URL: "mariadb://user:segredo@h/d" }), (e: Error) => /deve começar com mysql:\/\//.test(e.message) && !e.message.includes("segredo"));
  assert.throws(() => resolveDatabaseUrl({ DATABASE_URL: "h/d" }), /DATABASE_URL inválida/);
  assert.equal(resolveDatabaseUrl({}), null);
});

test("migration baseline cobre todos os models do schema", () => {
  const schema = read("prisma/schema.prisma");
  const sql = readdirSync(new URL("prisma/migrations/", root), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => read(`prisma/migrations/${d.name}/migration.sql`)).join("\n");
  const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]!);
  assert.ok(models.length >= 20);
  for (const m of models) assert.match(sql, new RegExp(`CREATE TABLE \`${m}\``), `tabela ${m} ausente na migration`);
  assert.match(sql, /FULLTEXT INDEX/);
  assert.match(read("prisma/migrations/migration_lock.toml"), /provider = "mysql"/);
});

test("arquivos de deploy existem e o build usa webpack", () => {
  for (const f of ["server.js", ".npmrc", "ecosystem.config.cjs", "Dockerfile", "docker-compose.yml", "deploy/backup-db.sh", ".github/workflows/crawl-tick.yml", ".env.example"]) {
    assert.ok(existsSync(new URL(f, root)), `${f} ausente`);
  }
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.build, /--webpack/);
  assert.equal(pkg.scripts.prebuild, "node scratch/prepare-db.js");
  assert.equal(pkg.scripts.start, "node server.js");
  assert.match(read(".npmrc"), /include=dev/);
});

test("segredos: .env ignorado e .env.example sem valores reais", () => {
  assert.match(read(".gitignore"), /^\.env$/m);
  const ex = read(".env.example");
  for (const k of ["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL", "SMTP_HOST", "CRAWLER_USER_AGENT", "API_RATE_LIMIT", "GEOCODE"]) assert.match(ex, new RegExp(`^${k}=`, "m"), `${k} ausente no .env.example`);
  assert.ok(!/senha-real|password=\w{6,}/i.test(ex));
});

test("cabeçalhos de segurança configurados (CSP, nosniff, frame, HSTS)", async () => {
  const cfg = require("../next.config.js");
  const [{ headers }] = await cfg.headers();
  const h = Object.fromEntries(headers.map((x: { key: string; value: string }) => [x.key, x.value]));
  assert.match(h["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(h["Content-Security-Policy"], /object-src 'none'/);
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["X-Frame-Options"], "DENY");
  assert.match(h["Strict-Transport-Security"], /max-age=/);
  assert.equal(cfg.poweredByHeader, false);
});
