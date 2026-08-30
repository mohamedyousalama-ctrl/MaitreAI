// ============================================================================
// MaitreAI — ElevenLabs TTS adapter — the PRODUCTION voice.
//
// Khalid's voice is «Khalid kivo» (`pYDa2s34YCzHjbn4DnXP`), a fully synthetic Voice Design
// produced from a written prompt — no donor recording, no clone. It is handed over by
// KIV-313 with an exact configuration, and this adapter's job is to reproduce that
// configuration on the wire, byte for byte, or refuse to speak.
//
// WHAT THIS FILE DID NOT SEND, AND HAD TO.
// The request body was `{ text, model_id }` and nothing else. Two consequences:
//
//   1. NO VOICE SETTINGS — so ElevenLabs applied whatever is saved on the voice object at
//      that moment. The configuration the Founder actually listened to and accepted
//      (stability 0.50, similarity 0.75, style 0, speed 1.00) was therefore not something
//      this code guaranteed; it was something we hoped nobody had changed in a dashboard.
//      A voice "verified at 0.50" that silently renders at whatever the object now holds
//      is not a verified voice. The settings are now sent explicitly on every request.
//   2. NO PRONUNCIATION DICTIONARY — so «قهوة» was mispronounced on every single render,
//      which is the one correction the handoff proved and froze.
//
// THE MODEL IS PART OF THE ACCEPTANCE, NOT A PREFERENCE. KIV-313: keep `eleven_v3` unless a
// separately reviewed model change is authorized. So `ELEVENLABS_TTS_MODEL` may confirm the
// registered model but may not silently replace it — a model swap changes how the voice
// sounds, and a change nobody reviewed is exactly what "separately reviewed" excludes.
//
// AND THE VOICE ITSELF IS ALLOW-LISTED (lib/ai/tts/voice-registry.ts). The refusal lives
// HERE, in the adapter, rather than only in the demo's caller, because the demo is not the
// only surface that can reach ElevenLabs — lib/messaging/respond-and-send.ts can too. A
// guard that protects one of two callers protects neither in the case that matters.
// ============================================================================

import type { TtsAdapter } from "./types";
import { ttsCostUsd } from "./pricing";
import { KHALID_VOICE, lookupVoice, normalizeVoiceId, voiceRefusalReason } from "./voice-registry";

/** Marker for a 4xx: something is MISCONFIGURED, and no other voice fixes it. */
export const TTS_CONFIG_FAULT = "ElevenLabs TTS configuration fault";

export const elevenlabsTtsAdapter: TtsAdapter = {
  name: "elevenlabs",
  async synthesize(text, opts) {
    // TRIMMED AT THE POINT OF USE. A caller that validated a TRIMMED env value while this
    // file read the RAW one produced two different strings: `ELEVENLABS_TTS_MODEL` with one
    // stray space passed the caller's price check and then priced at $0 here, taking the
    // whole synthesis off the spend ledger; a padded voice id requested
    // `/v1/text-to-speech/%20%20ID%20%20` and 404'd in production.
    const key = (process.env.ELEVENLABS_API_KEY || "").trim();
    if (!key) throw new Error("ELEVENLABS_API_KEY not set");

    const configured = normalizeVoiceId(opts?.voiceId || process.env.ELEVENLABS_VOICE_ID || "");
    if (!configured) throw new Error("ELEVENLABS_VOICE_ID not set");

    // THE ALLOW LIST, BEFORE ANY MONEY IS SPENT. An unregistered id is refused here rather
    // than after a paid synthesis, and the refusal names what was wrong so an operator can
    // fix it without guessing.
    const voice = lookupVoice(configured);
    if (!voice) throw new Error(`ElevenLabs TTS refused: ${voiceRefusalReason(configured)}`);

    // AND WE SEND THE REGISTERED ID, NOT WHAT WAS TYPED. The lookup tolerates case and
    // invisible characters so that a correct id pasted from a dashboard is not read as an
    // unknown voice — but ElevenLabs voice ids are CASE-SENSITIVE, so putting the
    // operator's variant on the wire turned that tolerance into a 404 in production
    // (`.../pyda2s34yczhjbn4dnxp` was accepted here and would never resolve there). The
    // registry holds the canonical spelling; everything downstream uses it.
    const voiceId = voice.voiceId;

    // The registered model is the default. An override is permitted only if it AGREES —
    // see the header: an unreviewed model change is not ours to make.
    const requested = (process.env.ELEVENLABS_TTS_MODEL || "").trim();
    if (requested && requested !== voice.model) {
      throw new Error(
        `ElevenLabs TTS refused: ELEVENLABS_TTS_MODEL="${requested}" does not match the ` +
          `model «${voice.name}» was accepted under ("${voice.model}"). A model change needs ` +
          `its own review (KIV-313 §3).`
      );
    }
    const model = voice.model;
    const body = String(text ?? "");

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=opus_48000_64`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/ogg" },
        body: JSON.stringify({
          text: body,
          model_id: model,
          voice_settings: {
            stability: voice.settings.stability,
            similarity_boost: voice.settings.similarity_boost,
            style: voice.settings.style,
            use_speaker_boost: voice.settings.use_speaker_boost,
            speed: voice.settings.speed,
          },
          // The ONE proven correction: «قهوة» → ɡahwa. Deliberately not the old broad
          // 18-rule qaf dictionary, which was never qualified for this voice.
          pronunciation_dictionary_locators: [
            {
              pronunciation_dictionary_id: voice.pronunciationDictionary.id,
              version_id: voice.pronunciationDictionary.versionId,
            },
          ],
        }),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // A 4xx IS A CONFIGURATION FAULT, NOT AN OUTAGE, and the difference decides whether
      // the fallback law applies. A revoked key, a plan without `eleven_v3`, an unknown
      // dictionary locator, an exhausted quota — all are PERMANENT until someone changes
      // something, so answering them by buying an OpenAI voice ships an American male
      // reading Arabic to a real customer on EVERY turn, forever, while paging the Founder
      // each time. Tagged so `synthesizeVoiceReply` can tell the two apart; 5xx and network
      // failures stay outages, which is what the fallback exists for.
      // ANYTHING THAT IS NOT A 5xx IS NOT AN OUTAGE. 4xx is the reachable case (bad key, wrong
      // plan, unknown dictionary, exhausted quota); a 3xx reaching here would mean a redirect
      // fetch did not follow, which is also a configuration fact rather than a provider that
      // is down. Only 5xx earns the fallback.
      const kind = res.status < 500 ? TTS_CONFIG_FAULT : "ElevenLabs TTS";
      throw new Error(`${kind} ${res.status}: ${detail.slice(0, 200)}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    return {
      audio,
      mime: "audio/ogg",
      model,
      adapter: "elevenlabs",
      chars: body.length,
      costUsd: ttsCostUsd(`elevenlabs:${model}`, body.length),
      voiceId,
    };
  },
};

/** Re-exported so callers and proofs read the pin from one place. */
export { KHALID_VOICE };
