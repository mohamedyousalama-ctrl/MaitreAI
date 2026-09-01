// ============================================================================
// MaitreAI — THE ONLY THING THAT MAY ASK ELEVENLABS TO SPEAK ON THE DEMO CALL.
//
// WHY THIS FILE HAS TO EXIST AT ALL.
//
// Today the call route synthesizes the WHOLE reply, base64s it, and returns it inside the
// turn's JSON. Nothing plays until the last byte of the last word exists. Measured in
// production: `brain=4775-6244ms tts=1807-5472ms total=8551-11015ms` — so between one and
// five and a half seconds of a caller holding a phone to their ear are spent waiting for
// audio that the provider had already started producing.
//
// The fix is to let the browser PLAY WHILE THE PROVIDER IS STILL SPEAKING. On iPhone that
// forces the shape of everything here: iOS Safari has no MediaSource, so the only
// progressive path is an <audio> element pointed at an HTTP URL. An <audio> element issues
// a plain GET. It cannot POST a reply, and it cannot be trusted to carry one.
//
// SO THE DANGEROUS VERSION OF THIS FEATURE IS THE OBVIOUS ONE: `/speak?text=…`. That is a
// free, unauthenticated, unmetered text-to-speech oracle on a public marketing page, in our
// name, on our card, in our cloned-and-registered voice. Anyone could make Khalid say
// anything and screenshot it. It would also route around every control this repo has built
// — the hard-zero categories, the voice pin, the daily cap — because all of them run on the
// POST path the <audio> element never touches.
//
// A TICKET, THEREFORE. The turn route runs the brain, runs every gate, decides the reply is
// speakable, and only then signs a short-lived token that CONTAINS THE TEXT ITSELF. The
// speak route synthesizes what the ticket says and nothing else. The browser never supplies
// a word; it only hands back something we authored and signed moments earlier.
//
// WHAT ACTUALLY HOLDS THE LINE, honestly ranked:
//   1. The text is OURS. It is signed, so it cannot be edited into anything else. This is
//      the whole control; everything below only bounds the blast radius.
//   2. It expires in a minute. A ticket is for the turn it was minted for.
//   3. The FIRST synthesis is booked when the ticket is issued, not when the audio is
//      fetched, so the durable cap runs ahead of the money instead of behind it. A REPEAT
//      fetch is a second real synthesis, and `/api/demo/speak` both refuses it past a small
//      per-ticket allowance and writes what it does permit to the ledger — because the cap
//      counts TURNS, and a replay consumes no turn, so the cap alone would never see it.
//   4. The verifier RE-RUNS the text-only refusals itself. Not because the issuer is
//      expected to get them wrong, but because "a guard that protects one of two callers
//      protects neither in the case that matters" is a lesson this repo has now paid for
//      more than once. A ticket is not a permission slip that skips the door.
//   5. It is bound to the demo session it was minted for. Weak on its own — that id is
//      client-held and this file says so plainly — but it makes a ticket non-transferable,
//      which is what bounds a URL that ends up in a screenshot or a log.
//
// AND IT FAILS CLOSED, EVERY TIME. No secret, bad signature, expired, wrong session,
// over-cap, empty, or refusable text — all produce NO TICKET or NO AUDIO. The caller then
// gets exactly what they get today when synthesis is unavailable: the full reply as text,
// on a screen that is already showing it.
// ============================================================================

import { createHmac, hkdfSync, timingSafeEqual } from "crypto";
import { voiceHardZeroReason } from "@/lib/messaging/voice-budget";
import { buildElevenLabsRequest } from "@/lib/ai/tts/elevenlabs";
import {
  DEMO_TTS_MAX_CHARS, demoVoiceDecision,
  type DemoVoiceOpts, type DemoVoiceOut,
} from "@/lib/demo/voice-out";

/** A minute. Long enough for the browser to fetch the audio it was just told about, short
 *  enough that a leaked URL is stale before it can be passed around. */
export const SPEECH_TICKET_TTL_MS = 60_000;

export interface SpeechTicketPayload {
  /** The reply, exactly as the turn route decided to say it. Server-authored, always. */
  text: string;
  /** The canonical registry voice id. Carried so the speak route never re-reads env and
   *  never re-derives which voice to buy — the decision is made once, under the pin. */
  voiceId: string;
  /** The demo conversation this was minted for, when there is one. */
  sid: string | null;
  /** Expiry, epoch ms. */
  exp: number;
}

export type SpeechTicketRefusal =
  | "no_secret"      // nothing to sign with — the feature is simply off
  | "malformed"      // not two base64url parts, or not JSON
  | "bad_signature"  // signed with something else, or edited after signing
  | "expired"
  | "wrong_session"
  | "empty"
  | "too_long"
  | "refused_text";  // the verifier's own reading of the text says do not speak it

export type SpeechTicketVerdict =
  | { ok: true; payload: SpeechTicketPayload }
  | { ok: false; reason: SpeechTicketRefusal };

// ── THE SIGNING KEY ─────────────────────────────────────────────────────────
//
// A per-process random key would be correct on one machine and WRONG HERE: Vercel runs
// several instances, the turn that mints a ticket and the request that redeems it routinely
// land on different ones, and the failure would be an intermittent silent call that no
// local run reproduces. So the key must be derived from something every instance already
// shares and agrees on, byte for byte.
//
// DEMO_SPEECH_SECRET if an operator sets one. Otherwise HKDF over the service-role key with
// a fixed salt and info string, which is a one-way derivation: the ticket key cannot be run
// backwards into the credential, and the credential itself never leaves the server or
// appears in a ticket. Deriving rather than requiring a new variable is deliberate — the
// standing rule is not to hold the project on an admin step, and a feature that is silently
// off until someone visits a dashboard is the same outage with better manners.
function signingKey(): Buffer | null {
  const explicit = (process.env.DEMO_SPEECH_SECRET || "").trim();
  // Short enough to be guessable is worse than absent, because absent fails closed loudly
  // and short fails open quietly.
  if (explicit.length >= 32) return Buffer.from(explicit, "utf8");

  const root = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!root) return null;
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(root, "utf8"), Buffer.from("kivo/demo/speech"), Buffer.from("speech-ticket-v1"), 32)
  );
}

/** Is the feature configured at all? Exported so a caller can choose the buffered path
 *  without minting a ticket it knows will be refused. */
export function speechTicketsAvailable(): boolean {
  return signingKey() !== null;
}

const b64u = (b: Buffer): string => b.toString("base64url");

/** The text-only refusals the VERIFIER can evaluate on its own.
 *
 *  It cannot re-derive `safetyHold` or `isReceipt` — those are turn signals, and a turn
 *  carrying them never got a ticket in the first place. What it CAN read is the text, and
 *  on this channel that means a payment link must never be spoken: a link is useless to an
 *  ear and reading a URL aloud is a phishing-shaped act. Prices ARE allowed here, by the
 *  same ruling the call route runs under — the call screen displays the reply while the
 *  audio plays, which is the compensating control a WhatsApp voice note never had. */
function verifierRefusal(text: string): SpeechTicketRefusal | null {
  const t = String(text ?? "");
  if (!t.trim()) return "empty";
  if (t.length > DEMO_TTS_MAX_CHARS) return "too_long";
  const hard = voiceHardZeroReason(t, { safetyHold: false, isReceipt: false, spokenPricesAllowed: true });
  return hard ? "refused_text" : null;
}

/**
 * Mint a ticket for a reply the turn route has ALREADY decided to speak.
 *
 * Returns null rather than throwing, and null means one thing: no audio this turn. The
 * caller falls back to the text it is already showing.
 */
export function signSpeechTicket(
  input: { text: string; voiceId: string; sid?: string | null; ttlMs?: number }
): string | null {
  const key = signingKey();
  if (!key) return null;

  const text = String(input?.text ?? "");
  // THE SAME REFUSALS ON THE WAY IN. Minting a ticket the verifier will reject buys a
  // charge and delivers silence, which is the worst of both.
  if (verifierRefusal(text)) return null;

  const voiceId = String(input?.voiceId ?? "").trim();
  if (!voiceId) return null;

  const ttl = Number.isFinite(input?.ttlMs) ? Number(input?.ttlMs) : SPEECH_TICKET_TTL_MS;
  const payload: SpeechTicketPayload = {
    text,
    voiceId,
    sid: input?.sid ? String(input.sid) : null,
    exp: Date.now() + Math.max(1_000, Math.min(ttl, SPEECH_TICKET_TTL_MS)),
  };

  // ENCODE FIRST, THEN SIGN THE ENCODED BYTES. Signing the object and encoding afterwards
  // leaves the verifier re-serializing to check — and two JSON serializations that differ
  // by key order or whitespace are a signature mismatch on a ticket nobody touched.
  const body = b64u(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64u(createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

/**
 * Check a ticket and hand back what it authorizes. Never throws.
 *
 * `sid` is the session the REQUEST arrived on. A ticket minted with a session may only be
 * redeemed on that session.
 */
export function verifySpeechTicket(
  ticket: string | null | undefined,
  ctx?: { sid?: string | null; now?: number }
): SpeechTicketVerdict {
  const key = signingKey();
  if (!key) return { ok: false, reason: "no_secret" };

  const raw = String(ticket ?? "");
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return { ok: false, reason: "malformed" };
  const body = raw.slice(0, dot);
  const given = raw.slice(dot + 1);

  const expected = b64u(createHmac("sha256", key).update(body).digest());
  // Length first: timingSafeEqual THROWS on a length mismatch, and a throw here would be a
  // 500 on the audio element instead of a quiet, texted fallback.
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };

  let payload: SpeechTicketPayload;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SpeechTicketPayload;
    if (!parsed || typeof parsed !== "object") return { ok: false, reason: "malformed" };
    if (typeof parsed.text !== "string" || typeof parsed.voiceId !== "string" ||
        typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) {
      return { ok: false, reason: "malformed" };
    }
    payload = parsed;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const now = Number.isFinite(ctx?.now) ? Number(ctx?.now) : Date.now();
  if (now > payload.exp) return { ok: false, reason: "expired" };

  // BOUND TO ITS SESSION. Strict on purpose: a ticket that names a session and is redeemed
  // without one is refused rather than waved through, because "accept when absent" is a
  // control an attacker removes by deleting a field.
  const sid = payload.sid ? String(payload.sid) : null;
  if (sid && String(ctx?.sid ?? "") !== sid) return { ok: false, reason: "wrong_session" };

  // AND THE VERIFIER READS THE TEXT ITSELF. A valid signature proves we wrote this; it does
  // not prove we should say it. Both questions get asked.
  const refusal = verifierRefusal(payload.text);
  if (refusal) return { ok: false, reason: refusal };

  return { ok: true, payload };
}


/**
 * The streaming counterpart of `demoVoiceReply`: same answer, no network, no waiting.
 *
 * `demoVoiceReply` decides, then BUYS the whole synthesis and returns base64. This decides,
 * then hands back a URL — the audio is bought by `/api/demo/speak` when the browser fetches
 * it, and plays as it arrives. On a live call that is the difference between a caller
 * hearing the first word in a few hundred milliseconds and hearing nothing for up to five
 * and a half seconds.
 *
 * THE DECISION IS NOT REIMPLEMENTED. It calls `demoVoiceDecision`, which is the same
 * function `demoVoiceReply` calls, so "may we say this?" has exactly one answer no matter
 * how the bytes travel.
 *
 * THE COST IS KNOWN BEFORE THE PURCHASE. ElevenLabs bills per character of INPUT, and the
 * input is in hand here, so the ledger can be written and the cap checked in the same turn
 * that approved the reply — rather than in a later request that no spend guard is watching.
 * The request is built (not sent) to get that number, which also means a missing key, an
 * unregistered voice or a model the account cannot use is caught HERE, before a ticket
 * exists, instead of becoming a URL that answers with silence.
 *
 * Never throws. A null result of any kind means: no audio, show the text.
 */
export function demoVoiceTicket(
  replyText: string,
  opts?: DemoVoiceOpts & { sid?: string | null }
): DemoVoiceOut {
  const none = (skipped: DemoVoiceOut["skipped"]): DemoVoiceOut =>
    ({ audioBase64: null, speechUrl: null, mime: null, skipped, spend: null });

  const decision = demoVoiceDecision(replyText, opts);
  if (!decision.speak) return none(decision.skipped);

  let req;
  try {
    req = buildElevenLabsRequest(decision.text, {
      voiceId: decision.voiceId,
      // MP3, because this is a BROWSER. Safari cannot decode Ogg Opus.
      format: "mp3",
      stream: true,
    });
  } catch (e) {
    // Exactly the failures `demoVoiceReply` reports as `synth_failed`, caught one step
    // earlier because nothing has been bought yet. Named, not swallowed: a revoked key, a
    // plan without the pinned model and an unregistered voice are three different fixes.
    const why = (e instanceof Error ? e.message : String(e)).replace(/[\r\n\t]+/g, " ");
    console.warn(`[demo/voice] no speech ticket: ${why.slice(0, 300)}`);
    return none("synth_failed");
  }

  const ticket = signSpeechTicket({
    text: decision.text,
    voiceId: decision.voiceId,
    sid: opts?.sid ?? null,
  });
  if (!ticket) {
    // No signing key, or a text the verifier would refuse. Either way there is nothing to
    // hand the browser, and the caller falls back to the text already on their screen.
    console.warn("[demo/voice] no speech ticket: could not sign");
    return none("synth_failed");
  }

  const sid = opts?.sid ? `&s=${encodeURIComponent(String(opts.sid))}` : "";
  return {
    audioBase64: null,
    speechUrl: `/api/demo/speak?t=${encodeURIComponent(ticket)}${sid}`,
    mime: req.mime,
    skipped: null,
    // BOOKED NOW, NOT WHEN THE BYTES ARRIVE. The spend guard runs on this turn; the GET that
    // fetches the audio is not a turn and has no guard in front of it. Charging at the
    // decision keeps the cap ahead of the money. It also means a caller who hangs up before
    // playback is charged for a synthesis nobody heard — deliberately the conservative
    // direction, since the alternative is spending that the ledger never sees.
    spend: {
      costUsd: req.costUsd,
      chars: req.body.length,
      model: req.model,
      adapter: "elevenlabs",
    },
  };
}
