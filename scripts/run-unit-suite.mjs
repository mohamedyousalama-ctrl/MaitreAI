#!/usr/bin/env node
// ============================================================================
// Unit-suite runner — runs EVERY file and reports a true tally.
//
// WHY THIS EXISTS
// `test:unit` used to be a single `&&` chain of 113 commands. An `&&` chain stops
// at the first failure, so with command #8 failing, 105 files never executed —
// in CI or locally. The workflow that ran it claimed "the full suite runs on
// every pull request and its failures are visible on every run". That was false
// in effect: the chain shape quarantined 93% of the suite while nothing was
// marked skipped, and `continue-on-error` then swallowed the exit code.
//
// It also made every count unreliable. Anyone measuring the suite by running
// `npm run test:unit` and reading the output was measuring 8 files.
//
// This runner executes all of them, always, and prints what actually happened.
// It exits non-zero if any file fails, so it is safe to gate on.
//
// Usage:
//   node scripts/run-unit-suite.mjs              # run everything
//   node scripts/run-unit-suite.mjs --bail       # stop at the first failure
//   node scripts/run-unit-suite.mjs --filter=voice
// ============================================================================

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "unit-suite.json"), "utf8"));

const args = process.argv.slice(2);
const bail = args.includes("--bail");
const filterArg = args.find((a) => a.startsWith("--filter="));
const filter = filterArg ? filterArg.slice("--filter=".length) : null;

const commands = filter ? manifest.filter((c) => c.includes(filter)) : manifest;
const fileOf = (cmd) => (cmd.match(/([\w/.-]+\.test\.ts)/) || [])[1] ?? cmd;

if (!commands.length) {
  console.error(filter ? `No suite entry matches --filter=${filter}` : "The suite manifest is empty.");
  process.exit(1);
}

const failures = [];
let passed = 0;

console.log(`unit suite — ${commands.length} file${commands.length === 1 ? "" : "s"}\n`);

for (const [i, cmd] of commands.entries()) {
  const file = fileOf(cmd);
  // Each entry carries its own flags: several files need
  // --import ./scripts/ts-ext-loader.mjs (extensionless imports) and several need
  // --conditions=react-server (modules that import "server-only"). Running bare
  // `node` against them produces FALSE failures, so the command is run verbatim.
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const ok = r.status === 0;
  if (ok) passed++;
  else failures.push({ file, cmd, status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() });

  const n = String(i + 1).padStart(3, " ");
  console.log(`${ok ? "  ok  " : "  FAIL"} ${n}/${commands.length}  ${file}`);
  if (!ok && bail) break;
}

console.log(`\n${"─".repeat(60)}`);
console.log(`passed ${passed}   failed ${failures.length}   total ${commands.length}`);

if (failures.length) {
  console.log(`\nFAILURES\n${"─".repeat(60)}`);
  for (const f of failures) {
    console.log(`\n▸ ${f.file}  (exit ${f.status})`);
    console.log(`  ${f.cmd}`);
    // The assertion lines are what a reader needs; the full stdout of 113 files
    // would bury them.
    const lines = f.out.split("\n").filter((l) => /✗|✘|❌|not ok|failed|Error|error:/i.test(l)).slice(0, 6);
    for (const l of lines) console.log(`    ${l.trim()}`);
  }
  console.log("");
}

process.exit(failures.length ? 1 : 0);
