// ============================================================================
// WO-CONSOLE-MEDIA-RENDER — red-first proof for the message-media classifier.
// The console thread bubbles render from classifyMessageMedia(m.metadata); this
// exercises the classification + field extraction + confidence formatting +
// graceful fallback that the three bubble kinds depend on.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-console-media-render.test.ts
// ============================================================================

import { classifyMessageMedia, sttConfidencePct, formatConfidence } from "../lib/console-v2/message-media.ts";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// --- VOICE (inbound: meta.voice + stt_confidence in [0,1]) --------------------
const voice = classifyMessageMedia({ voice: true, audio_id: "wa123", stt_confidence: 0.82, stt_model: "whisper" });
check("voice kind classified", voice.kind === "voice");
check("voice confidence [0,1] → 82 percent", voice.confidencePct === 82);
check("formatConfidence → Arabic-Indic ٨٢٪", formatConfidence(82) === "٨٢٪");
check("sttConfidencePct(0.82) === 82", sttConfidencePct(0.82) === 82);
check("sttConfidencePct clamps a legacy percent (95) to 95", sttConfidencePct(95) === 95);
check("outbound TTS voice (no confidence) → confidencePct null", classifyMessageMedia({ voice: true, kind: "voice_note" }).confidencePct === null);
check("voice with absent confidence → null (no fake number)", voice.confidencePct === 82 && classifyMessageMedia({ voice: true }).confidencePct === null);

// --- PHOTO (inbound customer image; provenance-marked description) -------------
const photo = classifyMessageMedia({ image: { id: "wa-media-9", mime: "image/jpeg", caption: "ده الطبق", description: "طبق كبدة", derived: true } });
check("photo kind classified", photo.kind === "photo");
check("photo caption extracted", photo.caption === "ده الطبق");
check("photo model description extracted", photo.description === "طبق كبدة");
check("photo description marked derived (provenance)", photo.descriptionDerived === true);
check("photo without description is fine (graceful)", classifyMessageMedia({ image: { id: "x" } }).kind === "photo");

// --- INTERACTIVE (outbound presentation: buttons + list) ----------------------
const buttons = classifyMessageMedia({ presentation: { kind: "buttons", header: "اختر", buttons: [{ id: "y", title: "تأكيد" }, { id: "n", title: "إلغاء" }] } });
check("buttons kind → interactive", buttons.kind === "interactive");
check("buttons header + 2 buttons", buttons.interactive?.kind === "buttons" && buttons.interactive?.header === "اختر" && buttons.interactive?.buttons?.length === 2);

const list = classifyMessageMedia({ presentation: { kind: "list", button: "القائمة", sections: [{ title: "المشاوي", rows: [{ id: "1", title: "كباب", description: "٢٠٠ جم" }, { id: "2", title: "كفتة" }] }] } });
check("list kind → interactive", list.interactive?.kind === "list");
check("list section + rows extracted", list.interactive?.sections?.[0].rows.length === 2 && list.interactive?.sections?.[0].rows[0].description === "٢٠٠ جم");
check("list trigger label extracted", list.interactive?.button === "القائمة");

// --- TEXT fallback + graceful degradation (never crash) -----------------------
check("plain AI reply meta → text", classifyMessageMedia({ model: "gpt", confidence: 90, intent: "order" }).kind === "text");
check("null metadata → text (no throw)", classifyMessageMedia(null).kind === "text");
check("undefined metadata → text", classifyMessageMedia(undefined).kind === "text");
check("malformed presentation (bad kind) → text fallback", classifyMessageMedia({ presentation: { kind: "weird" } }).kind === "text");
check("empty buttons + no header → text fallback (nothing to show)", classifyMessageMedia({ presentation: { kind: "buttons", buttons: [] } }).kind === "text");
check("RED-FIRST: a voice message is NOT rendered as plain text (the bug)", classifyMessageMedia({ voice: true, stt_confidence: 0.5 }).kind !== "text");
check("RED-FIRST: an inbound photo is NOT rendered as plain text", classifyMessageMedia({ image: { id: "z", caption: "صورة" } }).kind !== "text");

console.log(`\nCONSOLE-MEDIA-RENDER PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
