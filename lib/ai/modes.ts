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

/** Inputs for deriving the effective mode at runtime (§F). */
export interface ModeInputs {
  supabaseConfigured: boolean;
  agentMode: string; // stored intent: setup | test | live | paused
  isOpen: boolean;
  llmHealthy: boolean;
}

/**
 * Effective mode = the owner's configured intent combined with reality.
 * Precedence: no backend → demo; owner paused → paused; not enabled → setup;
 * provider down → degraded; closed by hours → closed; else test/live.
 * Status text must only ever claim a state that is actually true (F3).
 */
export function deriveSystemMode(i: ModeInputs): SystemMode {
  if (!i.supabaseConfigured) return "demo";
  if (i.agentMode === "paused") return "paused";
  if (i.agentMode === "setup") return "setup";
  if (!i.llmHealthy) return "degraded";
  if (!i.isOpen) return "closed";
  if (i.agentMode === "test") return "test";
  if (i.agentMode === "live") return "live";
  return "setup";
}
