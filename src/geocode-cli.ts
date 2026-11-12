import "dotenv/config";
import { geocodeBatch } from "@/lib/geocode";

async function main() {
  const i = process.argv.indexOf("--limit");
  const limit = i > 0 ? Number(process.argv[i + 1]) : 50;
  console.log(await geocodeBatch({ limit, log: console.log }));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
