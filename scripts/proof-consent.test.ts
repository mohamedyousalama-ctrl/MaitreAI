// ============================================================================
// WO-PDPL-CONSENT proof harness — the pure consent enforcement + capture logic.
// Covers: source/kind validation, canSendMarketing / canPersistHealthNotes strict
// semantics, gateHealthNotesForMemory (drops health without consent), and the
// conservative conversational detector (grant/deny/null, deny precedence).
//
// The VITAL-INTEREST invariant is asserted structurally: these helpers only ever
// gate MARKETING and long-term MEMORY storage — none of them is the allergen
// safety gate, so a customer with all consents false is still fully protected in
// conversation (the deterministic hold lives elsewhere and never reads consent).
//
// Run: node --experimental-strip-types scripts/proof-consent.test.ts
// ============================================================================

import {
  isValidConsentSource, isValidConsentKind,
  canSendMarketing, canPersistHealthNotes, gateHealthNotesForMemory,
  detectMarketingConsentReply,
} from "../lib/privacy/consent.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } }

// ---- source / kind validation ----------------------------------------------
for (const s of ["conversation", "operator", "import"]) check(`source '${s}' valid`, isValidConsentSource(s));
for (const s of ["sms", "", null, undefined, 3]) check(`source '${String(s)}' invalid`, !isValidConsentSource(s));
for (const k of ["marketing", "health_notes"]) check(`kind '${k}' valid`, isValidConsentKind(k));
for (const k of ["health", "", null]) check(`kind '${String(k)}' invalid`, !isValidConsentKind(k));

// ---- marketing consent (strict true) ---------------------------------------
check("canSendMarketing true iff consent_marketing===true",
  canSendMarketing({ consent_marketing: true }) === true);
for (const v of [false, null, undefined]) check(`canSendMarketing(${String(v)}) === false`,
  canSendMarketing({ consent_marketing: v as boolean }) === false);
check("canSendMarketing(null customer) === false", canSendMarketing(null) === false);

// ---- health-notes consent (strict true) ------------------------------------
check("canPersistHealthNotes true iff consent_health_notes===true",
  canPersistHealthNotes({ consent_health_notes: true }) === true);
for (const v of [false, null, undefined]) check(`canPersistHealthNotes(${String(v)}) === false`,
  canPersistHealthNotes({ consent_health_notes: v as boolean }) === false);

// ---- memory gate: drops health without consent -----------------------------
check("gateHealthNotesForMemory: WITHOUT consent → [] (dropped)",
  JSON.stringify(gateHealthNotesForMemory(["nut allergy", "lactose"], { consent_health_notes: false })) === "[]");
check("gateHealthNotesForMemory: no customer → [] (dropped)",
  JSON.stringify(gateHealthNotesForMemory(["nut allergy"], null)) === "[]");
check("gateHealthNotesForMemory: WITH consent → notes pass through",
  JSON.stringify(gateHealthNotesForMemory(["nut allergy"], { consent_health_notes: true })) === JSON.stringify(["nut allergy"]));
check("gateHealthNotesForMemory: WITH consent, empty/undef notes → []",
  JSON.stringify(gateHealthNotesForMemory(undefined, { consent_health_notes: true })) === "[]");

// ---- conversational detector (conservative; deny precedence) ----------------
check("explicit Arabic grant → 'grant'", detectMarketingConsentReply("نعم أرغب باستقبال العروض") === "grant");
check("أوافق → 'grant'", detectMarketingConsentReply("أوافق على استقبال الرسائل") === "grant");
check("english opt-in → 'grant'", detectMarketingConsentReply("Yes, opt me in to offers") === "grant");
check("Arabic deny → 'deny'", detectMarketingConsentReply("لا أريد العروض") === "deny");
check("unsubscribe → 'deny'", detectMarketingConsentReply("please unsubscribe me from marketing") === "deny");
check("أوقف العروض → 'deny'", detectMarketingConsentReply("أوقف العروض من فضلك") === "deny");
check("deny precedence in a mixed message", detectMarketingConsentReply("نعم بس أوقف العروض") === "deny");
check("unrelated 'yes' (no marketing token) → null (no false grant)",
  detectMarketingConsentReply("نعم أبغى أطلب كبسة") === null);
check("empty → null", detectMarketingConsentReply("") === null);
check("plain 'شكراً' → null", detectMarketingConsentReply("شكراً") === null);

console.log(`\nPDPL-CONSENT PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
