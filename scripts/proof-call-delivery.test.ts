// ============================================================================
// PROOF — a call streams, and the choice cannot be switched off quietly.
//
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//        scripts/proof-call-delivery.test.ts
//
// THE MUTATION THIS EXISTS FOR. The delivery choice was one inline expression:
//
//     const streamTheCall = isPhoneCall && speechTicketsAvailable();
//
// Appending `&& false` — one token — put every phone call back on the buffered path, made
// the caller wait the full measured 1.8-5.5 seconds again, undid the entire latency change,
// and left all 223 proofs green. The only thing looking at it was a regex on the SHAPE of
// the ternary that consumed it, which the mutated line still satisfied.
//
// So this file does BOTH halves, because either alone is the failure mode:
//
//   1. It drives the decision as a function, over its whole truth table.
//   2. It pins the ROUTE'S OWN EXPRESSION, whole, to the semicolon — so a token appended to
//      it fails here. Driving a function the route does not use, or uses with something
//      bolted on, proves nothing about the product; that is precisely the trap an extraction
//      invites and the reason this second half exists.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { callDelivery } from "../lib/demo/call-delivery.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

console.log("\n── THE WHOLE TRUTH TABLE, DRIVEN ───────────────────────────────");
{
  // Four inputs, four answers, and only one of them streams.
  const table: Array<[boolean, boolean, "stream" | "buffered"]> = [
    [true,  true,  "stream"],    // a phone call, and a key to sign a ticket with
    [true,  false, "buffered"],  // a call with no signing key — SLOWER, never silent
    [false, true,  "buffered"],  // a chat voice note, read on the screen it was recorded on
    [false, false, "buffered"],
  ];
  for (const [isPhoneCall, ticketsAvailable, expected] of table) {
    ok(`call=${isPhoneCall} tickets=${ticketsAvailable} → ${expected}`,
      callDelivery({ isPhoneCall, ticketsAvailable }) === expected);
  }
  ok("streaming needs BOTH, and there is exactly one way to get it",
    table.filter(([, , e]) => e === "stream").length === 1);

  // FAILS TOWARD THE OLD DELIVERY. A missing or non-boolean input is a chat note, which is
  // the behaviour this route had before any call work existed — never a stream, which is the
  // mode that mints tickets and spends money.
  for (const bad of [undefined, null, "true", 1, {}, []]) {
    ok(`a non-boolean call flag (${JSON.stringify(bad) ?? String(bad)}) buffers`,
      callDelivery({ isPhoneCall: bad as never, ticketsAvailable: true }) === "buffered");
    ok(`…and a non-boolean key flag buffers`,
      callDelivery({ isPhoneCall: true, ticketsAvailable: bad as never }) === "buffered");
  }
}

console.log("\n── AND THE ROUTE'S OWN EXPRESSION, WHOLE ───────────────────────");
{
  // THE HALF THAT CATCHES `&& false`. A regex that merely FINDS `callDelivery(` in the file
  // is satisfied by `callDelivery(…) === "stream" && false`, which is the mutation that
  // started this. The whole assignment is captured to its semicolon and compared exactly, so
  // anything appended, removed or negated fails here.
  const src = readFileSync(resolve(process.cwd(), "app/api/demo/voice/route.ts"), "utf8");
  const code = src.split("\n").filter((l) => {
    const t = l.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).join("\n");

  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  const EXPECTED = norm(`callDelivery({ isPhoneCall, ticketsAvailable: speechTicketsAvailable() }) === "stream"`);

  // 1. The model turn's choice.
  const at = code.indexOf("const streamTheCall =");
  ok("the route makes the choice once, by name", at >= 0);
  const stmt = at >= 0 ? code.slice(at + "const streamTheCall =".length, code.indexOf(";", at)) : "";
  ok(`…and it is EXACTLY the shared decision, with nothing bolted on [${norm(stmt).slice(0, 80)}]`,
    norm(stmt) === EXPECTED);

  // 2. The deterministic quantity rail — the other exit that speaks. A choice applied to one
  // of two exits leaves the same caller streaming when they ask a question and waiting when
  // they answer «حبتين», which is the turn that most needs to feel immediate.
  const at2 = code.indexOf("const filledSpoken =");
  ok("the quantity rail makes the same choice", at2 >= 0);
  const stmt2 = at2 >= 0 ? code.slice(at2, code.indexOf("?", at2)) : "";
  ok(`…by the same function, not a second inline condition [${norm(stmt2).slice(-70)}]`,
    norm(stmt2).endsWith(EXPECTED));

  // 3. AND NO EXIT DECIDES IT BY HAND. Two spellings of one decision is how they drift.
  ok("nothing in the route re-derives the delivery inline",
    !/isPhoneCall && speechTicketsAvailable\(\)/.test(code));
  ok("…and every delivery choice goes through the shared function",
    (code.match(/callDelivery\(/g) ?? []).length === 2);
}

console.log("\n── AND STREAMING IS WHAT A CALL ACTUALLY GETS ──────────────────");
{
  // The choice being correct is not the same as it being CONNECTED. `streamTheCall` must
  // still select the ticket path on both exits, or the decision is a variable nobody reads.
  const src = readFileSync(resolve(process.cwd(), "app/api/demo/voice/route.ts"), "utf8");
  const code = src.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  ok("a streamed call mints a ticket instead of buying a synthesis",
    /streamTheCall\s*\n?\s*\?\s*demoVoiceTicket\(closed\.reply/.test(code));
  ok("…and the buffered path is the fallback, not the default",
    /:\s*await demoVoiceReply\(closed\.reply, speakOpts\)/.test(code));
  ok("…and the carrier follows the same choice",
    /streamTheCall\s*\n?\s*\?\s*demoVoiceTicket\(carrier/.test(code));
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} call-delivery: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
