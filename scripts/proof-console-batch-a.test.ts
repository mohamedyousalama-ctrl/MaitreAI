// ============================================================================
// WO-CONSOLE-BATCH-A — red-first proof for the testable field-audit fixes.
//   FR-001  friendlyAuthError recognizes the transient magic-link email failure.
//   FR-005  sendFailureMessageKey maps the 24h-window code to its own honest line.
//   FR-010  arrowForDir gives a reading-direction diff arrow (← on RTL).
//   FR-003  (source) the v2 transcript sticks to bottom only when parked near it.
//   FR-008  (source) the already-computed rejected count is rendered.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-console-batch-a.test.ts
// (FR-004 is proven in lib/console-v2/display-state.test.ts — conversationBucket.)
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { friendlyAuthError } from "../lib/auth/friendly-auth-error.ts";
import { sendFailureMessageKey } from "../lib/console-v2/send-failure.ts";
import { arrowForDir } from "../lib/i18n/dir.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// --- FR-001: transient magic-link email failure gets its own honest line --------
check("FR-001: 'Error sending magic link email' → transient retry message",
  friendlyAuthError("Error sending magic link email") === "في مشكلة مؤقتة في إرسال رمز الدخول — جرّب تاني بعد شوية.");
check("FR-001: does NOT fall through to the generic message",
  friendlyAuthError("Error sending magic link email") !== "معرفناش نكمّل، اتأكد من البيانات وجرّب تاني.");
check("FR-001: rate-limit still maps to its own line (unchanged)",
  friendlyAuthError("Email rate limit exceeded").includes("استنى دقيقة"));
check("FR-001: an unknown error still falls back to generic",
  friendlyAuthError("something weird") === "معرفناش نكمّل، اتأكد من البيانات وجرّب تاني.");

// --- FR-005: the 24h window gets its own key, everything else the generic one ----
check("FR-005: outside_24h_window → the specific key", sendFailureMessageKey("outside_24h_window") === "conv.sendError.outside24h");
check("FR-005: send_failed → generic key", sendFailureMessageKey("send_failed") === "conv.sendError");
check("FR-005: missing code → generic key", sendFailureMessageKey(undefined) === "conv.sendError" && sendFailureMessageKey(null) === "conv.sendError");

// --- FR-010: reading-direction diff arrow ---------------------------------------
check("FR-010: RTL diff arrow points ← (toward the 'to' side)", arrowForDir("rtl") === "←");
check("FR-010: LTR diff arrow points →", arrowForDir("ltr") === "→");

// --- FR-005 dictionary: the honest 24h line exists in both locales --------------
const dict = read("lib/i18n/dictionary.ts");
check("FR-005: dictionary carries the honest 24h line (فصحى)", /"conv\.sendError\.outside24h":\s*"مرّ أكثر من ٢٤ ساعة/.test(dict));
check("FR-005: dictionary carries the 24h line in EN too", /"conv\.sendError\.outside24h":\s*"[^"]*24 hours/.test(dict));

// --- FR-005 wiring: the console surfaces the honest message on a failed send -----
const convPage = read("app/(console-v2)/c/(app)/conversations/page.tsx");
check("(FR-005) the send path routes the wire code through sendFailureMessageKey", /sendFailureMessageKey\(/.test(convPage));

// --- FR-004 wiring: the page tallies via the shared bucket (all human = gate) ----
check("(FR-004) the page counts via conversationBucket", /conversationBucket\(/.test(convPage));

// --- FR-003 (source): the v2 transcript sticks to bottom, doesn't yank history ---
check("(FR-003) transcript tracks a stickToBottom ref", /stickToBottom/.test(convPage));
check("(FR-003) transcript has an onScroll handler + a scroll ref", /onScroll=/.test(convPage) && /scrollHeight - .*clientHeight/.test(convPage));

// --- FR-010 (source): no bare hardcoded diff arrow left in the approvals diff ----
const approvals = read("app/(console-v2)/c/(app)/(manager)/approvals/page.tsx");
check("(FR-010) approvals uses arrowForDir for the diff arrow", /arrowForDir\(/.test(approvals));
check("(FR-010) approvals no longer hardcodes the → glyph", !/>→</.test(approvals));

// --- FR-008 (source): the computed rejected count is rendered -------------------
check("(FR-008) approvals now renders counts.rejected (was computed but never shown)", /counts\.rejected/.test(approvals) && /<Num>\{counts\.rejected\}<\/Num>/.test(approvals));

console.log(`\nCONSOLE-BATCH-A PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
