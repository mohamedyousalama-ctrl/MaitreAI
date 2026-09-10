// ============================================================================
// ESM resolver hook for ROUTE-LEVEL webhook proofs (WO-LIVE-3 §6 standing class).
// Lets a pure harness import an App-Router route handler (which pulls `next/server`,
// `server-only`, the `@/` alias, and extensionless relative imports) under bare-node
// ESM — so an inbound-path WO can post a real webhook body through the ACTUAL handler:
//   • `server-only`  → empty module (the package throws outside Next.js)
//   • `next/server`  → the minimal NextResponse stub in ./stubs/next-server.mjs
//   • `@/x`          → <cwd>/x  (tsconfig paths alias)
//   • extensionless relative not found → retry with `.ts`
// Touches no production source; affects only the harness process it is registered into.
// ============================================================================
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const NEXT_SERVER_STUB = pathToFileURL(join(process.cwd(), "scripts/stubs/next-server.mjs")).href;

// `next/server` has no ESM export map in Next 14, so bare node cannot resolve it and
// every route proof gets the minimal stub above. A MIDDLEWARE proof cannot use that
// stub: it asserts on NextResponse.rewrite / .redirect / .next, and asserting against
// a stub I wrote would prove the stub, not the framework. Setting REAL_NEXT_SERVER=1
// resolves the CommonJS entry directly instead, so such a proof runs the real classes
// and the real `x-middleware-rewrite` / 307 / `x-middleware-next` semantics.
// Opt-in, because the real module is heavier and the route proofs do not need it.
const NEXT_SERVER_REAL = pathToFileURL(join(process.cwd(), "node_modules/next/server.js")).href;
const useRealNextServer = process.env.REAL_NEXT_SERVER === "1";

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export%20default%20{}", shortCircuit: true };
  }
  if (specifier === "next/server") {
    return { url: useRealNextServer ? NEXT_SERVER_REAL : NEXT_SERVER_STUB, shortCircuit: true };
  }
  let spec = specifier;
  if (spec.startsWith("@/")) {
    spec = pathToFileURL(join(process.cwd(), spec.slice(2))).href;
  }
  try {
    return await next(spec, context);
  } catch (err) {
    const isPathish = spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("file:");
    const hasExt = /\.[a-zA-Z0-9]+$/.test(spec);
    // Extensionless file → retry with `.ts`.
    if (err && err.code === "ERR_MODULE_NOT_FOUND" && isPathish && !hasExt) {
      return next(spec + ".ts", context);
    }
    // Directory import (e.g. `@/lib/ai/stt`) → retry with `/index.ts`.
    if (err && err.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
      const base = err.url ?? spec;
      return next(base.replace(/\/$/, "") + "/index.ts", context);
    }
    throw err;
  }
}
