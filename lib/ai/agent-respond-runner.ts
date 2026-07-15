import { runCustomerTurn } from "@/lib/ai/customer-turn";

export type AgentRespondTurnRunner = typeof runCustomerTurn;

let __testAgentRespondTurn: AgentRespondTurnRunner | undefined;

export function __setTestAgentRespondTurn(runner: AgentRespondTurnRunner | undefined): void {
  __testAgentRespondTurn = runner;
}

export function runAgentRespondTurn(
  ...args: Parameters<AgentRespondTurnRunner>
): ReturnType<AgentRespondTurnRunner> {
  const runner = __testAgentRespondTurn ?? runCustomerTurn;
  return runner(...args);
}
