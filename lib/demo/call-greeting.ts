// ============================================================================
// MaitreAI — KHALID ANSWERS THE PHONE.
//
// THE DEFECT. The call screen opened straight into "listening". Khalid said nothing; the
// visitor had to speak first into a silent line. Nobody answers a phone that way — the
// person who picks up speaks, and the caller answers them. A restaurant owner shown this
// screen sees a product that waits to be talked at.
//
// It is also the worst possible first second for the rest of the design: the silence
// detector starts its eight-second clock immediately, so a visitor who hesitates — which is
// exactly what a person does when a line goes quiet — burns the re-prompt before the
// conversation has started.
//
// WHY THE TEXT LIVES HERE AND NOT IN THE BROWSER. `/api/demo/speak` will only ever say
// something the server signed (see lib/demo/speech-ticket.ts — the alternative is a free
// text-to-speech oracle in our own voice). So the greeting has to be OURS, minted here, and
// handed to the client as a URL it can play but not edit.
//
// IT RIDES THE CAPABILITY PROBE. The call screen already asks `/api/demo/capabilities`
// whether voice works before it opens, so the greeting is minted in that same answer: no
// extra round trip, and it is minted exactly when a call is opening rather than on every
// page view.
//
// AND IT FAILS TOWARD TODAY. No key, no ticket, a refusal of any kind — the client gets
// `null` and the call starts listening immediately, which is precisely the behaviour that
// shipped before this file existed. A greeting is worth adding; it is not worth a call that
// will not start.
// ============================================================================

import { demoVoiceTicket } from "@/lib/demo/speech-ticket";

/**
 * What Khalid says when the line opens.
 *
 * SHORT ON PURPOSE — about two seconds. The microphone is not yet listening while this
 * plays, so every extra word is a word the visitor could be talking over and losing. It
 * names the restaurant (a caller needs to know they dialled the right place), names him, and
 * ends on a question so the floor is handed over rather than left open.
 *
 * NO PRICES, NO ORDER NUMBERS, NO LINKS — not by luck: `demoVoiceTicket` runs the same
 * hard-zero gate over this string as over any reply, so a future edit that put a figure in
 * here would mint no ticket and the call would simply start silent.
 */
export const DEMO_CALL_GREETING = "هلا والله، معك خالد من مطعم الديرة. وش أقدر أخدمك؟";

export interface DemoCallGreeting {
  /** Shown on the call screen while it plays, exactly as every other spoken reply is. */
  text: string;
  /** The signed, single-turn URL the player fetches. */
  url: string;
}

/**
 * Mint the greeting for one opening call, or null if it cannot be spoken.
 *
 * The spend is booked at mint, like every other ticket — so a visitor who opens the call
 * screen and closes it immediately still costs one short synthesis. That is the conservative
 * direction and it is bounded by the capability probe's own per-IP limit; the alternative,
 * booking when the audio is fetched, puts the money ahead of the cap.
 */
export function demoCallGreeting(sid: string | null): DemoCallGreeting | null {
  const out = demoVoiceTicket(DEMO_CALL_GREETING, { inboundWasVoice: true, sid });
  if (!out.speechUrl) return null;
  return { text: DEMO_CALL_GREETING, url: out.speechUrl };
}
