// ============================================================================
// ESM resolver hook — lets a pure-ESM proof harness (run under
// `node --experimental-strip-types`) import a production lib module whose
// INTERNAL relative imports are extensionless (the repo convention: tsconfig
// uses `moduleResolution: bundler`, and Next's SWC resolves extensions). Bare
// Node ESM requires explicit extensions, so on ERR_MODULE_NOT_FOUND for an
// extensionless relative specifier we retry with `.ts`. Nothing else changes —
// this touches no production source and no tsconfig; it only affects the harness
// process it is registered into (see ts-ext-loader.mjs + agent-eval.yml gate 3d).
// ============================================================================

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExt = /\.[a-zA-Z0-9]+$/.test(specifier);
    if (err && err.code === "ERR_MODULE_NOT_FOUND" && isRelative && !hasExt) {
      return next(specifier + ".ts", context);
    }
    throw err;
  }
}
