// ============================================================================
// MaitreAI — System modes (Amendment 03 §F)
// The agent's EFFECTIVE operating mode is derived at runtime from the tenant's
// configured agent_mode, Supabase config, open/closed state, and LLM health.
// Status text may only claim a state that is actually true (F3). Full
// derivation lands with the engine wiring; this module owns the type + labels.
// ============================================================================

export type SystemMode =
  | "demo" // no backend wired — local/demo data
  | "setup" // tenant configured but agent not yet enabled
  | "test" // sandbox: agent runs but not on real customer traffic
  | "live" // enabled and serving real customers
  | "paused" // owner paused the agent
  | "closed" // restaurant is closed (hours) — agent informs, doesn't take orders
  | "degraded"; // LLM/provider error — agent degraded

/** Operator-facing Arabic labels (Layer A), per Amendment 03 §F3. */
export const MODE_LABELS_AR: Record<SystemMode, string> = {
  demo: "تجريبي",
  setup: "إعداد",
  test: "اختبار",
  live: "مباشر",
  paused: "متوقف",
  closed: "مغلق",
  degraded: "خلل",
};

/** Whether the agent should generate/auto-send replies in this mode. */
export function modeAllowsAgentReply(mode: SystemMode): boolean {
  return mode === "test" || mode === "live" || mode === "closed";
  // closed: the agent still replies (to state hours / decline orders politely).
}

/** Whether the agent may build/accept orders in this mode. */
export function modeAllowsOrders(mode: SystemMode): boolean {
  return mode === "test" || mode === "live";
}
