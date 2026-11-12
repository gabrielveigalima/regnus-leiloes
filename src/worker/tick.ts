import "dotenv/config";
import { runWorker } from "./loop";

async function main() {
  const i = process.argv.indexOf("--max-minutes");
  await runWorker({ maxMs: (i > 0 ? Number(process.argv[i + 1]) : 10) * 60_000 });
  
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
