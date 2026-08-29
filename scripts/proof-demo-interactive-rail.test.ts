// ============================================================================
// Proof: a TAP on the demo does what a tap does on WhatsApp — deterministically.
//
// LIVE EVIDENCE. Tapping «تأكيد الطلب» closed order #1002 instantly. Typing
// «ايه أكد الطلب» — the same intent, in a customer's own words — re-printed the receipt
// and asked again. Forever.
//
// ROOT CAUSE, and it was documented as safe: app/demo/DemoPhone.tsx threw the tapped row's
// ID away and sent only the visible TITLE, with a comment saying that was fine "because
// the Brain understands it anyway". So a tap and a typed sentence were byte-identical at
// the route, and closing an order depended on the model choosing to call finalize.
// Meanwhile lib/messaging/typed-actions.ts — which resolves a tapped id to an ACTION with
// NO model call at all — was reachable only from the WhatsApp bridge. The demo tenant's
// seed even switches `typed_interactive_actions` and `typed_quantity_fill` ON: dead
// configuration, because nothing on this path ever read them.
//
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-demo-interactive-rail.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isTypedInteractiveActionId, interactiveCommandFromId } from "../lib/messaging/typed-actions.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  FAIL", name); }
};
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const phone = read("app/demo/DemoPhone.tsx");
const route = read("app/api/demo/turn/route.ts");
const typed = read("lib/messaging/typed-actions.ts");

// ── 1. the client stops discarding the id ────────────────────────────────────
ok("the tapped row's ID is forwarded, not dropped", /onPick\(it\.title, it\.id\)/.test(phone));
ok("onPick accepts it", /onPick = useCallback\(\(label: string, id\?: string\)/.test(phone));
ok("send carries it", /async \(text: string, asVoice\?: \{ seconds: number \}, interactiveId\?: string\)/.test(phone));
ok("it reaches the request body", /body: JSON\.stringify\(\{ text, history, conversationId: convId\.current, interactiveId \}\)/.test(phone));
ok("the bubble still shows the TITLE, as WhatsApp does", /void send\(label, undefined, id\)/.test(phone));

// ── 2. the route validates before it dispatches ──────────────────────────────
// handleTypedInteractiveAction THROWS on an unregistered id, and this id arrives from a
// public page. The order of these two calls is the whole safety property.
ok("the id is length-capped", /String\(body\.interactiveId \?\? ""\)\.trim\(\)\.slice\(0, 64\)/.test(route));
ok("isTypedInteractiveActionId is checked BEFORE dispatching",
  route.indexOf("isTypedInteractiveActionId(rawInteractiveId)") > 0 &&
  route.indexOf("isTypedInteractiveActionId(rawInteractiveId)") < route.indexOf("await handleTypedInteractiveAction"));
// A CALL, not a mention — the route explains in a comment WHY it never calls this, and a
// bare substring test would fail on its own documentation.
ok("an unrecognised id NEVER reaches handleUnknownInteractiveCommand — it writes a staff-facing row carrying the visitor's own words",
  !/handleUnknownInteractiveCommand\s*\(/.test(route) &&
  !/import[^;]*handleUnknownInteractiveCommand[^;]*;/.test(route));
ok("a rail failure falls through to the text path rather than losing the turn",
  /catch \(e\) \{[\s\S]{0,200}falling through to the model/.test(route));

// ── 3. the demo's isolation contract still holds ─────────────────────────────
ok("the rail declares demoRun", /demoRun: true,/.test(route));
ok("both typed-action handlers accept demoRun", (typed.match(/demoRun\?: boolean;/g) ?? []).length === 2);
ok("BOTH conversation_signals flushes are gated on it",
  (typed.match(/if \(ctx\.signals\.length && !args\.demoRun\) \{/g) ?? []).length === 2);
ok("…and no ungated flush survives",
  !/if \(ctx\.signals\.length\) \{/.test(typed));

// ── 4. a confirm TAP and a typed confirm land on the same path ───────────────
// confirm_gate is deliberately NOT answered by the rail: it canonicalises to the fixed
// «تأكيد الطلب.» string and falls through to the normal turn, so both routes into a close
// share one code path — and closeDemoOrder still runs. This is what respond-and-send does.
ok("confirm_gate sets the canonical userMessage instead of returning early",
  /typed\.kind === "confirm_gate"[\s\S]{0,120}userMessage = typed\.userMessage/.test(route));
ok("the turn then uses that message, not the raw text", /^\s*userMessage,$/m.test(route));
ok("confirm_order is a confirm_gate, so it performs no writes of its own",
  /command\.kind === "confirm_order"[\s\S]{0,200}kind: "confirm_gate"/.test(typed));

// ── 5. the early reply is formatted like every other customer-visible string ─
ok("the rail's reply goes through formatCustomerVisibleText",
  /reply: formatCustomerVisibleText\(typed\.reply, typed\.dialect\)/.test(route));
ok("…and its presentation through formatCustomerVisiblePresentation",
  /formatCustomerVisiblePresentation\(typed\.presentation, typed\.dialect\)/.test(route));
ok("typed-actions returns the tenant dialect so the caller need not guess it",
  /dialect: string;/.test(typed) && (typed.match(/^\s*dialect,$/gm) ?? []).length >= 2);

// ── 6. the ids the demo can actually send are the ones the rail understands ──
for (const id of ["qty:2", "confirm_order", "cancel_order", "add_more"]) {
  ok(`«${id}» is a registered typed action`, isTypedInteractiveActionId(id));
  ok(`…and resolves to a command`, interactiveCommandFromId(id) !== null);
}
for (const id of ["", "   ", "not_a_real_id", "qty:abc", "../../etc/passwd", "confirm_order; drop table"]) {
  ok(`«${id}» is rejected, so it can never reach the throwing handler`, !isTypedInteractiveActionId(id));
}

// ── 7. the freshness window is ONE constant, not two ─────────────────────────
// This module and lib/ai/customer-turn.ts must see the SAME basket; two independently
// maintained windows agreed only by coincidence.
ok("typed-actions imports the shared draft-freshness constant",
  /import \{ DRAFT_RESUME_FRESHNESS_MS \} from "@\/lib\/ai\/draft-lifecycle"/.test(typed) &&
  /const DRAFT_FRESHNESS_MS = DRAFT_RESUME_FRESHNESS_MS;/.test(typed));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} demo-interactive-rail: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
