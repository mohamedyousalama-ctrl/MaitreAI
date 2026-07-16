// Proof for eslint-rules/no-unchecked-supabase-write.js.
// Run: node scripts/proof-no-unchecked-supabase-write-rule.test.mjs

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { RuleTester } = require("eslint");
const rule = require("../eslint-rules/no-unchecked-supabase-write.js");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
}

const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

try {
  ruleTester.run("no-unchecked-supabase-write", rule, {
    valid: [
      {
        name: "captures data and error from write result",
        filename: "/repo/lib/db/good-captures-data.js",
        code: `
          async function good(db) {
            const { data, error } = await db.from("orders").update({ order_status: "paid" }).eq("id", id).select("id");
            if (error) throw error;
            return data.length;
          }
        `,
      },
      {
        name: "captures count from write result",
        filename: "/repo/app/api/good-captures-count.js",
        code: `
          async function good(db) {
            const { count, error } = await db.from("orders").delete().eq("id", id);
            if (error) throw error;
            return count;
          }
        `,
      },
      {
        name: "mustWrite wrapper",
        filename: "/repo/lib/db/good-wrapper.js",
        code: `
          async function good(db) {
            await mustWrite(db.from("orders").update({ order_status: "paid" }).eq("id", id).select("id"), "ctx", { exactRows: 1 });
          }
        `,
      },
      {
        name: "read-only select",
        filename: "/repo/lib/db/good-read.js",
        code: `
          async function good(db) {
            const { data } = await db.from("orders").select("*");
            return data;
          }
        `,
      },
    ],
    invalid: [
      {
        name: "bare awaited insert remains flagged",
        filename: "/repo/lib/db/bare-write.js",
        code: `
          async function bad(db) {
            await db.from("orders").insert({ id: "order_1" });
          }
        `,
        errors: [{ messageId: "unchecked" }],
      },
      {
        name: "destructures error without data",
        filename: "/repo/app/api/error-only-write.js",
        code: `
          async function bad(db) {
            const { error } = await db.from("orders").update({ order_status: "cancelled" }).eq("id", id);
            if (error) return false;
            return true;
          }
        `,
        errors: [{ messageId: "uncheckedErrorOnly" }],
      },
      {
        name: "select does not help if data is discarded",
        filename: "/repo/app/api/select-error-only-write.js",
        code: `
          async function bad(db) {
            const { error } = await db.from("orders").update({ order_status: "cancelled" }).eq("id", id).select("id");
            if (error) return false;
            return true;
          }
        `,
        errors: [{ messageId: "uncheckedErrorOnly" }],
      },
    ],
  });
  ok("RuleTester covers valid and invalid local-rule cases", true);
} catch (error) {
  console.error("  RuleTester threw:", error instanceof Error ? error.message : error);
  ok("RuleTester covers valid and invalid local-rule cases", false);
}

function runEslintFixture() {
  const tmp = mkdtempSync(join(tmpdir(), "kivo-eslint-supabase-write-"));
  const fixtureDir = join(tmp, "app", "api", "proof");
  const lintCases = {
    "bare-write.js": `
      async function bad(db) {
        await db.from("orders").insert({ id: "order_1" });
      }
    `,
    "error-only-write.js": `
      async function bad(db) {
        const { error } = await db.from("orders").update({ order_status: "cancelled" }).eq("id", id);
        if (error) return false;
        return true;
      }
    `,
    "select-error-only-write.js": `
      async function bad(db) {
        const { error } = await db.from("orders").update({ order_status: "cancelled" }).eq("id", id).select("id");
        if (error) return false;
        return true;
      }
    `,
    "captured-data-write.js": `
      async function good(db) {
        const { data, error } = await db.from("orders").update({ order_status: "paid" }).eq("id", id).select("id");
        if (error) return false;
        return data.length === 1;
      }
    `,
    "wrapped-write.js": `
      async function good(db) {
        await mustWrite(db.from("orders").update({ order_status: "paid" }).eq("id", id).select("id"), "ctx", { exactRows: 1 });
      }
    `,
    "read-only.js": `
      async function good(db) {
        const { data } = await db.from("orders").select("*");
        return data;
      }
    `,
  };

  try {
    mkdirSync(fixtureDir, { recursive: true });
    const files = Object.entries(lintCases).map(([name, source]) => {
      const file = join(fixtureDir, name);
      writeFileSync(file, source, "utf8");
      return file;
    });

    const eslintBin = join(ROOT, "node_modules", "eslint", "bin", "eslint.js");
    const args = [
      eslintBin,
      "--config",
      join(ROOT, ".eslintrc.json"),
      "--resolve-plugins-relative-to",
      ROOT,
      ...files,
    ];
    const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    console.log("\nESLINT FIXTURE COMMAND:");
    console.log(`${process.execPath} ${args.join(" ")}`);
    console.log("\nESLINT FIXTURE OUTPUT:");
    console.log(output.trim() || "(no output)");
    return { output, status: result.status };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const lint = runEslintFixture();
const warningCount = (lint.output.match(/local-rules\/no-unchecked-supabase-write/g) ?? []).length;
ok("eslint fixture exits successfully with warn-level rule", lint.status === 0);
ok("eslint fixture emits three warnings for bare/error-only/select-error-only writes", warningCount === 3);
ok("select without captured data is flagged", lint.output.includes("select-error-only-write.js"));
ok("captured data write is not flagged", !lint.output.includes("captured-data-write.js"));
ok("mustWrite-wrapped write is not flagged", !lint.output.includes("wrapped-write.js"));
ok("read-only select is not flagged", !lint.output.includes("read-only.js"));

console.log(`\nNO-UNCHECKED-SUPABASE-WRITE RULE PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
