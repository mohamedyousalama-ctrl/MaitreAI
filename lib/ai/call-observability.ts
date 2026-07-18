// ============================================================================
// WO-S0-OBS — per-turn model-call observability.
// Shadow caps are measurement only: callers may log/persist this metadata, but
// this module never blocks, shortens, retries, or changes a customer reply.
// ============================================================================

export const SOFT_CALL_CAP = 2;
export const HARD_CALL_CAP = 3;
export const TURN_COST_SOFT_USD = 0.02;

export interface TurnCallObservabilityMeta {
  calls_used: number;
  cap_shadow: {
    soft_call_cap: number;
    hard_call_cap: number;
    turn_cost_soft_usd: number;
    soft_call_violation: boolean;
    hard_call_violation: boolean;
    cost_soft_violation: boolean;
  };
}

export function buildTurnCallObservabilityMeta(callsUsed: number, cost: number): TurnCallObservabilityMeta {
  return {
    calls_used: callsUsed,
    cap_shadow: {
      soft_call_cap: SOFT_CALL_CAP,
      hard_call_cap: HARD_CALL_CAP,
      turn_cost_soft_usd: TURN_COST_SOFT_USD,
      soft_call_violation: callsUsed > SOFT_CALL_CAP,
      hard_call_violation: callsUsed > HARD_CALL_CAP,
      cost_soft_violation: cost > TURN_COST_SOFT_USD,
    },
  };
}

export function hasCapShadowViolation(meta: TurnCallObservabilityMeta): boolean {
  return (
    meta.cap_shadow.soft_call_violation ||
    meta.cap_shadow.hard_call_violation ||
    meta.cap_shadow.cost_soft_violation
  );
}

export function logCapShadowViolation(args: {
  tenant: string;
  conversation: string | null;
  calls_used: number;
  cost: number;
  meta: TurnCallObservabilityMeta;
}): void {
  console.warn("cap_shadow_violation", {
    tenant: args.tenant,
    conversation: args.conversation,
    calls_used: args.calls_used,
    cost: args.cost,
    cap_shadow: args.meta.cap_shadow,
  });
}
