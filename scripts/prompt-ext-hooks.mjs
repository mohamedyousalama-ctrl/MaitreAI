// ============================================================================
// ESM resolver+loader hook for the Khalid-wiring snapshot gate. It lets a pure
// harness import lib/ai/prompt.ts (whose runtime chain includes `server-only`
// modules — lib/promo.ts, lib/ai/standing-instructions.ts — the `@/` path alias,
// and extensionless relative imports per the repo's bundler resolution) under
// bare-node ESM:
//   • `server-only`        → an empty module (the package throws outside Next.js)
//   • `@/x`                → <cwd>/x  (the tsconfig paths alias)
//   • extensionless import not found → retry with `.ts`
// Touches no production source and no tsconfig; affects only the harness process
// it is registered into (see prompt-snapshot-loader.mjs).
// ============================================================================
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export%20default%20{}", shortCircuit: true };
  }
  // Map the `@/` tsconfig alias to an absolute file URL under the project root.
  let spec = specifier;
  if (spec.startsWith("@/")) {
    spec = pathToFileURL(join(process.cwd(), spec.slice(2))).href;
  }
  try {
    return await next(spec, context);
  } catch (err) {
    const isPathish = spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("file:");
    const hasExt = /\.[a-zA-Z0-9]+$/.test(spec);
    if (err && err.code === "ERR_MODULE_NOT_FOUND" && isPathish && !hasExt) {
      return next(spec + ".ts", context);
    }
    throw err;
  }
}
