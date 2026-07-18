import { readFileSync } from "node:fs";
import path from "node:path";
import { costUsd, modelFor } from "@/lib/ai/llm/models";
import { emptyDraft, executeTool, type OrderDraft, type ToolContext } from "@/lib/ai/tools";
import { isExplicitHumanRequest } from "@/lib/ai/human-request";
import { replayBranches, replayDeliveryAreas, replayMenuItems, replayModifiers } from "./fixture-brain";
import type { ReplayExpectedItem, ReplayRecord, ReplayTurn } from "./types";

const DEFAULT_CORPUS = "scripts/replay/corpus/seed-v0.jsonl";
const CURRENCY = "ر.س";

type ReplayOutcome = {
  order_created: boolean;
  items: ReplayExpectedItem[];
  allergy_hold: boolean;
  handoff: boolean;
  calls_used: number;
  cost_usd: number;
  send_stubbed: boolean;
  order_create_stubbed: boolean;
};

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function readCorpus(filePath: string): ReplayRecord[] {
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      try {
        return JSON.parse(line) as ReplayRecord;
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        throw new Error(`Invalid replay corpus line ${idx + 1}: ${detail}`);
      }
    });
}

function customerText(turn: ReplayTurn): string | null {
  const role = turn.role ?? turn.sender ?? "customer";
  if (role !== "customer") return null;
  return String(turn.text ?? "").trim();
}

function hasAllergySignal(text: string): boolean {
  return /حساسي|حساسية|يتعب|اتعب|ممنوع|فول سوداني|سوداني|مكسرات|لوز|لبن|حليب|ألبان|البان|جلوتين|غلوتين|بيض|egg|dairy|peanut|nuts|gluten/i.test(text);
}

function hasCancelSignal(text: string): boolean {
  return /الغ[يى]|إلغاء|الغي|كنسل|cancel|امسح الطلب|مش عايز الطلب/i.test(text);
}

function hasDeliverySignal(text: string): boolean {
  return /توصيل|وصل|delivery|ADDRESS_/i.test(text);
}

function hasPickupSignal(text: string): boolean {
  return /استلام|pickup|الفرع/i.test(text);
}

function hasConfirmSignal(text: string): boolean {
  return /أكد|اكد|تأكيد|تاكيد|تمام|خلاص|confirm/i.test(text);
}

function quantityCandidate(text: string): number | null {
  const words: Array<[RegExp, number]> = [
    [/(?:خمسة|خمس)/u, 5],
    [/(?:اربعة|أربعة|اربع|أربع)/u, 4],
    [/(?:تلاتة|ثلاثة|ثلاث)/u, 3],
    [/(?:اتنين|اثنين|إثنين|زوج)/u, 2],
    [/(?:واحد|واحدة|قطعة)/u, 1],
  ];
  for (const [re, n] of words) {
    if (re.test(text)) return n;
  }
  const digit = /(^|[^\p{L}\p{N}_])([1-9])([^\p{L}\p{N}_]|$)/u.exec(text);
  return digit ? Number(digit[2]) : null;
}

function quantityFromText(text: string): number {
  return quantityCandidate(text) ?? 1;
}

function leadingQuantityCandidate(text: string): number | null {
  return quantityCandidate(text.match(/^\s*([^\s،,]+)/u)?.[1] ?? "");
}

function trailingQuantityCandidate(text: string): number | null {
  return quantityCandidate(text.match(/([^\s،,]+)\s*$/u)?.[1] ?? "");
}

const ITEM_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "كيك شوكولاتة", re: /كيك شوكولاتة|كيكة شوكولاتة/u },
  { name: "كوكيز", re: /كوكيز|كوكي/u },
  { name: "قهوة", re: /قهوة|coffee/i },
  { name: "تشيز كيك", re: /تشيز كيك|تشيز/u },
  { name: "براونيز", re: /براونيز|براوني/u },
  { name: "كب كيك", re: /كب كيك|كبكيك/u },
];

function detectItems(text: string): ReplayExpectedItem[] {
  return ITEM_PATTERNS.flatMap((item) => {
    const match = item.re.exec(text);
    if (!match) return [];
    const start = Math.max(0, match.index - 48);
    const end = Math.min(text.length, match.index + match[0].length + 48);
    const after = text.slice(match.index + match[0].length, end);
    const before = text.slice(start, match.index);
    return [{ name: item.name, quantity: leadingQuantityCandidate(after) ?? trailingQuantityCandidate(before) ?? quantityCandidate(before) ?? 1 }];
  });
}

function normalizeItems(items: ReplayExpectedItem[]): ReplayExpectedItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.name, (counts.get(item.name) ?? 0) + Number(item.quantity ?? 0));
  }
  return [...counts.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .filter((item) => item.quantity > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function finalItems(draft: OrderDraft): ReplayExpectedItem[] {
  return normalizeItems(draft.lines.map((line) => ({ name: line.name, quantity: line.quantity })));
}

function makeContext(draft: OrderDraft): ToolContext {
  return {
    menuItems: replayMenuItems,
    modifiers: replayModifiers,
    deliveryAreas: replayDeliveryAreas,
    branches: replayBranches,
    geoRouting: false,
    draft,
    signals: [],
    escalation: null,
    presentation: null,
    photoRequests: [],
    taxMode: "inclusive",
    taxRate: 0,
    paymentConfig: {},
    resendReceipt: false,
    userConfirmed: false,
    explicitHuman: false,
  };
}

function estimateTurnCost(text: string): number {
  const cfg = modelFor("customer_agent");
  const inputTokens = Math.max(20, Math.ceil(text.length / 3));
  const outputTokens = 35;
  return costUsd(cfg, inputTokens, outputTokens, 0, 0);
}

function runConversation(record: ReplayRecord): ReplayOutcome {
  const ctx = makeContext(emptyDraft(CURRENCY));
  let calls = 0;
  let cost = 0;
  let handoff = false;
  let allergyHold = false;
  let orderCreateStubbed = false;

  for (const turn of record.conversation) {
    const text = customerText(turn);
    if (!text) continue;
    calls++;
    cost += estimateTurnCost(text);

    if (hasAllergySignal(text)) {
      allergyHold = true;
      continue;
    }

    if (isExplicitHumanRequest(text)) {
      ctx.explicitHuman = true;
      executeTool("escalate_to_human", { reason: "explicit_human_request" }, ctx);
      handoff = true;
      continue;
    }

    if (hasCancelSignal(text)) {
      executeTool("clear_order", {}, ctx);
      continue;
    }

    if (/خليها\s+(?:واحد|واحدة|1)/u.test(text) && ctx.draft.lines[0]) {
      executeTool("add_to_order", { item_name: ctx.draft.lines[0].name, quantity: 1, mode: "set" }, ctx);
      continue;
    }

    if (/شيل|احذف|remove/i.test(text)) {
      for (const item of detectItems(text)) executeTool("remove_from_order", { item_name: item.name }, ctx);
      continue;
    }

    for (const item of detectItems(text)) {
      executeTool("add_to_order", { item_name: item.name, quantity: item.quantity, mode: "add" }, ctx);
    }

    if (hasDeliverySignal(text)) {
      executeTool("set_fulfillment", { type: "delivery", zone_name: "وسط المدينة" }, ctx);
      if (/ADDRESS_/.test(text)) executeTool("set_delivery_address", { address: "ADDRESS_1" }, ctx);
    } else if (hasPickupSignal(text)) {
      executeTool("set_fulfillment", { type: "pickup" }, ctx);
    }

    if (hasConfirmSignal(text)) {
      if (!ctx.draft.fulfillment) executeTool("set_fulfillment", { type: "pickup" }, ctx);
      ctx.userConfirmed = true;
      executeTool("finalize_draft", {}, ctx);
      ctx.userConfirmed = false;
      if (ctx.draft.finalized) orderCreateStubbed = true;
    }
  }

  return {
    order_created: ctx.draft.finalized === true,
    items: ctx.draft.finalized ? finalItems(ctx.draft) : [],
    allergy_hold: allergyHold,
    handoff,
    calls_used: calls,
    cost_usd: Number(cost.toFixed(8)),
    send_stubbed: true,
    order_create_stubbed: orderCreateStubbed,
  };
}

function sameItems(a: ReplayExpectedItem[], b: ReplayExpectedItem[]): boolean {
  return JSON.stringify(normalizeItems(a)) === JSON.stringify(normalizeItems(b));
}

function outcomeMatches(record: ReplayRecord, outcome: ReplayOutcome): boolean {
  return (
    record.expected.order_created === outcome.order_created &&
    record.expected.allergy_hold === outcome.allergy_hold &&
    record.expected.handoff === outcome.handoff &&
    sameItems(record.expected.items, outcome.items)
  );
}

function printSummary(rows: Array<{ record: ReplayRecord; outcome: ReplayOutcome; match: boolean }>): void {
  console.log("id                         match calls cost_usd   order allergy handoff");
  console.log("-------------------------- ----- ----- ---------- ----- ------- -------");
  for (const row of rows) {
    console.log(
      [
        row.record.id.padEnd(26).slice(0, 26),
        String(row.match ? "PASS" : "FAIL").padEnd(5),
        String(row.outcome.calls_used).padStart(5),
        row.outcome.cost_usd.toFixed(8).padStart(10),
        String(row.outcome.order_created).padEnd(5),
        String(row.outcome.allergy_hold).padEnd(7),
        String(row.outcome.handoff).padEnd(7),
      ].join(" ")
    );
    if (!row.match) {
      console.log(`  expected=${JSON.stringify(row.record.expected)} actual=${JSON.stringify({
        order_created: row.outcome.order_created,
        items: row.outcome.items,
        allergy_hold: row.outcome.allergy_hold,
        handoff: row.outcome.handoff,
      })}`);
    }
  }
  const pass = rows.filter((row) => row.match).length;
  const totalCalls = rows.reduce((sum, row) => sum + row.outcome.calls_used, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.outcome.cost_usd, 0);
  console.log("-------------------------- ----- ----- ---------- ----- ------- -------");
  console.log(`summary pass=${pass}/${rows.length} total_calls=${totalCalls} total_cost_usd=${totalCost.toFixed(8)} dry_run_stubs=whatsapp_send,order_create`);
}

const args = parseArgs(process.argv.slice(2));
const corpusPath = path.resolve(typeof args.corpus === "string" ? args.corpus : DEFAULT_CORPUS);
const records = readCorpus(corpusPath);
const rows = records.map((record) => {
  const outcome = runConversation(record);
  return { record, outcome, match: outcomeMatches(record, outcome) };
});

printSummary(rows);
if (rows.some((row) => !row.match)) process.exit(1);
