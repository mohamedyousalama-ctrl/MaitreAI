// Quick read-only query via the Supabase Management API. Usage:
//   node scripts/db-query.mjs "select 1"
import { readFileSync } from "node:fs";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const arg = process.argv[2];
const query = arg && arg.endsWith(".sql") ? readFileSync(arg, "utf8") : arg;
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
console.log(JSON.stringify(await res.json(), null, 2));
