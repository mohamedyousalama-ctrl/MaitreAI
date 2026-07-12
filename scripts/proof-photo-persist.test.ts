// ============================================================================
// WO-PHOTO-PERSIST — red-first proof. buildDishPhotoMessage produces the exact
// message row for a sent outbound dish photo, the classifier renders it (with the
// public URL), and the send path persists ONLY behind persist_outbound_media.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-photo-persist.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildDishPhotoMessage } from "../lib/messaging/dish-photo-message.ts";
import { classifyMessageMedia } from "../lib/console-v2/message-media.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// --- buildDishPhotoMessage shape ---------------------------------------------
const row = buildDishPhotoMessage({
  restaurantId: "r1", conversationId: "c1",
  imageUrl: "https://cdn.example/dish.jpg", name: "شاورما دجاج",
  caption: "شاورما دجاج — ٣٥ ﷼", externalMessageId: "wamid.ABC",
});
check("direction outbound", row.direction === "outbound");
check("sender ai (Karim)", row.sender === "ai");
check("status sent", row.status === "sent");
check("channel_message_id from send result", row.channel_message_id === "wamid.ABC");
check("meta.kind dish_photo", row.meta.kind === "dish_photo");
check("meta.image.url = public url", row.meta.image.url === "https://cdn.example/dish.jpg");
check("meta.image.name = item name", row.meta.image.name === "شاورما دجاج");
check("meta.image.caption = caption", row.meta.image.caption === "شاورما دجاج — ٣٥ ﷼");
check("text = caption when present", row.text === "شاورما دجاج — ٣٥ ﷼");

// no caption → text falls back to item name; caption omitted from meta
const noCap = buildDishPhotoMessage({ restaurantId: "r", conversationId: "c", imageUrl: "u", name: "كبدة" });
check("no caption → text = item name", noCap.text === "كبدة");
check("no caption → meta.image.caption omitted", noCap.meta.image.caption === undefined);
check("absent externalMessageId → channel_message_id null", noCap.channel_message_id === null);
check("blank caption trimmed → omitted", buildDishPhotoMessage({ restaurantId: "r", conversationId: "c", imageUrl: "u", name: "x", caption: "   " }).meta.image.caption === undefined);

// --- classifier renders the outbound dish photo (with real thumbnail URL) ------
const view = classifyMessageMedia(row.meta);
check("classified as photo", view.kind === "photo");
check("classifier surfaces imageUrl (real thumbnail)", view.imageUrl === "https://cdn.example/dish.jpg");
check("classifier surfaces item name", view.name === "شاورما دجاج");
check("RED-FIRST: a persisted dish photo is NOT plain text (was invisible before)", view.kind !== "text");
// inbound customer image (media-id, no url) → no imageUrl (placeholder path)
const inbound = classifyMessageMedia({ image: { id: "wa-media-1", caption: "صورة" } });
check("inbound image → no imageUrl (media-id, needs proxy)", inbound.kind === "photo" && inbound.imageUrl === undefined);

// --- send path: persists ONLY behind the flag (flag-off byte-identical) --------
const src = readFileSync(join(ROOT, "lib/messaging/respond-and-send.ts"), "utf8");
check("(send) reads persist_outbound_media flag", /isFeatureExplicitlyEnabled\("persist_outbound_media"/.test(src));
check("(send) persist is guarded by the flag", /if \(persistOutboundMedia\) \{[\s\S]*buildDishPhotoMessage/.test(src));
check("(send) persist lives in the sent branch (not the failure note)", src.indexOf('send.status === "sent"') < src.indexOf("buildDishPhotoMessage("));
check("(send) persist is best-effort (wrapped in try/catch)", /try \{[\s\S]*buildDishPhotoMessage[\s\S]*\} catch/.test(src));

console.log(`\nPHOTO-PERSIST PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
