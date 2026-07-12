// ============================================================================
// WO-VOICE-ALIASES — RED-FIRST: imports resolveVoiceCandidates / expectedAnswerClass /
// CLASS_PRIORITY_TERMS (absent on the pre-WO tree → ESM link fails → red). Deterministic
// menu CANDIDATE matching before the Brain: per-tenant alias table + edit-distance against
// menu names, provenance-marked («قراءة»), feeding the ladder's confirm line.
//
// HARD LAW: allergen-class words are excluded from candidates entirely (they route to the
// safety net). PLUS state-aware bias (quantity/size/sauce). Red-first anchor: «ستريبسي» →
// candidate «ستربس دجاج» with confirm.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-voice-aliases.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  resolveVoiceCandidates, expectedAnswerClass, CLASS_PRIORITY_TERMS, SEED_VOICE_ALIASES,
} from "../lib/ai/voice-aliases.ts";
import { confirmVoiceReply, buildSttPromptVocab } from "../lib/ai/voice-quality.ts";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

const MENU = ["ستربس دجاج", "رانش", "بطاطس", "كومبو كبير", "كريسبي", "شاورما"];

// ══ LEG 1 — the red anchor: «ستريبسي» → candidate «ستربس دجاج» + confirm ═══════
{
  const cands = resolveVoiceCandidates("عايز ستريبسي", { menuItemNames: MENU });
  ok("LEG1: «ستريبسي» resolves to candidate «ستربس دجاج» via alias",
    cands.length > 0 && cands[0].item === "ستربس دجاج" && cands[0].source === "alias" && cands[0].confidence === 1);
  const reply = confirmVoiceReply("egyptian", "عايز ستريبسي", cands[0]?.item);
  ok("LEG1: the confirm line uses the top candidate («قصدك «ستربس دجاج»…»)",
    reply.includes("ستربس دجاج") && /قصدك/.test(reply));
}

// ══ LEG 2 — the seed alias variants all canonicalize ═════════════════════════
{
  const top = (t: string) => resolveVoiceCandidates(t, { menuItemNames: MENU })[0]?.item ?? null;
  ok("LEG2: «استربس» / «ستريبس» → ستربس دجاج", top("استربس") === "ستربس دجاج" && top("ستريبس") === "ستربس دجاج");
  ok("LEG2: «رنش» / «رانتش» → رانش", top("رنش") === "رانش" && top("رانتش") === "رانش");
  ok("LEG2: «بطاطه» → بطاطس ; «كرسبي» → كريسبي", top("بطاطه") === "بطاطس" && top("كرسبي") === "كريسبي");
}

// ══ LEG 3 — edit-distance (no alias) still matches a near menu token ═══════════
{
  const cands = resolveVoiceCandidates("عايز شورما", { menuItemNames: MENU });
  ok("LEG3: «شورما» → «شاورما» via edit distance (menu_near)",
    cands.length > 0 && cands[0].item === "شاورما" && cands[0].source === "menu_near");
}

// ══ LEG 4 — HARD LAW: allergen-class tokens are NEVER menu candidates ═════════
{
  const almondMenu = ["لوز محمص", "ستربس دجاج"];
  ok("LEG4: «عايز لوز» yields NO candidate (allergen routes to the safety net)",
    resolveVoiceCandidates("عايز لوز", { menuItemNames: almondMenu }).length === 0);
  // A non-allergen candidate is still returned when an allergen word co-occurs.
  const mixed = resolveVoiceCandidates("عايز ستريبسي ولوز", { menuItemNames: almondMenu });
  ok("LEG4: a co-occurring allergen never suppresses a legit menu candidate",
    mixed.some((c) => c.item === "ستربس دجاج") && !mixed.some((c) => c.item === "لوز محمص"));
}

// ══ LEG 5 — state-aware bias (candidate order + STT prompt + class detection) ══
{
  ok("LEG5: expectedAnswerClass detects quantity/size/sauce",
    expectedAnswerClass("كم قطعة تحب؟") === "quantity" &&
    expectedAnswerClass("أي حجم — كبير ولا وسط؟") === "size" &&
    expectedAnswerClass("أنهي صوص؟ رانش ولا حار؟") === "sauce" &&
    expectedAnswerClass("أهلاً بيك") === null);
  // Class bias: with expectedClass=size, the size-bearing item sorts first.
  const biased = resolveVoiceCandidates("عايز كومبو كبير وستربس", { menuItemNames: MENU, expectedClass: "size" });
  ok("LEG5: a size-class question biases «كومبو كبير» to the top", biased[0]?.item === "كومبو كبير");
  // The STT prompt front-loads the priority terms (survive the length cap).
  const p = buildSttPromptVocab(["حاجة طويلة جدا", "صنف تاني"], 40, ["تسعة", "قطع"]);
  ok("LEG5: buildSttPromptVocab front-loads priority terms under a tight cap", p.startsWith("تسعة") && p.includes("قطع"));
  ok("LEG5: CLASS_PRIORITY_TERMS covers all three classes",
    CLASS_PRIORITY_TERMS.quantity.length > 0 && CLASS_PRIORITY_TERMS.size.length > 0 && CLASS_PRIORITY_TERMS.sauce.length > 0);
}

// ══ LEG 6 — confirm reply: candidate vs echo, both §0 banned-clean ═══════════
{
  const withCand = confirmVoiceReply("saudi", "غير مهم", "ستربس دجاج");
  const echo = confirmVoiceReply("saudi", "٩ قطع");
  ok("LEG6: candidate confirm uses «قصدك»; no-candidate confirm echoes «سمعت»",
    /قصدك/.test(withCand) && /سمعت/.test(echo));
  ok("LEG6: both confirm variants are §0 banned-clean",
    scanBannedAllergyPhrases(withCand).length === 0 && scanBannedAllergyPhrases(echo).length === 0);
  ok("LEG6: SEED_VOICE_ALIASES carries the ratified seeds",
    SEED_VOICE_ALIASES["ستريبسي"] === "ستربس" && SEED_VOICE_ALIASES["رنش"] === "رانش");
}

// ══ LEG 7 — WIRING (customer-turn + webhook) ═════════════════════════════════
{
  const ct = read("lib/ai/customer-turn.ts");
  ok("WIRE: confirm branch resolves candidates (state-aware) before the Brain",
    /resolveVoiceCandidates\(input\.userMessage, \{/.test(ct) && /expectedClass: expectedAnswerClass\(lastAssistant\)/.test(ct));
  ok("WIRE: the top candidate feeds the confirm outcome", /voiceConfirmResult\(dialect, input\.userMessage, initialDraft, ctx\.profile\.currency, candidates\)/.test(ct));
  ok("WIRE: candidates are provenance-marked «قراءة» in the signal", /provenance: "قراءة", candidates/.test(ct));
  const wh = read("app/api/whatsapp/webhook/route.ts");
  ok("WIRE: webhook passes state-aware priority terms to STT", /transcribeWhatsAppVoice\(m\.audioId, m\.audioMime, sttMenuNames, sttPriorityTerms\)/.test(wh));
}

console.log(`\nWO-VOICE-ALIASES PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
