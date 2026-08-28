// ============================================================================
// WO-STT-UPLOAD-FILENAME — the transcription upload must tell the provider the
// truth about its container.
//
// Run: node --experimental-strip-types scripts/proof-stt-upload-filename.test.ts
//
// WHY THIS EXISTS
// ---------------
// OpenAI's and Groq's transcription endpoints pick their decoder from the
// multipart FILENAME EXTENSION, not from the Content-Type. Both adapters used to
// send a hardcoded "audio.ogg" while passing the real mime through as the blob
// type. That was accidentally correct for the only audio source that existed —
// WhatsApp genuinely sends Ogg — and silently wrong for every other source.
//
// A browser MediaRecorder emits `audio/webm;codecs=opus` on Chrome/Firefox and
// `audio/mp4` on Safari/iOS. Uploaded as ".ogg", both are rejected with a 400
// "Invalid file format". Nothing in the repo caught this because nothing had yet
// sent browser audio. This test is that catch.
//
// THE TRAP THIS PINS, SPECIFICALLY: `audio/webm;codecs=opus` contains the
// substring "opus". Any mapper that tests for "opus" before "webm" mislabels
// browser audio as Ogg — which is exactly the bug, reintroduced. The webm case
// below fails against that ordering.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sttUploadFilename } from "../lib/ai/stt/types.ts";
import { extForMime } from "../lib/voice/golden-archive.ts";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

// ── 1. WhatsApp behaviour must be BYTE-IDENTICAL to before the fix ──────────
// This is the regression that matters most: live traffic is Ogg, and this fix
// must not perturb a single request that works today.
ok("audio/ogg → audio.ogg (live WhatsApp path unchanged)", sttUploadFilename("audio/ogg") === "audio.ogg");
ok("audio/ogg; codecs=opus → audio.ogg (WhatsApp's actual header)",
  sttUploadFilename("audio/ogg; codecs=opus") === "audio.ogg");
ok("unknown mime → audio.ogg (pre-fix fallback preserved)", sttUploadFilename("application/octet-stream") === "audio.ogg");
ok("null/undefined → audio.ogg (never an empty or extensionless name)",
  sttUploadFilename(null) === "audio.ogg" && sttUploadFilename(undefined) === "audio.ogg");

// ── 2. the browser formats that were broken ────────────────────────────────
ok("audio/webm → audio.webm", sttUploadFilename("audio/webm") === "audio.webm");
ok("THE BUG: audio/webm;codecs=opus → audio.webm, NOT audio.ogg (Chrome/Firefox)",
  sttUploadFilename("audio/webm;codecs=opus") === "audio.webm");
ok("audio/mp4 → audio.m4a (Safari/iOS)", sttUploadFilename("audio/mp4") === "audio.m4a");
ok("audio/x-m4a → audio.m4a", sttUploadFilename("audio/x-m4a") === "audio.m4a");
ok("audio/wav → audio.wav", sttUploadFilename("audio/wav") === "audio.wav");
ok("audio/mpeg → audio.mp3", sttUploadFilename("audio/mpeg") === "audio.mp3");
ok("case-insensitive (a header may arrive uppercased)", sttUploadFilename("AUDIO/WEBM") === "audio.webm");
ok("every result carries a real extension", ["audio/webm", "audio/mp4", "audio/wav", "audio/ogg", "x/y"]
  .every((m) => /^audio\.[a-z0-9]+$/.test(sttUploadFilename(m))));

// ── 3. both adapters actually USE it ───────────────────────────────────────
// Behaviour, not text: assert the hardcoded literal is gone from the upload call
// and the helper is what names the file.
for (const f of ["lib/ai/stt/openai.ts", "lib/ai/stt/groq.ts"]) {
  const src = read(f).split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  ok(`(${f}) no hardcoded "audio.ogg" filename remains`, !/\)\s*,\s*"audio\.ogg"\s*\)/.test(src));
  ok(`(${f}) the upload filename comes from sttUploadFilename(opts?.mimeType)`,
    /sttUploadFilename\(\s*opts\?\.mimeType\s*\)/.test(src));
}

// ── 4. the archive mapper had the same latent ordering bug ─────────────────
ok("extForMime: webm is not mislabelled as ogg", extForMime("audio/webm;codecs=opus") === "webm");
ok("extForMime: the pinned ogg case is unchanged", extForMime("audio/ogg; codecs=opus") === "ogg");
ok("extForMime: the pinned mpeg case is unchanged", extForMime("audio/mpeg") === "mp3");

console.log(`\nSTT-UPLOAD-FILENAME PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
