// ============================================================================
// Kivo — THE DEMO CLOSE. SERVER ONLY.
//
// A sales agent that cannot close is not a sales agent. Before this, a visitor
// could build a basket, confirm it, choose delivery, give an address and tap pay —
// and be asked «أجهّز لك الطلب؟» six consecutive times, with no order number, ever.
//
// This is the last step of that flow: once the Brain has finalized the draft, write
// a REAL order row with a REAL order number, allocated by the same atomic
// `next_order_number` RPC (migration 0113) every tenant uses, and tell the visitor
// the number.
//
// WHY THE NUMBER IS APPENDED HERE AND NOT SPOKEN BY THE MODEL
// -----------------------------------------------------------
// The number does not exist until the row is written, which happens AFTER the turn.
// A model asked to "say the order number" therefore has nothing true to say and
// would invent one — which is precisely the class of failure the rest of this
// codebase spends its guards on. So the number is composed deterministically from
// what the database actually allocated, and appended to the reply. If the persist
// FAILS, the appended line says so instead: the model may already have said it
// registered the order, and an unretracted false confirmation is worse than an error.
//
// WHY THE DEMO STILL TAKES NO MONEY
// ----------------------------------
// The demo tenant has no `psp_payments` and must not get it. A fake payment screen
// on a public page is a lie about money, and a real one is real money from a
// stranger who is browsing. The honest end state is the one below: a real order
// number, and a sentence saying plainly that nothing was charged and nobody is
// cooking. That is a better demo than a fake receipt, because it is true.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderDraft } from "@/lib/ai/tools";
import { persistOrderFromDraft } from "@/lib/db/orders-create";
import { toArabicDigits } from "@/lib/util/arabic-digits";
import { DEMO_RESTAURANT_ID } from "./config";

/** What the visitor is told once the order really exists. Pure.
 *
 *  Saudi, because the demo tenant is `khalid_region: najd` and speaks Saudi. Built by
 *  concatenation rather than a template literal so the order number cannot be reordered
 *  into the Arabic run under RTL (the same reason `local-rules/no-arabic-name-number-
 *  interpolation` exists). */
export function demoOrderConfirmation(orderNumber: string): string {
  return (
    "✅ سجّلت طلبك التجريبي برقم #" +
    toArabicDigits(orderNumber) +
    "\nهذي تجربة — ما تم سحب أي مبلغ، وما راح يجهّز المطعم شي. " +
    "في الاستخدام الحقيقي يوصل الطلب للمطبخ على طول ويجيك تأكيد."
  );
}

/** What the visitor is told when the order could NOT be written. Pure.
 *
 *  This exists because the model has usually already said the order was registered by
 *  the time we get here. Staying silent would leave that claim standing. */
export function demoOrderFailure(): string {
  return "⚠️ ما قدرت أسجّل رقم للطلب الحين 🙏 هذي تجربة — جرّب مرة ثانية بعد شوي.";
}

export interface DemoOrderOutcome {
  /** The reply to send, with the honest closing line appended when one is due. */
  reply: string;
  /** The allocated order number, or null when no order was written this turn. */
  orderNumber: string | null;
}

/**
 * Close the demo order, if this turn finalized one.
 *
 * A no-op — returning the reply untouched — whenever there is no session, the draft
 * is not finalized, or the basket is empty. It NEVER throws: a demo turn that already
 * produced a good reply must not become a 502 because an order row failed to write.
 *
 * `demo: true` is what stamps `source`/`is_test` and suppresses the
 * `payment_unspecified` critical alert inside persistOrderFromDraft — see the option's
 * documentation there.
 */
export async function closeDemoOrder(
  admin: SupabaseClient,
  args: {
    conversationId: string | null;
    draft: OrderDraft;
    agentRunId: string | null;
    reply: string;
  }
): Promise<DemoOrderOutcome> {
  const { conversationId, draft, reply } = args;
  if (!conversationId || draft.finalized !== true || !draft.lines.length) {
    return { reply, orderNumber: null };
  }

  try {
    const persisted = await persistOrderFromDraft(admin, {
      restaurantId: DEMO_RESTAURANT_ID, // pinned; a demo order is never another tenant's
      conversationId,
      customerId: null,
      draft,
      agentRunId: args.agentRunId,
      demo: true,
    });
    // `created: false` with a number is the idempotent path (a double-tap, or the same
    // basket re-confirmed inside the 120s window). The order is real either way, so the
    // visitor still gets the true number rather than a second, different one.
    if (!persisted.orderNumber) return { reply: joinLine(reply, demoOrderFailure()), orderNumber: null };
    return {
      reply: joinLine(reply, demoOrderConfirmation(persisted.orderNumber)),
      orderNumber: persisted.orderNumber,
    };
  } catch (e) {
    console.error("[demo] order persist failed", e);
    return { reply: joinLine(reply, demoOrderFailure()), orderNumber: null };
  }
}

/** Append a line, without duplicating it and without leaving a leading newline. */
function joinLine(reply: string, line: string): string {
  const base = String(reply ?? "").trim();
  if (!base) return line;
  return base.includes(line) ? base : base + "\n\n" + line;
}
