// ============================================================================
// WO-RACE-1 FIX 2 (FR-014) — RED-FIRST: asserts normalizePhone returns "" on a genuine
// miss (was: raw digits) AND the callers reject the "" at creation. A local/partial number
// handed back raw was stored as the customer phone + used as the WhatsApp recipient, where
// Meta rejects it (#131030) as a later "message failed" — not an input error at entry.
// PRESERVE: cross-country recovery (SA-mobile-in-EG → 966…, EG-in-SA → 201…) is intact.
//
// Run: node --experimental-strip-types scripts/proof-phone-invalid.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizePhone } from "../lib/messaging/phone.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// ══ LEG 1 — genuinely-unmatched shapes → "" (not raw digits) ═════════════════
{
  ok("LEG1: EG local landline-ish «0103003» → \"\" (was 0103003)", normalizePhone("0103003", "EG") === "");
  ok("LEG1: SA landline «0112345678» → \"\" (was passed through)", normalizePhone("0112345678", "SA") === "");
  ok("LEG1: partial/junk → \"\"", normalizePhone("123") === "" && normalizePhone("011137987878", "EG") === "");
}

// ══ LEG 2 — PRESERVE: cross-country recovery + all canonical shapes unchanged ══
{
  ok("LEG2: a Saudi mobile in an EG tenant still recovers to 966…",
    normalizePhone("0568615471", "EG") === "966568615471" && normalizePhone("966568615471", "EG") === "966568615471");
  ok("LEG2: an EG mobile in an SA tenant still recovers to 201…",
    normalizePhone("01030036000", "SA") === "201030036000" && normalizePhone("0103003600 0".replace(" ", ""), "SA") === "201030036000");
  ok("LEG2: canonical + local + bare-national forms normalize identically to before",
    normalizePhone("01030036000", "EG") === "201030036000" &&
    normalizePhone("201030036000", "EG") === "201030036000" &&
    normalizePhone("1030036000", "EG") === "201030036000" &&
    normalizePhone("0512345678", "SA") === "966512345678" &&
    normalizePhone("+20 10 3003 6000") === "201030036000");
  ok("LEG2: unknown country still falls back to agnostic recovery",
    normalizePhone("01030036000", "XX") === "201030036000");
}

// ══ LEG 3 — the phone.ts fallthrough now returns "" (source) ══════════════════
{
  const p = read("lib/messaging/phone.ts");
  ok("LEG3: the final fallthrough returns \"\", not the raw digits",
    /return "";\s*\/\/ unmatched shape/.test(p) && !/^\s*return d;\s*$/m.test(p));
}

// ══ LEG 4 — callers reject/skip the "" (no silent-bad-store, no silent-drop) ══
{
  const conv = read("lib/db/conversations.ts");
  ok("LEG4: ensureConversationDb rejects an empty phone with invalid_phone (before any upsert)",
    /if \(!phone\) return \{ ok: false, reason: "invalid_phone" \};/.test(conv) &&
    /EnsureConversationResult = \{ ok: true \} \| \{ ok: false; reason: "invalid_phone" \}/.test(conv));
  const cc = read("lib/staff/command-channel.ts");
  ok("LEG4: command-channel SKIPS a \"\" key (bad staff rows don't collide/false-match)",
    /const key = normalizePhone\(r\.wa_phone, country\);\s*if \(key\) map\.set\(key, r\);/.test(cc));
  const store = read("lib/conversation-store.ts");
  ok("LEG4: the store does NOT create a conversation for an un-normalizable phone",
    /if \(!normalized\) return "";/.test(store));
  const engine = read("lib/ai/useConversationEngine.ts");
  ok("LEG4: the engine surfaces the empty id instead of running a turn on it",
    /if \(!convId\) return "";/.test(engine));
  const roster = read("lib/staff/roster-sync.ts");
  ok("LEG4: roster-sync's existing !wa guard still handles the \"\" (unchanged)",
    /if \(!wa\) return \{ ok: false, reason: "no_phone" \};/.test(roster));
}

console.log(`\nWO-RACE-1 PHONE PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
