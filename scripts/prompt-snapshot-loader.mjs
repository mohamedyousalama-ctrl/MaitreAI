// Registers prompt-ext-hooks.mjs (server-only stub + extensionless→.ts) for the
// current Node process. Usage:
//   node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//     scripts/proof-khalid-wiring-snapshot.test.ts
import { register } from "node:module";
register("./prompt-ext-hooks.mjs", import.meta.url);
