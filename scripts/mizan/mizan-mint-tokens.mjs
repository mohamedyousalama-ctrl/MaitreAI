// ============================================================================
// MIZAN — reviewer token MINTER (WO-KHALID-STEP5B). Run:
//   node scripts/mizan/mizan-mint-tokens.mjs [--count=3] [--base=https://<deployment>]
//
// Mints N random reviewer tokens and prints, for each, the reviewer URL to send —
// PLUS the single MIZAN_REVIEWER_TOKEN_HASHES env line to set on the deployment.
//
// ★ SECURITY: the raw tokens are printed ONCE here and never stored. Only the
// SHA-256 HASHES go into the env var (and the DB). Do NOT commit the raw tokens or
// paste them into git — send each URL privately to its reviewer. Losing a raw token
// means minting a new one; the hash cannot be reversed back to a URL.
// ============================================================================
import { randomBytes, createHash } from "node:crypto";

function arg(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
}
const COUNT = Math.max(1, Math.min(20, parseInt(arg("count", "3"), 10) || 3));
const BASE = (arg("base", process.env.NEXT_PUBLIC_APP_URL || "https://<deployment>")).replace(/\/$/, "");

const hashToken = (t) => createHash("sha256").update(String(t), "utf8").digest("hex");

const tokens = Array.from({ length: COUNT }, () => randomBytes(24).toString("base64url"));
const hashes = tokens.map(hashToken);

console.log(`\nMIZAN reviewer tokens — minted ${COUNT} (raw tokens shown ONCE; not stored):\n`);
tokens.forEach((t, i) => {
  console.log(`  Reviewer ${i + 1}:`);
  console.log(`    URL  → ${BASE}/mizan/${t}`);
  console.log(`    hash → ${hashes[i]}`);
  console.log("");
});
console.log(`Set this ONE env var on the deployment (comma-separated hashes), then redeploy:\n`);
console.log(`  MIZAN_REVIEWER_TOKEN_HASHES=${hashes.join(",")}\n`);
console.log(`Also set NEXT_PUBLIC_ENABLE_MIZAN_PANEL=true to reveal the surface (default OFF).`);
console.log(`Send each URL privately to its reviewer. Never commit the raw tokens.\n`);
