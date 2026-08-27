// ============================================================================
// WO-CUTOVER-CAPABILITY — a legacy page is never folded to a /c surface that
// cannot do its job.
//
// Run: node --experimental-strip-types scripts/proof-cutover-capability.test.ts
//
// WHY THIS EXISTS
// ---------------
// cutover.ts's EXACT map redirects a legacy console page to a /c replacement. For
// months it folded /conversations → /c/conversations, and /c/conversations is a
// triage QUEUE: zero inputs, zero textareas, it never calls addHumanMessage, and
// its composer is a permanent lock. An operator on console_v2 could see the
// queue, claim a thread, read four messages — and could not reply to a customer
// at all. Nobody noticed, because nothing checked that the target could still do
// what the page it replaced did.
//
// cutover.test.ts pins WHICH paths fold. It cannot see that a fold destroys a
// capability. This does.
//
// THE RULE
// --------
// For every fold in EXACT: if the legacy page can WRITE (it renders inputs and
// calls something that mutates), the /c target must be able to write too. A
// read-only page folding to a read-only page is fine — the kitchen ticket is a
// print view on both sides.
//
// Capability is measured across the page AND the local components it imports.
// The legacy /team page is an 8-line wrapper around <TeamClient/>; judging it by
// its own file would call the real page empty.
//
// This is deliberately a coarse signal. It is not "does the replacement have
// feature parity" — no static check can answer that. It answers the narrower
// question that actually went wrong: did we redirect a page where operators DO
// things to a page where they can only look?
// ============================================================================

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};
const read = (p: string) => readFileSync(p, "utf8");

// ── read the folds straight out of cutover.ts, so this cannot drift ────────
const cutover = read(resolve(ROOT, "lib/console-v2/cutover.ts"))
  .split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");

const exactBlock = /const EXACT[^=]*=\s*\{([\s\S]*?)\n\};/.exec(cutover)?.[1] ?? "";
ok("found the EXACT fold map in cutover.ts", exactBlock.length > 0);

const folds = [...exactBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => ({ from: m[1], to: m[2] }));
ok(`found folds to check (${folds.length})`, folds.length > 0);

// ── resolve a URL path to its page file, ignoring (route groups) ───────────
function findPage(root: string, urlPath: string): string | null {
  const want = urlPath.replace(/\/+$/, "");
  const walk = (dir: string): string | null => {
    let entries: string[] = [];
    try { entries = readdirSync(dir, { withFileTypes: true }).map((d) => (d.isDirectory() ? d.name + "/" : d.name)); }
    catch { return null; }
    for (const e of entries) {
      if (!e.endsWith("/")) continue;
      const sub = join(dir, e.slice(0, -1));
      const found = walk(sub);
      if (found) return found;
    }
    for (const e of entries) {
      if (e !== "page.tsx" && e !== "page.ts") continue;
      // Route = the dir path minus app/, minus (group) segments.
      const rel = dir.slice(resolve(ROOT, "app").length);
      const route = rel.split("/").filter((s) => s && !s.startsWith("(")).join("/");
      if ("/" + route === want) return join(dir, e);
    }
    return null;
  };
  return walk(resolve(ROOT, root));
}

/** Page source plus the source of every LOCAL component it imports (one level). */
function capabilityText(pageFile: string): string {
  const src = read(pageFile);
  let all = src;
  for (const m of src.matchAll(/from\s+"(@\/[^"]+|\.\/[^"]+)"/g)) {
    const spec = m[1];
    const base = spec.startsWith("@/") ? resolve(ROOT, spec.slice(2)) : resolve(dirname(pageFile), spec);
    for (const ext of [".tsx", ".ts"]) {
      if (existsSync(base + ext)) { all += "\n" + read(base + ext); break; }
    }
  }
  return all;
}

/** Can an operator DO something here, or only look? */
function writeCapability(text: string): { inputs: number; mutations: number; can: boolean } {
  const inputs = (text.match(/<input\b|<textarea\b|<select\b|contentEditable/g) ?? []).length;
  const mutations = (text.match(
    /\bfetch\(|\.rpc\(|method:\s*"(POST|PATCH|PUT|DELETE)"|\.(insert|update|upsert|delete)\(/g,
  ) ?? []).length;
  return { inputs, mutations, can: inputs > 0 && mutations > 0 };
}

// ── the invariant ──────────────────────────────────────────────────────────
const regressions: string[] = [];
const unresolved: string[] = [];

for (const { from, to } of folds) {
  const legacyFile = findPage("app/(console)", from);
  const v2File = findPage("app/(console-v2)", to);
  if (!legacyFile || !v2File) {
    unresolved.push(`${from} → ${to} (${!legacyFile ? "legacy" : "v2"} page not found)`);
    continue;
  }
  const legacy = writeCapability(capabilityText(legacyFile));
  const v2 = writeCapability(capabilityText(v2File));
  if (legacy.can && !v2.can) {
    regressions.push(
      `${from} → ${to}: legacy can write (${legacy.inputs} inputs / ${legacy.mutations} mutations) ` +
      `but the target cannot (${v2.inputs} / ${v2.mutations})`,
    );
  }
}

ok(`every fold resolves to real pages on both sides${unresolved.length ? ` — UNRESOLVED: ${unresolved.join("; ")}` : ""}`,
  unresolved.length === 0);

ok(
  "no fold sends operators from a page they can act on to one they can only read" +
    (regressions.length
      ? ` — ${regressions.join(" | ")}. Either the /c surface needs the missing capability, ` +
        `or the legacy path belongs in KEEP_LEGACY (see /conversations).`
      : ""),
  regressions.length === 0,
);

// ── the case that taught us, pinned by name ────────────────────────────────
// /conversations must NOT be in EXACT. The moment it is, an operator on
// console_v2 loses the ability to reply to a customer.
ok("/conversations is not folded (the /c queue has no composer)",
  !folds.some((f) => f.from === "/conversations"));

// ── CONTROL: the check has teeth ───────────────────────────────────────────
// If writeCapability said "yes" for everything, the invariant above would be
// vacuous. Prove it can still say no, against the surface that actually is
// read-only: the kitchen ticket print view.
const ticket = findPage("app/(console-v2)", "/c/orders/[id]/ticket");
ok("CONTROL: the read-only ticket view is correctly detected as non-writing",
  ticket !== null && !writeCapability(capabilityText(ticket)).can);

console.log(`\nCUTOVER-CAPABILITY PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
