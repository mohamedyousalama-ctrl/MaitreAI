// ============================================================================
// R6 proof harness — message authorship attribution (Attribution Law).
// sent_by_member_id = the human who AUTHORED the outbound message. Sites 1 & 2
// (operator reply, operator-sent receipt) stamp it; site 4 (resume → Karim's
// words) and every webhook/agent send stay NULL; sites 3/5 (deliveries) write no
// conversation `messages` row (inapplicable by design). Verified by source
// assertions on the real routes/lib (the column value comes from route-level DB
// writes, which are validated at the DB layer by the migration BEGIN…ROLLBACK).
//
// Run: node --experimental-strip-types scripts/proof-r6-attribution.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// ---- Migration: the column + FK + partial index ----------------------------
const mig = read("supabase/migrations/0061_message_sent_by_member.sql");
check("migration adds messages.sent_by_member_id",
  /add column if not exists sent_by_member_id uuid references public\.members\(id\) on delete set null/.test(mig));
const addColStmt = (mig.match(/add column[^;]*sent_by_member_id[^;]*/i) ?? [""])[0];
check("migration ADD COLUMN is additive/nullable (no NOT NULL, no default)",
  addColStmt.length > 0 && !/not null/i.test(addColStmt) && !/default/i.test(addColStmt));

// ---- Site 1: operator reply (whatsapp/send) STAMPS -------------------------
const send = read("app/api/whatsapp/send/route.ts");
check("(site 1) operator message update stamps sent_by_member_id",
  /\.update\(\{ meta: \{ author_member_id: authorMemberId \}, sent_by_member_id: authorMemberId \}\)/.test(send));
check("(site 1) audits operator_message_sent with resolved member_name",
  send.includes('action: "operator_message_sent"') && send.includes("member_name: names.get(authorMemberId)"));

// ---- Site 2: receipt (send-receipt) STAMPS --------------------------------
const receiptLib = read("lib/messaging/send-receipt.ts");
check("(site 2) receipt timeline insert stamps sent_by_member_id",
  /sent_by_member_id: sentByMemberId/.test(receiptLib));
check("(site 2) sendReceiptToCustomer accepts sentByMemberId",
  /sendReceiptToCustomer\(\s*client: SupabaseClient,\s*orderId: string,\s*sentByMemberId: string \| null = null/.test(receiptLib));
const receiptRoute = read("app/api/orders/[id]/send-receipt/route.ts");
check("(site 2) route resolves member + passes it",
  receiptRoute.includes("sendReceiptToCustomer(supabase, params.id, memberId)"));
check("(site 2) route audits receipt_sent with member_name",
  receiptRoute.includes('action: "receipt_sent"') && receiptRoute.includes("member_name: names.get(memberId)"));

// ---- Site 4: resume (Karim's words) stays NULL -----------------------------
const resume = read("app/api/conversations/[id]/resume/route.ts");
check("(site 4) resume NEVER stamps sent_by_member_id (words are Karim's → null)",
  !resume.includes("sent_by_member_id"));

// ---- Webhook / agent sends stay NULL ---------------------------------------
const respondAndSend = read("lib/messaging/respond-and-send.ts");
check("agent/Karim sends never set sent_by_member_id (null = Karim)",
  !respondAndSend.includes("sent_by_member_id"));
const insertMsg = read("lib/db/conversations.ts");
check("insertMessageDb (generic path) does not set sent_by_member_id",
  !insertMsg.includes("sent_by_member_id"));
const inbound = read("lib/db/messages.ts");
check("inbound persist path does not set sent_by_member_id (customer msgs null)",
  !inbound.includes("sent_by_member_id"));

// ---- Sites 3/5: deliveries write no conversation message (inapplicable) -----
const delivery = read("lib/db/delivery.ts");
check("(sites 3/5) delivery sends write NO messages row (no messages insert around the sends)",
  !/from\("messages"\)\.insert/.test(delivery));

console.log(`\nR6-ATTRIBUTION PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
