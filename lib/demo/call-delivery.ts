// ============================================================================
// MaitreAI — HOW A SPOKEN REPLY TRAVELS: buffered, or streamed.
//
// WHY THIS IS A FUNCTION AND NOT A CONDITION IN A ROUTE.
//
// The choice was one inline expression:
//
//     const streamTheCall = isPhoneCall && speechTicketsAvailable();
//
// and the only thing asserting it was a source regex on the SHAPE of the ternary that
// consumed it. So `&& false` — one token — put every call back on the buffered path, made
// the caller wait the full 1.8-5.5 seconds again, undid the entire latency change, and left
// all 223 proofs green. A review found it by driving the mutation.
//
// That is the same defect this repo has now paid for in a comment, a variable name, a
// function name and a prompt section: an assertion on the TEXT of a decision is not an
// assertion on the decision. So the decision is a pure function with a truth table, and the
// table is driven.
//
// WHAT THE ANSWER MEANS.
//
//   "stream"   — mint a signed ticket and hand the browser a URL. Playback starts while the
//                provider is still speaking. Only for a PHONE CALL, where the wait is the
//                thing being fixed, and only when a signing key exists to make a ticket.
//   "buffered" — synthesize the whole reply and return it inline. What a chat voice note
//                gets by design (it is read on the screen it was recorded on, so progressive
//                playback buys it nothing), and what a call falls back to when tickets are
//                unavailable — which must be a slower call, never a silent one.
// ============================================================================

export type CallDelivery = "stream" | "buffered";

export function callDelivery(input: {
  isPhoneCall: boolean;
  ticketsAvailable: boolean;
}): CallDelivery {
  // Both, or neither. A chat note never streams however the keys are configured, and a call
  // without a signing key falls back rather than failing.
  return input.isPhoneCall === true && input.ticketsAvailable === true ? "stream" : "buffered";
}
