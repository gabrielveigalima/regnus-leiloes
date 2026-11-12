import "dotenv/config";
import { runWorker } from "./loop";

const i = process.argv.indexOf("--max-minutes");
await runWorker({ maxMs: (i > 0 ? Number(process.argv[i + 1]) : 10) * 60_000 });
process.exit(0);
