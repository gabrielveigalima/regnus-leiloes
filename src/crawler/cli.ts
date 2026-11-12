import "dotenv/config";
import { parseArgs } from "node:util";
import { getConnector } from "./registry";
import { runConnector } from "./core/runner";

const { values } = parseArgs({
  options: { source: { type: "string" }, uf: { type: "string" }, limit: { type: "string" }, "dry-run": { type: "boolean" } },
});
if (!values.source) { console.error("uso: npm run crawl -- --source <id> [--uf SP] [--limit 50] [--dry-run]"); process.exit(1); }

const summary = await runConnector(getConnector(values.source), {
  uf: values.uf?.toUpperCase(), limit: values.limit ? Number(values.limit) : undefined, dryRun: values["dry-run"],
});
console.log(JSON.stringify({ ...summary, samples: summary.samples.slice(0, 3) }, null, 2));
process.exit(0);
