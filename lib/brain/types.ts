export type UUID = string;
export type ISODateTime = string;
export type IntegerMinorUnits = number & { readonly __brand: "IntegerMinorUnits" };

type BrandedText<Name extends string> = string & { readonly __brand: Name };

export type TrustedMoneyText = BrandedText<"TrustedMoneyText">;
export type TrustedCatalogName = BrandedText<"TrustedCatalogName">;
export type TrustedDeliveryText = BrandedText<"TrustedDeliveryText">;
export type CanonicalSafetyText = BrandedText<"CanonicalSafetyText">;
export type ValidatedCustomerEcho = BrandedText<"ValidatedCustomerEcho">;
export type OptionalSocialPhrase = BrandedText<"OptionalSocialPhrase">;
export type InternalDiagnostic = BrandedText<"InternalDiagnostic">;

export type BrainActor = "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
export type BrainOwner = "AI" | "HUMAN";

export type UntrustedActSource =
  | "llm"
  | "asr"
  | "button"
  | "webhook"
  | "staff";

export interface UntrustedUserAct {
  readonly source: UntrustedActSource;
  readonly raw: unknown;
  readonly observedText?: string;
  readonly confidenceBasisPoints?: number;
  readonly evidenceRefs: readonly string[];
}

export type ValidatedOperation =
  | {
      readonly kind: "ADD_ITEM";
      readonly itemId: UUID;
      readonly catalogName: TrustedCatalogName;
      readonly quantity: number;
      readonly modifierIds?: readonly UUID[];
    }
  | {
      readonly kind: "REMOVE_ITEM";
      readonly lineId?: UUID;
      readonly itemId?: UUID;
      readonly quantity?: number;
    }
  | {
      readonly kind: "REPLACE_ITEM";
      readonly fromLineId: UUID;
      readonly toItemId: UUID;
      readonly catalogName: TrustedCatalogName;
      readonly quantity: number;
    }
  | {
      readonly kind: "SET_QUANTITY";
      readonly lineId: UUID;
      readonly quantity: number;
    }
  | {
      readonly kind: "SET_FULFILLMENT";
      readonly fulfillment: "delivery" | "pickup";
    }
  | {
      readonly kind: "SET_ADDRESS";
      readonly address: ValidatedCustomerEcho;
      readonly deliveryText?: TrustedDeliveryText;
    }
  | {
      readonly kind: "DISCLOSE_SAFETY";
      readonly canonicalText: CanonicalSafetyText;
      readonly terms: readonly string[];
      readonly requiresKitchenNote: boolean;
    }
  | {
      readonly kind: "CONFIRM_QUOTE";
      readonly quoteId: UUID;
      readonly totalMinorUnits: IntegerMinorUnits;
    }
  | {
      readonly kind: "REQUEST_HUMAN";
      readonly reason: ValidatedCustomerEcho | CanonicalSafetyText;
    }
  | {
      readonly kind: "NO_OP";
      readonly reason: "duplicate" | "stale_token" | "out_of_scope" | "smalltalk";
    };

export interface ValidatedUserActBatch {
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly episodeId?: UUID;
  readonly sourceTurnId: UUID;
  readonly operations: readonly ValidatedOperation[];
  readonly safetyState: "none" | "possible" | "disclosed" | "blocked" | "human_required";
  readonly diagnostics?: readonly InternalDiagnostic[];
}

export type ResponsePlanType =
  | "ask_clarification"
  | "quote_summary"
  | "safety_clarification"
  | "human_handoff"
  | "reject_unsafe_claim"
  | "confirm_commit"
  | "no_reply_duplicate"
  | "informational_answer";

export interface DecisionProposal {
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly episodeId: UUID;
  readonly episodeRevision: number;
  readonly responsePlanType: ResponsePlanType;
  readonly cartDelta?: unknown;
  readonly nextRequiredField?: string;
  readonly quoteId?: UUID;
  readonly requiresCommit: boolean;
  readonly requiresHumanHandoff: boolean;
  readonly outboxIdempotencyKey?: string;
  readonly diagnostics?: readonly InternalDiagnostic[];
}

export interface CommittedTurn {
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly episodeId: UUID;
  readonly turnEventId: UUID;
  readonly episodeRevisionBefore: number;
  readonly episodeRevisionAfter: number;
  readonly committedAt: ISODateTime;
  readonly quoteId?: UUID;
  readonly orderId?: UUID;
  readonly outboxMessageId?: UUID;
  readonly safetyDisclosureIds: readonly UUID[];
}

export type CustomerResponseText =
  | TrustedMoneyText
  | TrustedCatalogName
  | TrustedDeliveryText
  | CanonicalSafetyText
  | ValidatedCustomerEcho
  | OptionalSocialPhrase;

export interface CustomerResponse {
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly episodeId?: UUID;
  readonly planType: ResponsePlanType;
  readonly blocks: readonly CustomerResponseText[];
  readonly locale: "ar-SA" | "ar-EG" | "en";
}
