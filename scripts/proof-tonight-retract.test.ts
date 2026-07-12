// ============================================================================
// WO-CONSOLE-BATCH-B FR-007 — red-first proof: a manager-only, AUDITED retract
// ("end now") for a tonight note. The DELETE handler mirrors POST's auth+audit, is
// tenant-scoped, and the row-delete drops the note from Karim's prompt exactly as
// expiry does (customer-turn reads live notes with expires_at > now).
// Run: node --experimental-strip-types scripts/proof-tonight-retract.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

const route = read("app/api/settings/tonight-notes/route.ts");
// Isolate the DELETE handler body so the assertions are about IT, not POST/GET.
const delIdx = route.indexOf("export async function DELETE");
const del = delIdx >= 0 ? route.slice(delIdx) : "";

check("(route) a DELETE handler exists", delIdx >= 0);
check("(route) DELETE is manager-only (mirrors POST)", /tenant\.role !== "manager"/.test(del) && /forbidden_role/.test(del));
check("(route) DELETE takes the note id from the request (?id=), never a fixed row", /searchParams\.get\("id"\)/.test(del));
check("(route) DELETE is tenant-scoped (restaurant_id = caller's tenant)", (del.match(/\.eq\("restaurant_id", rid\)/g) ?? []).length >= 2);
check("(route) DELETE actually deletes the row", /\.from\("tonight_notes"\)\s*\n?\s*\.delete\(\)/.test(del) || /from\("tonight_notes"\)\.delete\(\)/.test(del));
check("(route) DELETE 404s on a note not owned by the tenant", /not_found/.test(del) && /status: 404/.test(del));
check("(route) DELETE writes an audit event (tonight_note_deleted)", /recordAuditEvent\(/.test(del) && /action: "tonight_note_deleted"/.test(del));

// The drop-from-prompt mechanism is the SAME as expiry: the prompt read filters live
// notes by expires_at > now, and a deleted row is simply no longer returned.
const turn = read("lib/ai/customer-turn.ts");
check("(prompt) live notes are read with expires_at > now (delete == expiry effect)", /from\("tonight_notes"\)[\s\S]{0,120}\.gt\("expires_at"/.test(turn));

// Client: the manager UI wires a per-note retract control to the DELETE route.
const page = read("app/(console-v2)/c/(app)/(manager)/knowledge/page.tsx");
check("(client) a retract control calls DELETE on the tonight-notes route", /method: "DELETE"[\s\S]{0,60}|tonight-notes\?id=\$\{encodeURIComponent/.test(page) && /retractNote/.test(page));
check("(client) the retract button is rendered per note", /onClick=\{\(\) => retractNote\(n\.id\)\}/.test(page));

console.log(`\nTONIGHT-RETRACT PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
