// ============================================================================
// MaitreAI — WO-LIVE-3 §2/§4: media-budget WINDOW logic (PURE, no I/O).
//
// The 6-images/conversation budget is no longer lifetime — it RESETS on EITHER a
// rolling 24h window OR when a new order starts, whichever comes first (Mohamed's
// §2 ruling). Both are computed from EXISTING timestamps (conversations.last_media_at
// + the latest orders.created_at) — no new column, no new state.
//
// Also builds the pre-turn `mediaDirective` (§4): when the budget is spent for this
// window, or the customer explicitly asked for the menu, Karim is told to point to
// the web menu link and NEVER pretend it attached photos — so THIS turn's text is
// truthful about what the media guard will actually do afterwards.
// ============================================================================

/** Rolling budget window: 24 hours. */
export const MEDIA_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Should the media budget be treated as RESET this turn? Pure. Reset iff no media has
 * been sent yet, OR the last media send is ≥ 24h old, OR a new order started after the
 * last media send (its created_at is newer than last_media_at). All ms epoch inputs;
 * null = "unknown / none".
 */
export function isMediaWindowReset(opts: {
  lastMediaAtMs: number | null;
  nowMs: number;
  latestOrderAtMs: number | null;
}): boolean {
  const { lastMediaAtMs, nowMs, latestOrderAtMs } = opts;
  if (lastMediaAtMs == null) return true; // nothing sent yet → fresh window
  if (nowMs - lastMediaAtMs >= MEDIA_WINDOW_MS) return true; // rolling 24h elapsed
  if (latestOrderAtMs != null && latestOrderAtMs > lastMediaAtMs) return true; // new order started
  return false;
}

/**
 * Build the pre-turn media directive (§4) or null when none is needed. Instruction TO
 * the model (appended to the system prompt), so it is written as guidance, not customer
 * text. Returns null when the flag is off / budget healthy / no menu ask → the prompt
 * is unperturbed on a normal turn (flag-off byte-identical).
 */
export function buildMediaDirective(opts: {
  enabled: boolean;
  budgetExhausted: boolean;
  customerAskedForMenu: boolean;
}): string | null {
  if (!opts.enabled) return null;
  if (opts.customerAskedForMenu) {
    return (
      "[وسائط] العميل طلب المنيو/الرابط. سيُرسَل له رابط المنيو الكامل بالصور. " +
      "اعترف بذلك بصراحة (مثل «بعتلك رابط المنيو بالصور من هنا 👆») ولا تدّعِ أنك أرفقت صوراً في هذه الرسالة."
    );
  }
  if (opts.budgetExhausted) {
    return (
      "[وسائط] استُنفد عدد الصور المسموح في هذه المحادثة حالياً. لا تَعِد بصور جديدة، " +
      "ولو أراد العميل رؤية الأصناف وجّهه إلى رابط المنيو الكامل بالصور واذكر ذلك بصراحة — لا تقل إنك أرسلت صوراً."
    );
  }
  return null;
}
