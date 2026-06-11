// ============================================================================
// MaitreAI — apply SQL migration files via the Supabase Management API
// Usage: node scripts/db-apply.mjs <file.sql> [<file.sql> ...]
// Reads SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF from env. Runs each file's
// SQL against the project's database (same path as the dashboard SQL editor).
// ============================================================================

import { readFileSync } from "node:fs";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) {
  console.error("Missing SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF");
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("No SQL files given.");
  process.exit(1);
}

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

for (const f of files) {
  const sql = readFileSync(f, "utf8");
  process.stdout.write(`Applying ${f} ... `);
  const r = await runSql(sql);
  if (r.ok) {
    console.log("OK");
  } else {
    console.log(`FAILED (HTTP ${r.status})`);
    console.error(r.body.slice(0, 1200));
    process.exit(1);
  }
}
console.log("All migrations applied ✓");
