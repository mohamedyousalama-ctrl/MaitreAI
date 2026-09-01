// ============================================================================
// MaitreAI — IS THIS A PHONE CALL, OR A VOICE NOTE IN THE CHAT?
//
// One route (`app/api/demo/voice`) serves two surfaces that are not the same product:
//
//   THE CHAT MICROPHONE — press-and-hold in the composer. The visitor is looking at the
//   thread. They should get the typed prompt and the full tap-first rail: categories, item
//   list, quantity buttons, confirm/cancel. That rail is the demo's flagship affordance.
//
//   THE CALL OVERLAY — full screen, phone held to the ear. Nothing tappable can be seen,
//   because the thread is UNDERNEATH the overlay. Screen payloads are withheld unless the
//   caller asks to see something, and prices may be spoken because the overlay shows the
//   reply while the audio plays.
//
// THE DEFECT THIS CLOSES. Both surfaces POST byte-identical multipart bodies — `audio`,
// `history`, `conversationId` — and for one release the route had no way to tell them
// apart, so it treated every chat voice note as a phone call. A visitor holding the mic in
// the chat was told they were "HOLDING A PHONE TO THEIR EAR" and could "not see anything",
// and the rail was withheld from the one surface that renders it.
//
// AND THE DEFAULT RUNS TOWARD THE CHAT. A missing field, an unknown value, a `File` where a
// string was expected — all mean NOTE. That direction is the entire safety of this switch:
// the note is the behaviour this route had before any call work existed and that every
// earlier proof covers, while the call is the mode that REMOVES things from the screen. A
// switch that fails toward removing things is a switch that breaks a working surface the
// first time a client is out of step with a deploy.
// ============================================================================

/** The single literal a caller must send to be treated as a phone call. */
export const CALL_CHANNEL_VALUE = "call";

/**
 * Read the channel off a multipart field. Anything that is not exactly the call literal is
 * a chat voice note.
 *
 * Deliberately EXACT, not a prefix or a case-insensitive match: this is our own client
 * talking to our own route, so there is no spelling to be generous about, and generosity
 * here only widens the set of inputs that can silently strip the rail off the chat.
 */
export function isPhoneCallChannel(raw: unknown): boolean {
  return typeof raw === "string" && raw === CALL_CHANNEL_VALUE;
}
