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
import {
  isTypedInteractiveActionId,
  interactiveCommandFromId,
  handleTypedInteractiveAction,
  handleTypedQuantityFill,
  safetyProbeFired,
} from "../lib/messaging/typed-actions.ts";
import { DEMO_RESTAURANT_ID } from "../lib/demo/config.ts";

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

// ── 6b. THE TYPED QUANTITY RAIL ──────────────────────────────────────────────
// The tap rail resolves «qty:2». This is the same rail for a customer who TYPES the
// answer — «وحده بس», «حبتين», «٣ حبات» — which is what a customer actually does. The
// deterministic parser existed and was fixed for exactly those words, and was reachable
// only from WhatsApp: on the demo the most natural reply to our own «كم حبة تبي؟» went to
// the model and hoped.
ok("the demo route calls the typed quantity rail", /await handleTypedQuantityFill\(admin, \{/.test(route));
ok("…only when NO interactive id was sent (a tap was already handled)",
  /if \(conversationId && !rawInteractiveId\) \{/.test(route));
ok("…and after the tap rail, so a tap is never double-handled",
  route.indexOf("handleTypedInteractiveAction") < route.indexOf("handleTypedQuantityFill(admin"));
ok("its reply is formatted for the tenant like every other customer-visible string",
  /reply: formatCustomerVisibleText\(filled\.reply, filled\.dialect\)/.test(route));
ok("a rail failure falls through to the model rather than losing the turn",
  /typed quantity fill failed; falling through to the model/.test(route));
ok("the demo seed enables typed_quantity_fill, which is why the route need not re-read it",
  /typed_quantity_fill: true/.test(read("scripts/seed-demo-ksa-tenant.mjs")));

// ── 6c. SAFETY FIRST — the probe now GATES, it does not merely get recorded ───
// It was computed by the caller, passed in, and written to `meta` while gating nothing. A
// deterministic quantity shortcut skips the whole customer-turn pipeline, allergen gate
// included. parseBareQuantityAnswer is strict enough that such a turn rarely parses — but
// "rarely" is not a safety property. The gate lives in the shared handler, so the WhatsApp
// path gets it too.
ok("handleTypedQuantityFill refuses on ANY safety signal",
  /if \(safetyProbeFired\(args\.safetyProbe\)\) \{[\s\S]{0,120}reason: "safety_signal"/.test(typed));
// A TAP and free TEXT are independent fields on a public endpoint, so one request can
// carry «set_pickup» and «عندي حساسية وصار عندي ضيق تنفس» together. The tap rail returns
// early with no model call, skipping runCustomerTurn and its allergen gate — so the probe
// must gate the TAP too, not only the typed quantity. WhatsApp does the same
// (respond-and-send's burstSafetyTakesPriority).
ok("ONE probe is computed and it gates the TAP rail as well",
  /const safetyFired = safetyProbeFired\(safetyProbe\);/.test(route) &&
  /if \(conversationId && rawInteractiveId && !safetyFired && isTypedInteractiveActionId/.test(route));
ok("…and the route no longer passes an empty probe to anything", !/safetyProbe: \{\}/.test(route));
// Our own interactive ids carry database UUIDs (menu_items.id and menu_categories.id are
// both `uuid` columns), so free text in an «item:»/«cat:» payload is never legitimate — it
// used to reach messages.meta verbatim from a public endpoint.
ok("«item:»/«cat:» payloads must be UUIDs",
  /if \(isUuid\(itemId\)\)/.test(typed) && /if \(isUuid\(categoryIdOrName\)\)/.test(typed));
ok("…and a non-UUID payload is not a typed action at all",
  !isTypedInteractiveActionId("item:<script>alert(1)</script>") &&
  !isTypedInteractiveActionId("cat:../../etc/passwd") &&
  isTypedInteractiveActionId("item:11111111-1111-4111-8111-111111111111"));
ok("…before it even parses a quantity",
  typed.indexOf('reason: "safety_signal"') < typed.indexOf("const qty = quantityFromInteractiveId"));
// THREE, not four. The phonetic near-miss net is gone by Founder ruling — see
// lib/ai/phonetic-safety-net.ts. What still matters, and is still asserted, is that the demo
// runs the SAME set as the WhatsApp path: a demo that gates on fewer detectors than
// production is a demo that demonstrates something the product does not do.
ok("the demo computes the same detectors the WhatsApp path does",
  /allergenAvoidance: detectAllergenAvoidance\(text\)\.fired/.test(route) &&
  /allergenSymptom: detectAllergenSymptom\(text\)\.fired/.test(route) &&
  /allergenEmergency: detectAllergenEmergency\(text\)\.fired/.test(route));
ok("…and neither path guesses at near-misses any more",
  !/detectPhoneticSafetyNet\(/.test(route));

// ── 7. the freshness window is ONE constant, not two ─────────────────────────
// This module and lib/ai/customer-turn.ts must see the SAME basket; two independently
// maintained windows agreed only by coincidence.
ok("typed-actions imports the shared draft-freshness constant",
  /import \{ DRAFT_RESUME_FRESHNESS_MS \} from "@\/lib\/ai\/draft-lifecycle"/.test(typed) &&
  /const DRAFT_FRESHNESS_MS = DRAFT_RESUME_FRESHNESS_MS;/.test(typed));

// ── 8. BEHAVIOUR, not prose ──────────────────────────────────────────────────
// Every assertion above is a regex over source text. Adversarial review made the point
// concretely: a behaviour-PRESERVING refactor of the safety gate turned this file red,
// while the tap rail's total absence of a gate — a request carrying «qty:2» plus
// «عندي حساسية ... ضيق تنفس» skipping the entire allergen pipeline — was invisible to it.
// A raw-source regex measures the prose, not the code. These drive the real handlers.
{
  type Row = Record<string, unknown>;
  type Filter = { col: string; val: unknown };
  // NOTE: no constructor parameter properties — `node --experimental-strip-types` only
  // ERASES types, it does not generate the assignments those imply.
  class Q implements PromiseLike<{ data: unknown; error: unknown }> {
    filters: Filter[] = [];
    wantSingle = false;   // NOT `single`: a field of that name shadows the single() method
    limitN: number | null = null;
    db: DB;
    table: string;
    op: string;
    payload: unknown;
    constructor(db: DB, table: string, op: string, payload: unknown = null) {
      this.db = db; this.table = table; this.op = op; this.payload = payload;
    }
    eq(col: string, val: unknown) { this.filters.push({ col, val }); return this; }
    not() { return this; }
    in() { return this; }
    order() { return this; }
    select() { return this; }
    limit(n: number) { this.limitN = n; return this; }
    maybeSingle() { this.wantSingle = true; return this; }
    single() { this.wantSingle = true; return this; }
    then<R1 = { data: unknown; error: unknown }, R2 = never>(
      res?: ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>) | null,
      rej?: ((r: unknown) => R2 | PromiseLike<R2>) | null
    ): PromiseLike<R1 | R2> {
      this.db.calls.push({ table: this.table, op: this.op, payload: this.payload });
      let data: unknown = null;
      if (this.op === "select") {
        let rows = (this.db.tables[this.table] ?? []).filter((r) => this.filters.every((f) => r[f.col] === f.val));
        if (this.limitN != null) rows = rows.slice(0, this.limitN);
        data = this.wantSingle ? (rows[0] ?? null) : rows;
      } else if (this.op === "insert") {
        const row = { id: `row-${this.db.seq++}`, ...(this.payload as Row) };
        (this.db.tables[this.table] ??= []).push(row);
        data = this.wantSingle ? row : [row];
      }
      return Promise.resolve(res ? res({ data, error: null }) : ({ data, error: null } as unknown as R1));
    }
  }
  class DB {
    tables: Record<string, Row[]> = {};
    calls: Array<{ table: string; op: string; payload: unknown }> = [];
    seq = 1;
    constructor(seed: Record<string, Row[]>) { this.tables = seed; }
    from(table: string) {
      return {
        select: () => new Q(this, table, "select").select(),
        insert: (p: unknown) => new Q(this, table, "insert", p),
        update: (p: unknown) => new Q(this, table, "update", p),
        upsert: (p: unknown) => new Q(this, table, "upsert", p),
        delete: () => new Q(this, table, "delete"),
      };
    }
    async rpc() { return { data: null, error: null }; }
    writes() { return this.calls.filter((c) => c.op !== "select"); }
  }
  const CONV = "11111111-2222-4333-8444-555555555555";
  const seed = () => new DB({
    restaurants: [{
      id: DEMO_RESTAURANT_ID, dialect: "saudi", currency: "ر.س", tax_mode: "added", tax_rate: 15,
      payment_config: null, feature_flags: { typed_quantity_fill: true, typed_interactive_actions: true },
    }],
    conversations: [{ id: CONV, restaurant_id: DEMO_RESTAURANT_ID }],
    messages: [], menu_items: [], menu_categories: [], modifiers: [], menu_item_modifiers: [],
    branches: [], delivery_zones: [], policies: [], faqs: [], promotions: [], conversation_signals: [],
  });
  const CLEAR = { allergenAvoidance: false, allergenSymptom: false, allergenEmergency: false };
  const args = (over: Record<string, unknown> = {}) => ({
    restaurantId: DEMO_RESTAURANT_ID, conversationId: CONV,
    features: null, safetyProbe: CLEAR, demoRun: true, ...over,
  });

  // A confirm TAP performs no writes of its own — it canonicalises and hands the turn on.
  {
    const db = seed();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await handleTypedInteractiveAction(db as any, args({ interactiveId: "confirm_order" }) as never);
    ok("(behaviour) a confirm tap returns confirm_gate and writes nothing",
      r.kind === "confirm_gate" && db.writes().length === 0);
  }

  // THE HOLE REVIEW FOUND: a safety signal must beat a tap. The route gates this, so drive
  // the route's own predicate rather than asserting its source shape.
  ok("(behaviour) safetyProbeFired is true when ANY single detector fires",
    safetyProbeFired({ ...CLEAR, allergenEmergency: true }) &&
    safetyProbeFired({ ...CLEAR, allergenAvoidance: true }) &&
    safetyProbeFired({ ...CLEAR, allergenSymptom: true }));
  ok("(behaviour) …and false only when all of them are clear", !safetyProbeFired(CLEAR));

  // The quantity rail refuses a safety turn BEFORE touching the database.
  {
    const db = seed();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await handleTypedQuantityFill(db as any, args({
      userMessage: "وحده بس", interactiveId: null,
      safetyProbe: { ...CLEAR, allergenEmergency: true },
    }) as never);
    ok("(behaviour) a safety signal short-circuits the quantity rail with ZERO db calls",
      r.kind === "pass_through" && r.reason === "safety_signal" && db.calls.length === 0);
  }

  // …and the kill switch does the same, from inside the handler.
  {
    const db = seed();
    db.tables.restaurants[0]!.feature_flags = { typed_quantity_fill: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await handleTypedQuantityFill(db as any, args({ userMessage: "وحده بس", interactiveId: null }) as never);
    ok("(behaviour) typed_quantity_fill=false stops the rail on BOTH surfaces",
      r.kind === "pass_through" && r.reason === "flag_off" && db.writes().length === 0);
  }

  // No pending quantity question → pass through, and still no writes.
  {
    const db = seed();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await handleTypedQuantityFill(db as any, args({ userMessage: "وحده بس", interactiveId: null }) as never);
    ok("(behaviour) no pending question → pass_through, no writes",
      r.kind === "pass_through" && db.writes().length === 0);
  }
}

// ── THE SPOKEN PATH GETS THE SAME RAIL ──────────────────────────────────────
// The typed route resolved «وحده بس» deterministically and the VOICE route did not, so the
// single most natural SPOKEN answer to our own "how many?" was the one answer that went to
// the model. A demo whose typed path is deterministic and whose spoken path is not is two
// products, and only one of them was tested.
{
  const strip = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")
    .split("\n")
    .filter((l) => { const t = l.trimStart(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");
  const voice = strip("app/api/demo/voice/route.ts");

  ok("the voice route runs the quantity rail on the transcript",
    /handleTypedQuantityFill\(/.test(voice) && /userMessage: transcript/.test(voice));
  ok("the rail is GATED by the safety probe, not merely handed one",
    /if \(conversationId && !safetyProbeFired\(voiceSafetyProbe\)\)/.test(voice));
  ok("the probe is passed into the handler as well as gating the rail",
    /safetyProbe: voiceSafetyProbe/.test(voice));
  // The phonetic net used to run here with the REAL stt confidence, because it existed for
  // low-confidence audio. It is gone by Founder ruling, so the confidence has no consumer on
  // this probe — asserted as its absence, so re-adding it fails here too.
  ok("the voice probe no longer runs the near-miss net",
    !/detectPhoneticSafetyNet\(/.test(voice));
  ok("the exact detectors all run on the transcript",
    /detectAllergenAvoidance\(transcript\)/.test(voice) &&
    /detectAllergenSymptom\(transcript\)/.test(voice) &&
    /detectAllergenEmergency\(transcript\)/.test(voice));
  // A deterministic fill IS SPOKEN, and its clearance has three parts — this assertion used
  // to require silence, on the grounds that "a deterministic fill is not a model turn, so it
  // has no stopReason to classify, and this route must never synthesize a reply the safety
  // classifier has not cleared." The premise was right and the conclusion was not: silence
  // ended the call on «كم قطعة تحب؟» → «خمسة», the most common spoken turn in the demo,
  // telling a restaurant owner «الصوت مو شغّال» at the moment the product was working.
  //
  // What replaced the stopReason is stricter, not weaker:
  //   1. the safety probe gates the branch (all four detectors, real stt confidence);
  //   2. voiceHardZeroReason still scans the reply for money / link / receipt;
  //   3. the conversation's PERSISTED is_safety_hold is folded in, so a calm-hold opened on
  //      an EARLIER turn still silences this one — the probe cannot see previous turns.
  // BY WHICHEVER DELIVERY THE CHANNEL USES. On a call the reply is now STREAMED — the
  // player fetches a signed URL and plays it while the provider is still speaking, which is
  // where 1.8-5.5 measured seconds of dead air went — and everywhere else it is still
  // buffered inline. This rail must not be the exit that keeps the old wait: it answers
  // «كم قطعة تحب؟» → «خمسة», the most common spoken turn in the demo, so it is exactly the
  // turn that needs to feel immediate.
  ok("a deterministic fill is synthesized, not skipped",
    /const filledSpoken =\s*\n?\s*callDelivery\(/.test(voice));
  ok("…streamed on a call, and buffered on a chat voice note",
    /\?\s*demoVoiceTicket\(filledText,/.test(voice) &&
    /:\s*await demoVoiceReply\(filledText, filledSpeakOpts\)/.test(voice));
  ok("…and it always reports WHY it was silent, so the loop cannot read it as a failure",
    /replyAudioSilence: demoVoiceSilenceKind\(filledSpoken\.skipped\)/.test(voice));
  ok("…and a safety hold from an EARLIER turn still silences it",
    /safetyHold: heldFromEarlierTurn/.test(voice) && /select\("is_safety_hold"\)/.test(voice));
  ok("…and an unreadable hold flag fails CLOSED, never open",
    /convErr \? true :/.test(voice));
  ok("demoRun still holds on the spoken rail", /userMessage: transcript[\s\S]{0,300}demoRun: true/.test(voice));
  // The TAP rail is deliberately absent: a voice note carries no interactive id.
  ok("the tap rail is NOT mirrored onto voice (there is nothing to resolve)",
    !/handleTypedInteractiveAction\(/.test(voice));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} demo-interactive-rail: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
