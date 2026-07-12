// ============================================================================
// WO-MEDIA-PROXY — red-first proof. resolveConsoleMediaId serves ONLY an inbound
// image media-id, and the route is session-authed + tenant-scoped + graceful.
// Run: node --experimental-strip-types scripts/proof-media-proxy.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveConsoleMediaId } from "../lib/console-v2/console-media-id.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// --- resolveConsoleMediaId: only an inbound image media-id is servable ---------
check("inbound image media-id → served", resolveConsoleMediaId({ image: { id: "wa-media-1", caption: "صورة" } }) === "wa-media-1");
check("outbound dish photo (url, no id) → NOT proxied (null)", resolveConsoleMediaId({ image: { url: "https://cdn/x.jpg", name: "كبدة" } }) === null);
check("image without id → null", resolveConsoleMediaId({ image: { caption: "x" } }) === null);
check("blank id → null", resolveConsoleMediaId({ image: { id: "   " } }) === null);
check("voice meta → null", resolveConsoleMediaId({ voice: true, audio_id: "a1" }) === null);
check("interactive meta → null", resolveConsoleMediaId({ presentation: { kind: "buttons" } }) === null);
check("empty meta → null", resolveConsoleMediaId({}) === null);
check("null meta → null (no throw)", resolveConsoleMediaId(null) === null);
check("string meta → null", resolveConsoleMediaId("nope") === null);
check("RED-FIRST: audio_id is NOT treated as an image media-id", resolveConsoleMediaId({ voice: true, audio_id: "a1" }) !== "a1");

// --- route: session-authed, tenant-scoped, graceful ---------------------------
const route = read("app/api/console/media/[messageId]/route.ts");
check("(route) requires a console session (requireTenant)", /requireTenant\(\)/.test(route) && /gate\.response/.test(route));
check("(route) tenant-scoped lookup (restaurant_id = caller's tenant)", /\.eq\("restaurant_id", tenant\.restaurantId\)/.test(route));
check("(route) uses resolveConsoleMediaId (only inbound image ids)", /resolveConsoleMediaId\(/.test(route));
check("(route) streams via downloadWhatsAppMedia", /downloadWhatsAppMedia\(/.test(route));
check("(route) 404 on any miss (no id / unavailable)", (route.match(/status: 404/g) ?? []).length >= 2);
check("(route) Cache-Control private (never CDN/cross-session)", /Cache-Control": "private/.test(route));
check("(route) no public bypass — media id never taken from the request/query", !/searchParams|req\.url/.test(route));

// --- console: inbound photo bubble points at the proxy -------------------------
const page = read("app/(console-v2)/c/(app)/conversations/page.tsx");
check("(console) inbound photo uses the media proxy route", /\/api\/console\/media\/\$\{encodeURIComponent\(m\.id\)\}/.test(page));

console.log(`\nMEDIA-PROXY PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
