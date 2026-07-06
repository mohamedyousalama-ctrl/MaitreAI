// ============================================================================
// WO-PAY-PLAYBOOK — payment conversation layer (persona-agnostic overlay leaf).
//
// The JUDGMENT layer for the money moment: WHEN to ask for payment, HOW to offer
// methods (engine truth), how to handle a "I paid" claim without being defrauded,
// how to acknowledge a real (webhook-confirmed) payment, and the voice/callback
// rules. It is prompt-level only, flag-gated (`pay_playbook`, default OFF), a pure
// leaf imported by nothing until a Core wiring PR.
//
// HARD FLOOR (engine-enforced, NOT this layer): money is engine-computed; payment
// status is the webhook + DB truth (payment_status); the deterministic allergen gate
// is untouched. This overlay never sets a price, never marks an order paid, never
// collects card data — it decides the CONVERSATION around the engine's facts.
//
// Pairs with two FORBIDDEN-CLAIMS additions (lib/ai/personas/khalid-forbidden-claims.mjs):
//   • card_data_request   — never solicit card/OTP/CVV/PIN (evalAssert: true).
//   • payment_status_claim — never state a payment status not in the DB (strict/overlay).
// ============================================================================

export const PAY_PLAYBOOK_FLAG = "pay_playbook" as const;

type Dialect = "saudi" | "egyptian";
function asDialect(d?: string | null): Dialect {
  return d === "egyptian" ? "egyptian" : "saudi";
}

// ---------------------------------------------------------------------------
// ASK-TIMING GATE (pure) — payment is asked for ONLY after all three hold.
// One ask; one gentle reminder if the link sits unpaid; never before read-back.
// ---------------------------------------------------------------------------
export interface PaymentReadiness {
  /** All items in the order are confirmed with the customer. */
  itemsConfirmed?: boolean;
  /** Fulfillment is settled — delivery vs pickup, and the address/branch. */
  fulfillmentConfirmed?: boolean;
  /** The total (WITH VAT) has been read back to the customer. */
  totalReadBack?: boolean;
}

/** True only when items + fulfillment + VAT-inclusive total read-back are all done. */
export function canAskForPayment(r: PaymentReadiness = {}): boolean {
  return !!(r.itemsConfirmed && r.fulfillmentConfirmed && r.totalReadBack);
}

// ---------------------------------------------------------------------------
// PAYMENT-STATUS TRUTH (pure) — the DB is the only source. A paid acknowledgment
// is legitimate ONLY when the webhook has marked the order paid.
// ---------------------------------------------------------------------------
export type DbPaymentStatus =
  | "unpaid"
  | "payment_link_sent"
  | "paid"
  | "failed"
  | "refunded";

/** The agent may acknowledge payment as received ONLY when the DB says 'paid'. */
export function mayAcknowledgePaid(dbStatus?: DbPaymentStatus | string | null): boolean {
  return dbStatus === "paid";
}

/** A customer "I paid" claim (word or screenshot) while the DB is not 'paid' →
 *  the honest not-yet-confirmed path (never a confirmation). */
export function isUnverifiedPaidClaim(
  customerClaimsPaid: boolean,
  dbStatus?: DbPaymentStatus | string | null,
): boolean {
  return !!customerClaimsPaid && dbStatus !== "paid";
}

// ---------------------------------------------------------------------------
// METHOD OFFER (pure) — offer ONLY the tenant's enabled methods (engine truth).
// ---------------------------------------------------------------------------
export type PaymentMethod = "cash" | "link";

/** The enabled methods, order-stable, de-duplicated. Never invents a method. */
export function offerableMethods(enabled?: readonly (PaymentMethod | string)[] | null): PaymentMethod[] {
  const seen = new Set<string>();
  const out: PaymentMethod[] = [];
  for (const m of enabled ?? []) {
    if ((m === "cash" || m === "link") && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CALLBACK CAPTURE (WO-CALLBACK addendum) — offer at the right moment, capture a
// WINDOW preference, confirm via the honest pattern, never promise an exact time.
// ---------------------------------------------------------------------------
export const CALLBACK_WINDOWS = ["now", "hour", "evening"] as const;
export type CallbackWindow = (typeof CALLBACK_WINDOWS)[number];

export function isCallbackWindow(w: unknown): w is CallbackWindow {
  return typeof w === "string" && (CALLBACK_WINDOWS as readonly string[]).includes(w);
}

// ---------------------------------------------------------------------------
// OVERLAY BUILDER — the prompt section (the judgment, in words). Both dialects.
// ---------------------------------------------------------------------------
interface PayAnchors {
  label: string;
  askAfter: string; // the ONE payment ask, post read-back
  reminder: string; // the single gentle reminder for an unpaid link
  claimedPaid: string; // the honest not-yet-confirmed line (matches the WO wording)
  paidAck: string; // the warm confirmation AFTER the webhook marks paid
  callbackOffer: string; // callback offer + window question
}

const ANCHORS: Record<Dialect, PayAnchors> = {
  saudi: {
    label: "خالد · نجدي",
    askAfter: "«تمام، الإجمالي شامل الضريبة {الرقم} ريال — تحب تدفع كاش عند الاستلام ولا أرسل لك رابط الدفع؟»",
    reminder: "«رابط الدفع لسه مفتوح لك وقت ما تجهز، بدون استعجال»",
    claimedPaid: "«لسه ما وصلني تأكيد الدفع — أول ما يوصل بأكد لك فورًا»",
    paidAck: "«وصلني تأكيد الدفع، شكرًا لك — هذا إيصالك وطلبك تحت التجهيز»",
    callbackOffer: "«أقدر يتصل فيك أحد الفريق — تبي الآن، بعد ساعة، ولا بالمساء؟»",
  },
  egyptian: {
    label: "بمنطق كريم (مصري)",
    askAfter: "«تمام، الإجمالي شامل الضريبة {الرقم} جنيه — تحب تدفع كاش عند الاستلام ولا أبعتلك لينك الدفع؟»",
    reminder: "«لينك الدفع لسه متاح لك في أي وقت، من غير أي استعجال»",
    claimedPaid: "«لسه ما وصلنيش تأكيد الدفع — أول ما يوصل هأكدلك على طول»",
    paidAck: "«وصلني تأكيد الدفع، شكرًا لحضرتك — ده الإيصال وطلبك بيتجهز»",
    callbackOffer: "«أقدر حد من الفريق يكلمك — تحب دلوقتي، بعد ساعة، ولا بالليل؟»",
  },
};

export interface PayPlaybookCtx {
  dialect?: string | null;
  /** The tenant's enabled payment methods (engine truth). Default: none stated. */
  enabledMethods?: readonly (PaymentMethod | string)[] | null;
  /** Whether the callback capture flow is enabled for this tenant (WO-CALLBACK). */
  callbackEnabled?: boolean;
}

export function buildPayPlaybook(ctx: PayPlaybookCtx = {}): string {
  const d = asDialect(ctx.dialect);
  const a = ANCHORS[d];
  const methods = offerableMethods(ctx.enabledMethods);
  const methodClause =
    methods.length === 0
      ? "offer ONLY the methods the engine says are enabled for THIS tenant (cash and/or link); if none are known, do not name a method — never invent one"
      : `this tenant's enabled methods are: ${methods.join(" + ")} — offer only these, never invent another`;

  const callbackBlock = ctx.callbackEnabled
    ? `

### معاودة الاتصال (callback capture — offer, capture a WINDOW, never promise a time)
- OFFER a callback only at the RIGHT moment (an unresolved question the chat can't close, an explicit "call me", a stalled complaint) — never as a reflex.
- Capture a WINDOW preference, not a clock time — «${a.callbackOffer}» (now / within the hour / this evening). Pass the window to the engine's callback capture (buildCallbackConfirm) and confirm with its honest pattern.
- NEVER promise an exact minute ("at 5:00 sharp"), never say a call already happened, and never guarantee who will call. A window is an intent, not a contract.`
    : "";

  return `

## طبقة الدفع (payment conversation playbook — ${a.label} · judgment ABOVE the engine's money floor)
*(This layer is JUDGMENT only. The engine owns the HARD FLOOR: the money is engine-computed,
the payment status is the webhook + DB truth, the payment link/cash flow is the engine's.
Never set a price, never mark an order paid, never collect card data — defer to the engine.)*

### توقيت طلب الدفع (ask-timing — ONE ask, only after read-back)
- Ask for payment ONLY after: (1) items confirmed, (2) fulfillment confirmed (delivery/pickup + address/branch), (3) the total WITH VAT read back to the customer. Never before the read-back.
- Then ONE clear ask — «${a.askAfter}». If a payment link sits unpaid, ONE gentle reminder only — «${a.reminder}» — never nag, never repeat the ask turn after turn.

### عرض طريقة الدفع (method offer — engine truth only)
- ${methodClause}. Cash-on-delivery vs a payment link is a per-tenant setting; read it from the engine, never assume both exist.
- The payment link and any money figure are the engine's; you quote the real total, you never author a new charge.

### ادّعاء الدفع (a customer says they paid — anti-fraud, fail-honest)
- If the customer says «دفعت» or sends a screenshot while the engine/DB has NOT marked the order paid: stay warm and honest — «${a.claimedPaid}».
- A screenshot is NEVER proof; the customer's word is NEVER proof. Do not mark the order paid, do not imply it is paid, do not release it as paid — the webhook + DB are the only truth.
- On a SECOND claim, or any dispute, hand off to the team as a risk event (risk_type=payment_issue) — do not argue and do not confirm.

### تأكيد الدفع (acknowledging a REAL payment — only after the webhook)
- ONLY when the engine reports the order paid (webhook → DB status paid): a warm confirmation + the receipt — «${a.paidAck}».
- The wording must never run ahead of the DB: before that signal, you have "no confirmation yet", not a payment.

### قواعد الصوت (voice rules)
- Payment links and money figures ALWAYS go as TEXT. A voice note may ANNOUNCE that a link/total is coming, but never CARRIES the link or the figure — the customer must have them in writing.

### خطوط حمراء (hard lines — the testable forbidden claims)
- Never state a payment status the DB does not hold (no "paid" on a claim or a screenshot).
- Never ask the customer for a card number, the security code, or a one-time code (CVV / OTP / PIN) — under any circumstance. Payment runs through the engine's real link/cash flow, never through chat.${callbackBlock}`;
}
