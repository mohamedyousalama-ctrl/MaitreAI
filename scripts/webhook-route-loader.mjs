// Registers webhook-route-hooks.mjs (server-only + next/server stubs, @/ alias,
// extensionless→.ts) for ROUTE-LEVEL webhook proofs. Usage:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//     scripts/proof-webhook-media-route.test.ts
import { register } from "node:module";
register("./webhook-route-hooks.mjs", import.meta.url);
