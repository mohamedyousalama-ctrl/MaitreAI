// ============================================================================
// PROOF — the Mizan render script may only ever speak the REGISTERED voice.
//
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//        scripts/proof-mizan-voice-registry.test.ts
//
// WHY THIS FILE EXISTS, AND WHY IT DRIVES THE SCRIPT.
//
// scripts/mizan/mizan-voice.mjs is a raw fetch to api.elevenlabs.io taking an
// operator-supplied VOICE_A/B/C, uploading the result to a PUBLIC Supabase bucket that the
// reviewer page plays. A review drove it with the identified G0-R quarantined object and got
// 13 syntheses and 13 public uploads — a legacy object generated AND exposed — from a
// directory no proof had ever looked at.
//
// Guards were added. The commit that added them claimed "a proof asserts the extraction
// still works and still yields the registered id." THAT WAS NOT TRUE — no such proof
// existed. The only thing watching the script was a containment regex asking whether its
// SOURCE mentioned the registry, and removing both guard calls while leaving the function
// definition in place kept the whole 215-file suite green and reproduced the original 13
// syntheses and 13 uploads exactly.
//
// The same trap, twice in two commits, in the file whose header describes the trap. So this
// EXECUTES the script against instrumented network and storage, and asserts what it did.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KHALID_VOICE } from "../lib/ai/tts/voice-registry.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fails.push(label); console.log(`  FAIL ${label}`); }
};

const SCRIPT = "scripts/mizan/mizan-voice.mjs";
const QUARANTINED = "VuqFqWXHibJ61b9IiVJ7"; // the one identified legacy object (KIV-90/95)

/** Run the script with instrumented globals and report what it actually reached. */
async function run(voiceA: string): Promise<{ providerCalls: string[]; uploads: string[]; error: string | null }> {
  const providerCalls: string[] = [];
  const uploads: string[] = [];
  const realFetch = globalThis.fetch;
  const env = { ...process.env };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("api.elevenlabs.io")) providerCalls.push(url);
    if (url.includes("/storage/v1/object")) uploads.push(url);
    return {
      ok: true, status: 200, text: async () => "",
      json: async () => ({}),
      arrayBuffer: async () => new TextEncoder().encode("MP3").buffer,
    } as unknown as Response;
  }) as typeof fetch;

  Object.assign(process.env, {
    VOICE_A: voiceA,
    ELEVENLABS_API_KEY: "el-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "svc",
  });

  let error: string | null = null;
  try {
    // Cache-busted so each run re-executes the module body rather than replaying the first.
    await import(`${resolve(process.cwd(), SCRIPT)}?t=${Date.now()}${Math.random()}`);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
  return { providerCalls, uploads, error };
}

console.log("\n── THE QUARANTINED OBJECT REACHES NOTHING ───────────────────────");
{
  const r = await run(QUARANTINED);
  // ZERO, not "fewer". The original defect was not that it eventually stopped — the
  // script's own HOLD did fire — but that it fired AFTER 13 syntheses and 13 public
  // uploads. A refusal that happens after the money and the publication is not a refusal.
  ok("the quarantined legacy object triggers NO synthesis at all", r.providerCalls.length === 0);
  ok("…and NO upload to the public bucket", r.uploads.length === 0);
  ok("…and the run is refused by name, so an operator can see what they did",
    (r.error ?? "").includes("not in the voice release registry"));
  ok("…and the refusal names the registered id it expected",
    (r.error ?? "").includes(KHALID_VOICE.voiceId));
}

console.log("\n── AND SO DOES EVERY OTHER UNREGISTERED ID ──────────────────────");
for (const bad of [
  "21m00Tcm4TlvDq8ikWAM",                       // ElevenLabs stock Rachel
  KHALID_VOICE.voiceId.slice(0, -1) + "X",      // a one-character typo
  KHALID_VOICE.voiceId.toLowerCase(),           // case variant — ids are case-sensitive
  "",                                           // empty
]) {
  const r = await run(bad);
  ok(`${JSON.stringify(bad.slice(0, 12))}… reaches no provider and no bucket`,
    r.providerCalls.length === 0 && r.uploads.length === 0);
}

console.log("\n── THE ALLOWED ID COMES FROM THE REGISTRY, NOT A COPY ───────────");
{
  // The script cannot import the TypeScript registry, so it extracts the literal. If that
  // extraction ever silently fails or drifts, the guard would be comparing against the
  // wrong value — and every id, including the right one, would be refused or admitted
  // incorrectly. Assert the extraction still yields exactly the registered id.
  const src = readFileSync(resolve(process.cwd(), SCRIPT), "utf8");
  ok("the script reads the id out of voice-registry.ts rather than hardcoding one",
    /voice-registry\.ts/.test(src) && !new RegExp(`"${KHALID_VOICE.voiceId}"`).test(src));
  const registry = readFileSync(resolve(process.cwd(), "lib/ai/tts/voice-registry.ts"), "utf8");
  const extracted = registry.match(/voiceId:\s*"([A-Za-z0-9]+)"/)?.[1];
  ok("…and that extraction yields the registered id", extracted === KHALID_VOICE.voiceId);
}

console.log("\n── THE MODEL IS PINNED HERE TOO ─────────────────────────────────");
{
  // The script used to take ELEVENLABS_TTS_MODEL unchecked, defaulting to
  // eleven_flash_v2_5 — so reviewers in the public bucket scored «Khalid kivo» rendered
  // under a model the Founder never accepted, with «قهوة» uncorrected, while .env.example
  // told operators that variable "is refused". True of the product adapter, false here.
  const env = { ...process.env };
  process.env.ELEVENLABS_TTS_MODEL = "eleven_flash_v2_5";
  const r = await run(KHALID_VOICE.voiceId);
  ok("an unregistered MODEL is refused, even with the right voice",
    r.providerCalls.length === 0 && r.uploads.length === 0 &&
    (r.error ?? "").includes("does not match the registered model"));
  process.env.ELEVENLABS_TTS_MODEL = KHALID_VOICE.model;
  const agree = await run(KHALID_VOICE.voiceId);
  ok("…while a model that AGREES is a no-op confirmation, not a refusal",
    !(agree.error ?? "").includes("does not match the registered model"));
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

// AND THE CORRECT CONFIGURATION MUST ACTUALLY RUN. Every assertion above is a refusal, so
// a script that threw on load — as one did, when the model constant was declared above the
// registry extraction it depends on — would pass all of them while being entirely broken.
{
  const r = await run(KHALID_VOICE.voiceId);
  ok("the registered voice is NOT refused — the guards are not simply always-on",
    !(r.error ?? "").includes("not in the voice release registry") &&
    !(r.error ?? "").includes("Cannot access"));
  ok("…and it reaches the provider", r.providerCalls.length > 0);
  ok("…with the registered voice id on the wire",
    r.providerCalls.every((u) => u.includes(KHALID_VOICE.voiceId)));
}

console.log("\n── DEFENCE IN DEPTH: EITHER GUARD ALONE STILL REFUSES ───────────");
{
  // Two call sites — once for the whole run, once per synthesis. A review confirmed each
  // catches the quarantined object on its own. Asserted structurally so that deleting one
  // is visible, since deleting BOTH is what this proof drives.
  const src = readFileSync(resolve(process.cwd(), SCRIPT), "utf8");
  const calls = (src.match(/assertRegisteredVoice\(/g) ?? []).length;
  ok(`the guard is called at more than one place (${calls} found)`, calls >= 3); // 1 def + 2 calls
  ok("…including before the network, inside synth()",
    /async function synth[\s\S]{0,200}assertRegisteredVoice\(/.test(src));
  ok("…and once for the whole run, before any synthesis begins",
    /for \(const \[k, v\] of Object\.entries\(voices\)\)[\s\S]{0,120}assertRegisteredVoice\(/.test(src));
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} mizan-voice-registry: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
