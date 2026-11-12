import "dotenv/config";
import { runWorker } from "./loop";

async function main() {
  await runWorker({});
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
