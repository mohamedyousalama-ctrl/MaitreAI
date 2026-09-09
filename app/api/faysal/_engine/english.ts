// ============================================================================
// فيصل / Faysal — the English register (SPEC-2 §3.2).
//
// "If he must speak English, he is the SAME MAN speaking his second language —
// short, concrete, unornamented. He is not a hotel concierge."
//
// BANNED, and asserted by `assertEnglishRegister()` below: kindly · esteemed ·
// Dear valued patient · wellness journey · world-class · state-of-the-art ·
// Please be informed that · Rest assured · at your earliest convenience · Feel
// free to · exclamation marks · any sentence over 20 words.
//
// COVERAGE IS PARTIAL AND THAT IS DELIBERATE. English strings exist here for the
// scenes an English-speaking prospect actually reaches on this demo. Where one
// does not exist the Arabic frozen string ships, which §3.1 licenses: "Arabic is
// the home register and the tie-break." A machine-translated clinical sentence is
// worse than the home register, and §3.3 already owns the third-language case.
// ============================================================================

const BANNED = [
  "kindly", "esteemed", "dear valued", "wellness journey", "world-class", "world class",
  "state-of-the-art", "please be informed", "rest assured", "at your earliest convenience",
  "feel free to",
];

/** Dev-time guard. Throws on a register violation rather than shipping one. */
export function assertEnglishRegister(text: string): string {
  const lower = text.toLowerCase();
  for (const b of BANNED) {
    if (lower.includes(b)) throw new Error(`[faysal] English register violation: "${b}" in "${text.slice(0, 60)}"`);
  }
  if (text.includes("!")) throw new Error("[faysal] English register violation: exclamation mark.");
  for (const sentence of text.split(/[.?\n]/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    if (words.length > 20) throw new Error(`[faysal] English register violation: ${words.length}-word sentence.`);
  }
  return text;
}

export const EN = {
  greeting:
    "This is Faysal from Al Wattan Medical Group.\n" +
    "I arrange appointments across our Riyadh branches, and I can find the one nearest you and right for your case.\n" +
    "What do you need today — a general consultation, a specific clinic, or labs and imaging?",

  identity:
    "I am Faysal. I arrange appointments for Al Wattan Medical Group patients and I follow up with you from here. What do you need?",

  match: (branch: string, reason: string) => `The one that suits you is ${branch} — ${reason}.`,

  discoverShort: "Which district are you in, and is the visit on insurance or cash?",

  insurance: (insurer: string) =>
    `Your ${insurer} network class and deductible come from your own card, and reception verifies them before the consultation.\n` +
    `I will not tell you it is covered and have you find out otherwise.`,

  priceLabel: "This is an indicative price; reception confirms it.",

  close: (branch: string, clinic: string, slot1: string, slot2: string) =>
    `I have two times at ${branch}, ${clinic}:\n• ${slot1}\n• ${slot2}\nWhich one shall I hold?`,

  hold: (slot: string, branch: string, minutes: number, name: string) =>
    `Done. I am holding ${slot} at ${branch} for ${minutes} minutes.\nShall I confirm it under ${name}?`,

  unknown: (alternative: string) =>
    `I cannot confirm that from my side, and I do not want to give you something uncertain.\nYour quickest route: ${alternative}.`,

  closing: "Done. Anything else you need, I am here.",
} as const;

// Fail at import time rather than in front of a client.
for (const value of Object.values(EN)) {
  if (typeof value === "string") assertEnglishRegister(value);
}
assertEnglishRegister(EN.match("Ar Rawabi", "the laser sessions are done there"));
assertEnglishRegister(EN.insurance("Bupa"));
assertEnglishRegister(EN.close("Ar Rawabi", "dermatology and laser", "Saturday 11:00 AM", "Sunday 5:30 PM"));
assertEnglishRegister(EN.hold("Saturday 11:00 AM", "Ar Rawabi", 10, "Guest"));
assertEnglishRegister(EN.unknown("call the branch"));
