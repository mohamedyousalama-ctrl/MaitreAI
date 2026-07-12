// ============================================================================
// MaitreAI — WO-COST-1: the system-prompt cache breakpoint (pure; unit-testable).
//
// The customer agent's system prompt is two parts with very different cache lives:
//   • STATIC  — persona + rulebook + menu. Byte-stable across turns of the same
//     tenant + menu-version, so it should be billed at cache-READ rates (~$0.30/M)
//     across a conversation, not re-written every turn.
//   • DYNAMIC — the per-turn directives (perception / cadence / geo / image / media /
//     answer-first). These change turn to turn.
//
// The bug this repairs: the directives were string-appended INTO the system prompt and
// the single cache_control breakpoint sat at the very end — so ANY firing directive made
// the whole ~21.7k-token block byte-different → a full cache WRITE ($3.75/M) every turn.
//
// The fix is a TRANSPORT re-layering, not a prompt change: the STATIC block carries the
// single cache_control breakpoint; the DYNAMIC tail sits AFTER it, uncached. Anthropic
// concatenates system blocks, so the model receives system + systemTail — byte-identical
// instructions to the old single string — while the cached static block stays stable.
// ============================================================================

/** An Anthropic system block. Only the STATIC block carries the cache breakpoint. */
export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

/** Split the system prompt across the cache breakpoint: [static + cache_control] then
 *  an optional [dynamic tail] AFTER it (uncached). When there is no tail this is the
 *  single cached block exactly as before — byte-identical for every non-directive turn. */
export function buildSystemBlocks(system: string, systemTail?: string | null): SystemBlock[] {
  const blocks: SystemBlock[] = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
  if (systemTail) blocks.push({ type: "text", text: systemTail });
  return blocks;
}

/** Join the present per-turn directives into the uncached system tail — each separated
 *  by a blank line, BYTE-IDENTICAL to the previous inline concatenation, just moved
 *  after the cache breakpoint. Returns "" when no directive fires (→ single cached block). */
export function composeSystemTail(directives: Array<string | null | undefined>): string {
  return directives.filter((d): d is string => !!d).map((d) => `\n\n${d}`).join("");
}
