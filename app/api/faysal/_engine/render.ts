// ============================================================================
// فيصل / Faysal — THE RENDERER.
//
// Four rules in this repo are RENDERER rules, not model instructions, and they
// are all here for the same stated reason: "a disclaimer a model can forget is
// not a disclaimer" (SPEC-1 Rule DEMO-1, binding detail 2).
//
//   FRI-1    every reply containing a Friday date ends with the branch phone
//   PRICE-1  no bare number ever leaves the agent — every figure carries the label
//   DEMO-1c  every confirmation block carries «حجز تجريبي — غير مسجّل لدى الفرع.»
//   §3.4     Western digits, currency after the amount, no `**bold**`
//
// FRI-1 and PRICE-1 are implemented as POST-PASSES over the composed message
// rather than as call sites that must remember. A post-pass cannot be forgotten
// by a new scene; a call site can, and SPEC-2 §9's own showpiece transcript
// shipped without the FRI-1 phone number for exactly that reason (audit S4).
//
// DEMO-1(c) is deliberately NOT a post-pass: it is baked into the two confirmation
// templates in `strings.ts`, so there is no branch of the code that can emit a
// confirmation without it. `assertConfirmationDisclosed()` below is the belt to
// that braces — it throws rather than shipping a confirmation without the line.
//
// THE RAIL IS EXEMPT from every pass except digit normalization. SPEC-1 Rule
// DEMO-1 detail 5: "nothing is prepended or appended to it." A demo disclaimer
// inside an ambulance instruction is the corrupted composite `reply-compose.ts`
// exists to prevent.
// ============================================================================

import { formatCustomerVisibleText } from "@/lib/util/customer-visible-format";
import { DEMO_1_C, friday1Suffix } from "./strings";
import { PRICE_LABEL_AR } from "../_domain";

/** SPEC-2 §3.4 — the Saudi profile declares `digitStyle: "western"`, both ways. */
export function normalizeOutbound(text: string): string {
  return formatCustomerVisibleText(text, "saudi");
}

const FRIDAY_MARKER = /(?:^|[^ء-ي])(?:ال)?جمعة/;
const PHONE_MARKER = /\d{3}\s?\d{3}\s?\d{4}|\d{9,10}/;

/**
 * Rule FRI-1 — "EVERY Friday reply from Faysal — booking, enquiry or directions —
 * ends with the branch's phone number and an offer to confirm. No exceptions,
 * including at sites whose Friday confidence is `medium`."
 *
 * SPEC-1 §14 criterion 8 asserts it mechanically: every reply containing a Friday
 * date contains a branch phone number. So this appends when — and only when — the
 * message names Friday and does not already carry a number.
 */
export function applyFriday1(text: string, branchPhone: string | null): string {
  if (!branchPhone) return text;
  if (!FRIDAY_MARKER.test(text)) return text;
  if (PHONE_MARKER.test(text)) return text;
  return `${text}\n${friday1Suffix(branchPhone)}`;
}

const CURRENCY_MARKER = /\d[\d,.]*\s*ر\.س/;

/**
 * Rule PRICE-1 — "no bare number ever leaves the agent. Every quoted figure is
 * rendered with the price label," in SPEC-2 §5.2's wording, as a frozen suffix
 * emitted by the renderer and never composed by the model.
 *
 * The label is «هذا سعر استرشادي، والمعتمد من الاستقبال.» — it does NOT say
 * «العرض التجريبي», because that is Faysal describing himself as a software demo
 * and §8.1 #16 `machine_jargon` bans it. The demo framing is Rule DEMO-1's job,
 * in the system voice, where it belongs.
 */
export function applyPrice1(text: string): string {
  if (!CURRENCY_MARKER.test(text)) return text;
  if (text.includes(PRICE_LABEL_AR)) return text;
  return `${text}\n${PRICE_LABEL_AR}`;
}

/**
 * Rule PKG-1 — an unstated expiry on a 6,000 SAR package is a complaint waiting to
 * happen, so the TERMS travel with the figure. They come from the catalogue row
 * itself (`CatalogueService.termsAr`), never from a constant in this file: a
 * second copy of a package's terms is a second thing to forget to update.
 */
export function applyPackageTerms(text: string, quotedPackage: boolean, termsAr: string | null | undefined): string {
  if (!quotedPackage || !termsAr || text.includes(termsAr)) return text;
  return `${text}\n${termsAr}`;
}

/**
 * Rule DEMO-1(c), binding detail 1: "There is no branch of the code that emits a
 * confirmation without it." This is the assertion that makes that sentence true
 * rather than aspirational — a confirmation missing the line does not ship, it
 * throws, and the route degrades to the honest-unknown path.
 */
export function assertConfirmationDisclosed(text: string): string {
  if (!text.includes(DEMO_1_C)) {
    throw new Error("[faysal] Rule DEMO-1(c) violated: a confirmation block was composed without the demo marker.");
  }
  return text;
}

export interface ComposeOpts {
  /** The branch phone for Rule FRI-1. Null when no branch is in play. */
  branchPhone?: string | null;
  quotedPackage?: boolean;
  /** The package's own terms, from the catalogue row (Rule PKG-1). */
  packageTermsAr?: string | null;
  /** A confirmation block — asserted for DEMO-1(c) and exempt from nothing else. */
  isConfirmation?: boolean;
  /** SPEC-4 §4.2 rail copy: byte-exact, nothing prepended or appended. */
  isRail?: boolean;
}

/** The single exit every patient-visible Faysal message passes through. */
export function compose(text: string, opts: ComposeOpts = {}): string {
  if (opts.isRail) {
    // Digits only. The rail's `997` must survive as `997` and nothing may be
    // appended — SPEC-4 §11.3 asserts the string byte-exact, and §4.2's own note
    // requires the formatter be asserted not to rewrite it into `٩٩٧`.
    return normalizeOutbound(text);
  }
  let out = text;
  out = applyPrice1(out);
  out = applyPackageTerms(out, !!opts.quotedPackage, opts.packageTermsAr);
  // §6.7 — THE CONFIRMATION BLOCK IS ATOMIC. Nothing is appended to it, and FRI-1 was
  // appending the Friday line AFTER «حجز تجريبي — غير مسجّل لدى الفرع»: the screenshot
  // artefact of the whole demo carried an instruction below its own legal label. The
  // Friday warning is not lost — the caller renders it on the pre-visit message, which
  // is the next bubble and the right place for a thing to do before you leave home.
  if (!opts.isConfirmation) out = applyFriday1(out, opts.branchPhone ?? null);
  if (opts.isConfirmation) assertConfirmationDisclosed(out);
  return normalizeOutbound(out);
}
