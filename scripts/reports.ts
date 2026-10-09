// Prints the newest bug reports from the site (contracts/feedback.md). Reports are only readable here or in the
// Upstash console; the site has no read endpoint.
//   npx vercel@latest env pull .env.local --yes   (once, from the repo root, linked to engram-vault)
//   npm run reports            newest 20
//   npm run reports -- 50      newest 50
import { Redis } from "@upstash/redis";

type Report = { id: string; t: number; app: string; path: string; what: string; contact?: string; ua: string; vw: number; vh: number };

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_READ_ONLY_TOKEN ?? process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("No Redis credentials. From the repo root run: npx vercel@latest env pull .env.local --yes");
  process.exit(1);
}
const n = Math.min(Math.max(Number(process.argv[2]) || 20, 1), 1000);
const reports = await new Redis({ url, token }).lrange<Report>("reports", 0, n - 1);
if (!reports.length) console.log("No reports yet.");
for (const r of reports) {
  console.log(`\n${new Date(r.t).toLocaleString()}  ${r.app}  ${r.path}${r.contact ? `  from: ${r.contact}` : ""}`);
  console.log(`  ${r.what.replace(/\n/g, "\n  ")}`);
  console.log(`  (${r.vw}x${r.vh}, ${r.ua})`);
}
