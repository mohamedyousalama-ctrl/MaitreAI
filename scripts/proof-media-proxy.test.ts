// ============================================================================
// WO-MEDIA-PROXY — red-first proof. resolveConsoleMediaId serves ONLY an inbound
// image media-id, and the route is session-authed + tenant-scoped + graceful.
// Run: node --experimental-strip-types scripts/proof-media-proxy.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { photoCaption, resolveConsoleMediaId } from "../lib/console-v2/console-media-id.ts";

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

// --- photoCaption: alt text for the photo bubble -------------------------------
// Customer-authored, so it is only ever an alt attribute — React renders it as a
// text node. "" (not null) on absence, so the caller can fall back to a generic
// Arabic description rather than shipping an unlabelled image.
check("caption present → returned trimmed", photoCaption({ image: { id: "x", caption: "  الطلب وصل غلط  " } }) === "الطلب وصل غلط");
check("no caption → empty string, not null", photoCaption({ image: { id: "x" } }) === "");
check("non-string caption → empty string", photoCaption({ image: { id: "x", caption: 42 } }) === "");
check("no image → empty string", photoCaption({ audio: { id: "v" } }) === "");
check("null/undefined meta → empty string", photoCaption(null) === "" && photoCaption(undefined) === "");

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
// This was red from the day the proxy was written until 2026-08-27: the route
// existed and was correct, but NOTHING rendered a photo. A customer sending a
// picture of a rash, or of the wrong dish, showed in the console as the literal
// text "رسالة بدون نص" — message with no text. The proxy had no caller at all.
//
// The assertion below deliberately does NOT pin the loop variable's name (it used
// to require exactly `m.id`, which is why wiring it as `msg.id` still read as
// broken). It pins the things that actually matter instead.
const page = read("app/(console-v2)/c/(app)/conversations/page.tsx");

check("(console) inbound photo uses the media proxy route",
  /`\/api\/console\/media\/\$\{encodeURIComponent\(\s*\w+\.id\s*\)\}`/.test(page));

// The src must be the MESSAGE id — the route resolves the media-id server-side from
// that message's own meta. Interpolating a media-id from the client would let the
// browser name the object it wants to fetch.
check("(console) the proxy is addressed by message id, never by a client-supplied media id",
  !/\/api\/console\/media\/\$\{[^}]*media[^}]*\}/i.test(page));

// Gated on the same pure resolver the route authorizes with, so the console only
// renders an <img> for media the route will actually serve — no broken images on
// voice notes, interactive replies, or outbound dish photos.
check("(console) the photo bubble is gated on resolveConsoleMediaId",
  /resolveConsoleMediaId\(/.test(page));

// A photo with no caption must still be announced to a screen reader.
check("(console) the image carries alt text with a non-empty fallback",
  /alt=\{[^}]*\|\|[^}]*\}/.test(page));

// The caption is customer-authored. It may be rendered as a text node (React
// escapes it) but must never be injected as markup.
check("(console) no dangerouslySetInnerHTML anywhere in the thread view",
  !/dangerouslySetInnerHTML/.test(page));

console.log(`\nMEDIA-PROXY PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
