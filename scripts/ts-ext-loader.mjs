// Registers ts-ext-hooks.mjs (extensionless-relative → .ts retry) for the
// current Node process. Usage:
//   node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types <harness>
// See ts-ext-hooks.mjs for why this exists (repo uses bundler resolution; bare
// Node ESM needs explicit extensions on a lib module's internal imports).
import { register } from "node:module";
register("./ts-ext-hooks.mjs", import.meta.url);
