// WO-PROOF-4 — settle the seven C-04 burst shapes named by the auditor.
//
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//     scripts/proof-c04-dispute.test.ts
//
// This is an observational proof. It asserts the behavior current code actually
// exhibits, including loss conditions. A lost disclosure is a passing reproduction
// assertion here, not a weakened safety acceptance criterion.

import { detectAllergenAvoidance } from "../lib/ai/allergen-gate.ts";
import {
  decideAllergySimple,
  detectAllergyRetraction,
} from "../lib/ai/allergy-simple.ts";
import { IMAGE_PLACEHOLDER } from "../lib/messaging/image-turn.ts";
import {
  coalesceInbound,
  type CoalesceRow,
  type CoalescedInbound,
} from "../lib/messaging/inbound-coalescing.ts";
import { respondAndSendWhatsApp } from "../lib/messaging/respond-and-send.ts";
import {
  WESAYA_PRODUCTION_FEATURE_FLAGS,
  wesayaProductionFlags,
  type WesayaProductionFeatureFlags,
} from "./fixtures/wesaya-production-flags.ts";

const PINNED_MAIN = "c38c6b6830ec7a5307bbcbdd1704998e5d4528f5";
const WESAYA_ID = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";
const DISCLOSURE = "عندي حساسية من المكسرات";
const ORDER_TEXT = "وعايز اطلب فراخ وبطاطس";
const T0 = Date.parse("2026-07-24T08:00:00.000Z");
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
    return;
  }
  failed++;
  console.log(`  ❌ ${name}`, detail ?? "");
}

function outcome(
  caseNumber: number,
  verdict: "Disclosure survives" | "Disclosure lost" | "Cannot determine",
  detail: Record<string, unknown>
): void {
  console.log(`  VERDICT ${caseNumber}: ${verdict} — ${JSON.stringify(detail)}`);
}

type FlagKey = keyof WesayaProductionFeatureFlags;

function assertCompleteVector(
  title: string,
  flags: Record<FlagKey, boolean>,
  overrides: Partial<Record<FlagKey, boolean>> = {}
): void {
  const baseKeys = Object.keys(WESAYA_PRODUCTION_FEATURE_FLAGS).sort();
  const caseKeys = Object.keys(flags).sort();
  const unexpected = baseKeys.filter(
    (key) =>
      flags[key as FlagKey] !== WESAYA_PRODUCTION_FEATURE_FLAGS[key as FlagKey] &&
      !(key in overrides)
  );
  check(
    `${title}: complete 34-key Wesaya vector`,
    caseKeys.length === 34 && JSON.stringify(caseKeys) === JSON.stringify(baseKeys),
    { count: caseKeys.length }
  );
  check(`${title}: only named overrides differ`, unexpected.length === 0, {
    unexpected,
  });
}

function customer(
  text: string | null,
  offsetMs: number,
  meta: Record<string, unknown> | null = null
): CoalesceRow {
  return { sender: "customer", text, created_at: at(offsetMs), meta };
}

function assistant(text: string, offsetMs: number): CoalesceRow {
  return { sender: "ai", text, created_at: at(offsetMs), meta: null };
}

function scan(turn: CoalescedInbound | null): boolean {
  return !!turn && detectAllergenAvoidance(turn.mergedText).fired;
}

// ── 1. Coalescing disabled ───────────────────────────────────────────────────
console.log("\nCASE 1 [override: inbound_coalescing=false] — same two-message overlap");
console.log(
  "  PATH: lib/messaging/inbound-coalescing.ts:77-88 selects only the newest row; " +
    "lib/messaging/respond-and-send.ts:1220-1235 also reaches this path when the " +
    "flag is OFF or a watermark read leaves coalescingActive=false."
);
const case1Flags = wesayaProductionFlags({ inbound_coalescing: false });
assertCompleteVector("case 1 [inbound_coalescing=false]", case1Flags, {
  inbound_coalescing: false,
});
const case1Rows = [customer(DISCLOSURE, 0), customer(ORDER_TEXT, 100)];
const case1Overlap = coalesceInbound(case1Rows, {
  enabled: case1Flags.inbound_coalescing,
  watermarkMs: null,
});
const case1Standalone = coalesceInbound([case1Rows[0]], {
  enabled: case1Flags.inbound_coalescing,
  watermarkMs: null,
});
check(
  "case 1 overlap: legacy single-message assembly keeps only message 2",
  case1Overlap?.count === 1 && case1Overlap.mergedText === ORDER_TEXT,
  case1Overlap
);
check(
  "case 1 overlap: earlier disclosure does not reach the detector",
  !scan(case1Overlap)
);
check(
  "case 1 sequential control: a standalone bare disclosure is actionable and fires",
  scan(case1Standalone)
);
outcome(1, "Disclosure lost", {
  assembledTurn: case1Overlap?.mergedText ?? null,
  detectorFired: scan(case1Overlap),
  condition:
    "coalescing inactive and both rows are present before the turn reads recent history",
  survivesWhen:
    "the first webhook reaches assembly before message 2 is persisted",
});

// ── 2. Watermark and flush races ─────────────────────────────────────────────
console.log("\nCASE 2 [production flags] — first turn succeeds, watermark advances, second arrives");
console.log(
  "  PATH: inbound-coalescing.ts:101-110 excludes rows at/below the watermark; " +
    "respond-and-send.ts:1622 runs the detector-bearing turn before :1652-1666 " +
    "advances the watermark; turn-claim.ts:82-108 serializes contenders."
);
const case2Flags = wesayaProductionFlags();
assertCompleteVector("case 2 [production]", case2Flags);
const case2FirstRows = [customer(DISCLOSURE, 0)];
const case2First = coalesceInbound(case2FirstRows, {
  enabled: case2Flags.inbound_coalescing,
  watermarkMs: null,
});
const case2Watermark = case2First?.maxCreatedAtMs ?? null;
const case2Second = coalesceInbound(
  [...case2FirstRows, customer(ORDER_TEXT, 200)],
  {
    enabled: case2Flags.inbound_coalescing,
    watermarkMs: case2Watermark,
  }
);
check("case 2 first assembly contains and scans the disclosure", scan(case2First));
check(
  "case 2 second assembly excludes the already-answered disclosure",
  case2Second?.count === 1 && case2Second.mergedText === ORDER_TEXT,
  case2Second
);
outcome(2, "Disclosure survives", {
  firstTurnDetectorFired: scan(case2First),
  secondTurn: case2Second?.mergedText ?? null,
  condition:
    "watermark advances only after the first detector-bearing turn succeeds",
  failureState:
    "an externally corrupted/premature watermark at or beyond an unscanned disclosure",
});

// ── 3. Batch and window boundaries ───────────────────────────────────────────
console.log("\nCASE 3 [production flags] — disclosure and order text in separate assemblies");
console.log(
  "  PATH: inbound-coalescing.ts:95-108 uses the last AI/human reply as the " +
    "cold-start floor when watermark is null; respond-and-send.ts:1182-1193 limits " +
    "assembly input to the newest 40 rows."
);
const case3Flags = wesayaProductionFlags();
assertCompleteVector("case 3 [production]", case3Flags);
const case3First = coalesceInbound([customer(DISCLOSURE, 0)], {
  enabled: case3Flags.inbound_coalescing,
  watermarkMs: null,
});
const case3Second = coalesceInbound(
  [
    customer(DISCLOSURE, 0),
    assistant("وصلتني الحساسية", 100),
    customer(ORDER_TEXT, 200),
  ],
  { enabled: case3Flags.inbound_coalescing, watermarkMs: null }
);
check("case 3 first batch gives the disclosure its own detector turn", scan(case3First));
check(
  "case 3 next batch starts after the intervening reply",
  case3Second?.count === 1 && case3Second.mergedText === ORDER_TEXT,
  case3Second
);
outcome(3, "Disclosure survives", {
  firstAssembly: case3First?.mergedText ?? null,
  detectorFired: scan(case3First),
  nextAssembly: case3Second?.mergedText ?? null,
  condition: "the first assembly runs before the intervening reply closes that batch",
  failureState:
    "the disclosure is never processed before a later reply/watermark closes it, or it falls outside the newest-40-row read",
});

// ── 4. Out-of-order arrival ──────────────────────────────────────────────────
console.log("\nCASE 4 [production flags] — ordering text stored first, disclosure stored later");
console.log(
  "  PATH: inbound-coalescing.ts:91-110 admits every customer row whose DB " +
    "created_at is strictly newer than the watermark; db/messages.ts:91-142 does " +
    "not copy the provider timestamp into created_at, so a later insert gets DB arrival time."
);
const case4Flags = wesayaProductionFlags();
assertCompleteVector("case 4 [production]", case4Flags);
const case4Order = customer(ORDER_TEXT, 0);
const case4First = coalesceInbound([case4Order], {
  enabled: case4Flags.inbound_coalescing,
  watermarkMs: null,
});
const case4LateDisclosure = customer(DISCLOSURE, 200);
const case4Second = coalesceInbound([case4Order, case4LateDisclosure], {
  enabled: case4Flags.inbound_coalescing,
  watermarkMs: case4First?.maxCreatedAtMs ?? null,
});
check("case 4 first turn contains only the ordering text", !scan(case4First));
check(
  "case 4 later-arriving disclosure is newer than the watermark and scans",
  case4Second?.mergedText === DISCLOSURE && scan(case4Second),
  case4Second
);
outcome(4, "Disclosure survives", {
  secondAssembly: case4Second?.mergedText ?? null,
  detectorFired: scan(case4Second),
  condition: "later persistence gives the disclosure created_at > watermark",
  failureState:
    "the disclosure row already existed at/below the answered watermark or is outside the newest-40-row read",
});

// ── 5. Media / text:null alongside disclosure ────────────────────────────────
console.log("\nCASE 5 [production flags] — null/no-caption image event alongside disclosure");
console.log(
  "  PATH: inbound-coalescing.ts:112-116 filters only empty text while independently " +
    "retaining imageRow; webhook/route.ts:594-600 persists a real no-caption image as 📷."
);
const case5Flags = wesayaProductionFlags();
assertCompleteVector("case 5 [production]", case5Flags);
const nullImage = customer(null, 100, {
  image: { id: "media-null", caption: null, description: null },
});
const case5NullTurn = coalesceInbound(
  [customer(DISCLOSURE, 0), nullImage],
  { enabled: case5Flags.inbound_coalescing, watermarkMs: null }
);
const case5RealImageTurn = coalesceInbound(
  [
    customer(IMAGE_PLACEHOLDER, 0, {
      image: { id: "media-placeholder", description: null },
    }),
    customer(DISCLOSURE, 100),
  ],
  { enabled: case5Flags.inbound_coalescing, watermarkMs: null }
);
check(
  "case 5 text:null is omitted without removing the disclosure",
  case5NullTurn?.mergedText === DISCLOSURE && scan(case5NullTurn),
  case5NullTurn
);
check(
  "case 5 null image metadata is still retained separately",
  case5NullTurn?.imageRow === nullImage
);
check(
  "case 5 real 📷 placeholder plus disclosure still scans",
  !!case5RealImageTurn &&
    case5RealImageTurn.mergedText.includes(IMAGE_PLACEHOLDER) &&
    scan(case5RealImageTurn),
  case5RealImageTurn
);
outcome(5, "Disclosure survives", {
  nullEventAssembly: case5NullTurn?.mergedText ?? null,
  placeholderAssembly: case5RealImageTurn?.mergedText ?? null,
  detectorFired: scan(case5NullTurn) && scan(case5RealImageTurn),
  failureState:
    "the disclosure itself is empty/null or is excluded by the watermark/history floor",
});

// ── 6. Semantic interference from a later fragment ───────────────────────────
console.log("\nCASE 6 [production flags] — disclosure followed by «لأ خلاص مش مهم»");
console.log(
  "  PATH: inbound-coalescing.ts:113 newline-joins both fragments; customer-turn.ts:" +
    "973-996 runs detectAllergenAvoidance on the merged userMessage; allergy-simple.ts:" +
    "142-146 applies the later retraction layer."
);
const case6Flags = wesayaProductionFlags();
assertCompleteVector("case 6 [production]", case6Flags);
const case6Turn = coalesceInbound(
  [customer(DISCLOSURE, 0), customer("لأ خلاص مش مهم", 100)],
  { enabled: case6Flags.inbound_coalescing, watermarkMs: null }
);
const case6Merged = case6Turn?.mergedText ?? "";
const case6Hit = detectAllergenAvoidance(case6Merged);
const case6Retracted = detectAllergyRetraction(case6Merged);
const case6Simple = decideAllergySimple({
  history: [],
  userMessage: case6Merged,
});
check("case 6 merged text still fires the base detector", case6Hit.fired);
check(
  "case 6 exact later fragment is not classified as an allergy retraction",
  !case6Retracted
);
check(
  "case 6 production allergy_simple decision is deflect",
  case6Simple.action === "deflect",
  case6Simple
);
outcome(6, "Disclosure survives", {
  assembledTurn: case6Merged,
  detectorFired: case6Hit.fired,
  detectorTerm: case6Hit.term,
  retractionDetected: case6Retracted,
  allergySimpleAction: case6Simple.action,
  policyJudgment: "not made by this proof",
});

// ── 7. Ownership changes during assembly ─────────────────────────────────────
console.log("\nCASE 7 [production flags] — HUMAN_ACTIVE before the two-row assembly");
console.log(
  "  PATH: respond-and-send.ts:854-862 reads owner, :901 enters the human branch, " +
    ":970-972 disables the safety bridge under allergy_simple, and :1037-1039 " +
    "returns before the history/coalescing read at :1182-1235. This intersects C-02."
);
const case7Flags = wesayaProductionFlags();
assertCompleteVector("case 7 [production]", case7Flags);

type DbCall = {
  table: string;
  op: "query" | "select" | "insert" | "update";
  select: string | null;
  payload?: unknown;
};

function makeHumanOwnedAdmin(rowsNewestFirst: CoalesceRow[]) {
  const calls: DbCall[] = [];
  const from = (table: string) => {
    const call: DbCall = { table, op: "query", select: null };
    const builder: Record<string, unknown> = {};
    const remember = (op: DbCall["op"], payload?: unknown) => {
      call.op = op;
      call.payload = payload;
      if (!calls.includes(call)) calls.push(call);
    };
    builder.select = (cols?: string) => {
      if (call.op === "query") call.op = "select";
      call.select = cols ?? "*";
      if (!calls.includes(call)) calls.push(call);
      return builder;
    };
    builder.insert = (payload: unknown) => {
      remember("insert", payload);
      return builder;
    };
    builder.update = (payload: unknown) => {
      remember("update", payload);
      return builder;
    };
    for (const method of [
      "eq",
      "neq",
      "is",
      "not",
      "gt",
      "gte",
      "lt",
      "lte",
      "order",
      "limit",
      "in",
      "contains",
      "or",
    ]) {
      builder[method] = () => builder;
    }
    const result = () => {
      if (table === "conversations" && call.op === "select") {
        if ((call.select ?? "").includes("customers(phone)")) {
          return {
            data: {
              id: "conversation-c04-case7",
              owner: "human",
              channel: "whatsapp",
              customer_id: "customer-c04-case7",
              escalation_reason: null,
              updated_at: new Date().toISOString(),
              ownership_state: "HUMAN_ACTIVE",
              is_safety_hold: false,
              control_epoch: 9,
              customers: { phone: "201000000000" },
            },
            error: null,
          };
        }
        if ((call.select ?? "").includes("ownership_state, updated_at")) {
          return {
            data: {
              ownership_state: "HUMAN_ACTIVE",
              updated_at: new Date().toISOString(),
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }
      if (table === "orders" && call.op === "select") {
        return { data: null, error: null };
      }
      if (table === "restaurants" && call.op === "select") {
        return {
          data: {
            feature_flags: case7Flags,
            dialect: "egyptian",
            name: "وصاية",
          },
          error: null,
        };
      }
      if (table === "messages" && call.op === "select") {
        if ((call.select ?? "").includes("sender, text, meta, created_at")) {
          return { data: rowsNewestFirst, error: null };
        }
        return { data: [], error: null };
      }
      if (call.op === "insert" || call.op === "update") {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    };
    builder.maybeSingle = async () => result();
    builder.single = async () => result();
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result()).then(resolve, reject);
    return builder;
  };
  return {
    client: {
      from,
      rpc: async () => ({ data: null, error: null }),
    },
    calls,
  };
}

const case7RowsChronological = [
  customer(DISCLOSURE, 0),
  customer(ORDER_TEXT, 100),
];
const case7Admin = makeHumanOwnedAdmin(
  [...case7RowsChronological].reverse()
);
const case7Result = await respondAndSendWhatsApp(
  case7Admin.client as never,
  WESAYA_ID,
  "conversation-c04-case7"
);
const case7AssemblyRead = case7Admin.calls.some(
  (call) =>
    call.table === "messages" &&
    call.op === "select" &&
    call.select === "sender,text,created_at,meta"
);
const case7IfResumed = coalesceInbound(case7RowsChronological, {
  enabled: case7Flags.inbound_coalescing,
  watermarkMs: null,
});
check(
  "case 7 HUMAN_ACTIVE returns skipped_takeover",
  case7Result.status === "skipped_takeover",
  case7Result
);
check(
  "case 7 ownership return occurs before the coalescing history read",
  !case7AssemblyRead,
  case7Admin.calls
);
check(
  "case 7 control: if a later AI turn is triggered, the pending rows still assemble and scan",
  scan(case7IfResumed)
);
outcome(7, "Disclosure lost", {
  status: case7Result.status,
  detectorPathReached: case7AssemblyRead,
  condition:
    "owner is HUMAN_ACTIVE when respondAndSendWhatsApp reads the conversation; production allergy_simple disables the takeover safety bridge",
  recoveryState:
    "rows remain pending and would scan if a later AI-owned turn is explicitly triggered",
  classification: "C-02 intersection, not a coalescing-core loss",
});

console.log(
  `\nWO-PROOF-4 @ ${PINNED_MAIN.slice(0, 7)}: ${passed}/${passed + failed} observational assertions passed.`
);
console.log(
  "RECOMMENDATION: keep C-04 only as the narrowed coalescing-inactive/degraded-overlap shape; " +
    "track HUMAN_ACTIVE loss under C-02."
);
if (failed > 0) process.exitCode = 1;
