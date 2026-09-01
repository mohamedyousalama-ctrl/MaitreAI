// ============================================================================
// PROOF — a caller is only sent something to look at when they asked to see it.
//
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//        scripts/proof-call-presentation.test.ts
//
// THE DEFECT, reported by the Founder from a live call: "when I asked for the menu, he SENT
// me the menu in the chat — if I am talking on the phone, why would I look at the chat
// window?"
//
// The mechanism was worse than it sounds. The call screen is a FULL-SCREEN overlay and the
// tappable list was pushed into the thread underneath it, so the caller could not have seen
// it even if they had wanted to. What they heard was «تفضّل، هذي قائمتنا 👇» — a spoken
// pointer at content that had gone somewhere unreachable. Half the answer was audible and
// the half carrying the actual information was invisible.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { presentationForCall, callerAskedToSee } from "../lib/demo/call-presentation.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

const MENU = { kind: "list", rows: [{ id: "cat:1", title: "أطباق رئيسية" }] } as const;

console.log("\n── THE ORDINARY MENU QUESTION IS ANSWERED IN WORDS ──────────────");
{
  // The exact turn the Founder ran. A caller asking what you have is asking to be TOLD.
  for (const asked of [
    "وش عندكم؟",
    "إيش المنيو؟",
    "وش فيه أكل اليوم؟",
    "عطني المنيو",
    "وش تنصحني؟",
    "كم سعر الكبسة؟",
    "أبغى كبسة دجاج",
  ]) {
    ok(`«${asked}» sends nothing to a screen`, presentationForCall(MENU, asked) === null);
  }
}

console.log("\n── AND A CALLER WHO ASKS TO SEE IT, GETS IT ─────────────────────");
{
  // Withholding from someone who explicitly asked would be the opposite defect: they asked
  // for the thing and heard a description instead.
  for (const asked of [
    "ورّيني صور",
    "أبي أشوف الصور",
    "ارسل لي المنيو",
    "ابعث لي القائمة",
    "أبغى المنيو مكتوب",
    "اكتبها لي",
    "وش شكلها؟",
  ]) {
    ok(`«${asked}» does receive the payload`, presentationForCall(MENU, asked) === MENU);
  }
}

console.log("\n── THE DETECTOR FAILS TOWARD SPEAKING, WHICH IS THE SAFE SIDE ───");
{
  // A false negative costs one extra sentence («تحب أرسله لك مكتوب؟»). A false positive
  // silently pushes a tappable list at someone holding a phone to their ear. They are not
  // symmetric, and the detector is deliberately narrow for that reason.
  ok("an empty message shows nothing", presentationForCall(MENU, "") === null);
  ok("nonsense shows nothing", presentationForCall(MENU, "؟؟؟") === null);
  ok("a null presentation stays null even with visual intent",
    presentationForCall(null, "ارسل لي الصور") === null);
  ok("undefined is handled without throwing",
    presentationForCall(undefined, "ارسل لي الصور") === null);
  ok("the detector is exported and testable on its own",
    callerAskedToSee("ورّيني") === true && callerAskedToSee("وش عندكم") === false);
}

console.log("\n── BOTH ROUTE EXITS ARE COVERED, NOT JUST THE MODEL PATH ────────");
{
  // The route has TWO exits that can carry a presentation: the model turn and the
  // deterministic quantity rail. The rail is the one flow that already behaved like a phone
  // call, so it is exactly the one that would quietly reintroduce buttons if it were missed
  // — and a check applied to one of two exits protects neither in the case that matters.
  // This repo has been bitten by that shape more than once, so it is asserted structurally
  // rather than assumed.
  const src = readFileSync(resolve(process.cwd(), "app/api/demo/voice/route.ts"), "utf8");
  const code = src.split("\n").filter((l) => {
    const t = l.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).join("\n");

  const gated = (code.match(/presentationForCall\(/g) ?? []).length;
  ok(`every presentation-bearing exit is gated (${gated} found)`, gated >= 2);
  // RESTATED, because the property changed when the chat microphone was separated out.
  // "No exit ever passes a formatted presentation through" is no longer true and should not
  // be: the chat note is SUPPOSED to receive one — that rail is the demo's whole affordance
  // and withholding it there was the regression. What must hold now is narrower and is the
  // thing that actually protects a caller: every exit that can emit a presentation asks
  // `presentationForCall` first WHEN THE CHANNEL IS A CALL, and no exit reaches the
  // formatter on the call branch without going through the gate.
  ok("…and no exit reaches the formatter on the call branch except through the gate",
    (code.match(/isPhoneCall\s*\n?\s*\?\s*presentationForCall\(/g) ?? []).length === gated);
  ok("the gate is fed the CALLER'S OWN WORDS, not a constant",
    /presentationForCall\([\s\S]{0,220}transcript,/.test(code));

  // AND THE ROUTE MUST STILL DECLARE THE CHANNEL. Deleting that one line leaves the
  // payload correctly withheld while the model goes back to composing for a screen — so
  // the caller hears «تفضّل 👇» with nothing attached at all, which is worse than the bug
  // this replaced. Driven mutation confirmed nothing else in the suite notices.
  //
  // SOURCE-LEVEL, and said plainly: this route needs multipart audio, a transcriber and a
  // database to execute, so the declaration is pinned by reading. It is anchored INSIDE the
  // runCustomerTurn call rather than anywhere in the file, so a stray mention elsewhere
  // cannot satisfy it.
  // `runCustomerTurn(admin, {` — the admin client is the first argument. Anchoring on
  // `runCustomerTurn({` matched nothing and the assertion failed against correct code.
  const callAt = code.indexOf("await runCustomerTurn(");
  const turnCall = callAt >= 0 ? code.slice(callAt, callAt + 1600) : "";
  // AND IT DECLARES IT ONLY FOR THE CALL. This route also serves the press-and-hold
  // microphone in the chat composer, which sends a byte-identical body; when the
  // declaration was unconditional every chat voice note was told it was a phone call and
  // lost the tap-first rail. `isPhoneCall`, its default direction, and which client sends
  // the field are all pinned in proof-call-channel.test.ts.
  ok("the route declares the voice channel on its turn",
    /channel:\s*isPhoneCall \? "voice_call" : undefined/.test(turnCall));
  ok("…alongside the transcript signals, in the same call",
    /isVoiceTranscript:\s*true/.test(turnCall) && /channel:\s*isPhoneCall/.test(turnCall));
  ok("…and never unconditionally, which would reclassify the chat microphone",
    !/channel:\s*"voice_call"/.test(code));

  // …and the pipeline must MAP it. A route that declares a channel nobody reads is the
  // same defect one layer down.
  const turn = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
  ok("customer-turn maps the channel into the brain context",
    /voiceCall:\s*input\.channel === "voice_call"/.test(turn));
}

console.log("\n── THE CHANNEL SIGNAL ACTUALLY REACHES THE MODEL ────────────────");
{
  // Suppressing the payload is only half the fix: without a channel the model still
  // COMPOSES for a screen — "tap-first", «تفضّل 👇», hand off to "the list shown below" —
  // and would now do it with nothing attached at all, which is worse. Driven on the real
  // prompt builder rather than read, because a prompt section that is never rendered is
  // exactly the kind of thing a source grep would call present.
  const { buildCustomerAgentSystemPrompt } = await import("../lib/ai/prompt.ts");
  // The same shape the existing prompt proofs use, on the Saudi tenant this demo runs.
  const ctx = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    profile: { name: "مطعم الديرة", currency: "ر.س", timezone: "Asia/Riyadh", businessType: "restaurant" },
    dialect: "saudi",
    menuItems: [], modifiers: [], branches: [], deliveryAreas: [],
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [],
    aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live", isOpen: true, autoAccept: false,
    ...overrides,
  });

  const typed = buildCustomerAgentSystemPrompt(ctx() as never);
  const spoken = buildCustomerAgentSystemPrompt(ctx({ voiceCall: true }) as never);

  ok("a call prompt tells the model it is a phone call", /PHONE CALL/i.test(spoken));
  ok("…and forbids pointing at a screen",
    spoken.includes("👇") ? /NEVER point at the screen/i.test(spoken) : true);
  ok("…and says the guest cannot see anything", /cannot see/i.test(spoken));
  ok("…and caps the answer for the ear", /One or two sentences/i.test(spoken));
  ok("…and forbids reciting a long list", /NEVER recite a long list/i.test(spoken));
  ok("…and requires one question per turn", /ONE question per turn/i.test(spoken));
  ok("…and keeps business truth explicitly unchanged",
    /never what is true/i.test(spoken));
  // AND IT DOES NOT SEND A CALLER TO ANOTHER APP. The receipt rule tells the model to
  // confirm with «تأكد من رسائل واتساب» — on a call that is untrue twice: the guest is on
  // the phone rather than in a chat, and on this demo nothing is re-sent to WhatsApp at all
  // (`receiptResendRequested` has no consumer in either demo route). A promise the guest
  // cannot check is the one thing this product may never make, so the call section overrides
  // it explicitly rather than hoping the model notices the contradiction.
  ok("…and never sends a caller to WhatsApp to read something",
    /NEVER SEND THE GUEST TO ANOTHER APP/i.test(spoken));
  ok("…while the typed prompt still confirms the way it always has",
    /تأكد من رسائل واتساب/.test(typed) && !/NEVER SEND THE GUEST TO ANOTHER APP/i.test(typed));

  // THE OTHER SURFACES MUST BE BYTE-IDENTICAL. This section is additive by construction;
  // if the typed prompt changed at all, every WhatsApp tenant's behaviour just moved.
  ok("the typed prompt is unchanged — no call section leaks into it",
    !/PHONE CALL/i.test(typed));
  ok("…and the call prompt is the typed prompt PLUS a section, not a rewrite",
    spoken.length > typed.length);
  // ADDITIVE, PROVEN AS A SUBSEQUENCE. A first version asserted the register word was the
  // ONLY difference, which was true of one call-only block and broke the moment a second
  // was added — a brittleness check, not the property I care about. What must hold is that
  // the call prompt is the typed prompt PLUS call-only lines: every typed line still
  // present, in order, so nothing a WhatsApp tenant relies on was removed or reordered.
  const typedLines = typed.split("\n").map((l) => l.replace("tap-first", "spoken"));
  const spokenLines = spoken.split("\n");
  let i = 0;
  for (const line of spokenLines) if (i < typedLines.length && line === typedLines[i]) i++;
  ok(`every line of the typed prompt survives, in order (${i}/${typedLines.length})`,
    i === typedLines.length);
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} call-presentation: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
