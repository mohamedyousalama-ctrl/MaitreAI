# KIVO-WA-COLLAB-001 — WhatsApp Order Collaboration Workspace

**Founder direction:** proceed on an isolated branch; obtain PM/founder approval before merge.  
**Repository base:** `8b734f145fc8b7b165139e2d8d8d8708adb1df93`  
**Branch:** `feat/kivo-wa-collab-01`  
**Pilot status:** **NO-GO remains unchanged.**  
**First coding slice:** isolated, read-only Conversation Desktop prototype.

## Product contract

Kivo's first sellable job is:

> Enable one restaurant operator and Karim to manage many restaurant orders received through WhatsApp, from the first customer message through explicit customer confirmation and restaurant acceptance, with less human attention and no loss of restaurant authority over material decisions.

The product does not optimize for maximum autonomous replies. It optimizes for:

> **Correctly accepted WhatsApp orders per operator-attention hour.**

## First-version boundary

### In scope

1. WhatsApp customer conversation.
2. Grounded menu and availability answers.
3. Typed order creation and modification.
4. Fulfilment, address and V1 cash/COD collection.
5. Server-priced summary.
6. Explicit confirmation of the current order version.
7. Restaurant acceptance or rejection.
8. Human claim, visible ownership and explicit return to Karim after the existing control plane is repaired.
9. Evidence and honest failure states.

### Not added by this workstream

- card payments;
- voice ordering;
- autonomous safety answers;
- discounts or compensation;
- unrestricted marketing broadcasts;
- new kitchen, driver or delivery mutations;
- production activation;
- any bypass of `P0-CTRL-01`, `P0-ORD-01`, `P0-WA-01`, E0/E1 or R1.

## Interaction contract

### Conversations are the interface

The main workspace displays three large live conversation interfaces per row on desktop. Each shows recent messages, current leader, order truth, blocker, next responsible actor and the conversation-to-acceptance flow.

### One outward voice

Karim and staff may coordinate internally, but only one customer-visible writer is authorized at the send boundary.

### One intention, many contextual plans

An operator may select one or many conversations and choose an intention such as greeting, send relevant menu, request missing address, request payment choice, send current summary, request confirmation, explain an unavailable item, offer published alternatives, send a truthful status update, join as human, return explicitly to Karim, or close with a reason.

Kivo prepares a separate plan per conversation and partitions the result into:

- `READY`;
- `REVIEW_REQUIRED`;
- `EXCLUDED`.

No first-slice bulk action sends a customer message.

## COLLAB-01 — implementation authorization boundary

Create an isolated route at `/c/conversation-desktop`.

The route may:

- read current conversation and order stores;
- render deterministic demo data when the console is in demo mode;
- display three large conversation interfaces per row;
- maintain independent message scrolling;
- select one or many conversations without opening them;
- reveal a hidden glass Intent Action Dock;
- show preview-only contextual bulk results;
- open one conversation in an in-window Conversation Studio;
- preserve filters, selection and page position when Studio closes;
- show truthful capability states.

The route must not:

- send WhatsApp messages;
- mutate ownership;
- accept or reject orders;
- mutate orders;
- create database rows;
- add migrations;
- change feature flags;
- replace the existing Shift or Conversations page;
- claim that unsupported actions are protected or executable.

## Technical rules

1. Reuse `useConversationStore` and `useOrderStore` for read-only state.
2. Money is displayed from existing server/store values; no committed total is recomputed in the UI.
3. Safety red `#B4232C` is reserved for active safety holds only.
4. Operational delay uses amber.
5. Selection is local UI state only.
6. All action items in COLLAB-01 are `PREVIEW_ONLY`.
7. The prototype remains accessible by direct route and is not added to production navigation.
8. The new surface overlays the current console shell and provides its own auto-hidden navigation affordance without changing `AppFrame`.
9. Arabic/RTL, keyboard navigation, visible focus and reduced motion are required.
10. The existing remediation sequence and pilot gates remain authoritative.

## Performance targets

- 60 conversation interfaces: initial meaningful render p95 target <= 2.5 seconds on pilot hardware.
- selection feedback target <= 100 ms.
- Studio opening with resident data target <= 300 ms.
- latest 4–7 messages only in each desktop interface.
- full transcript rendered only in Studio.
- no unbounded transcript loading.
- no repeated main-thread task over 50 ms during ordinary scrolling.

Targets are acceptance criteria to measure, not current proof.

## Proof required before merge

- build, TypeScript and lint pass;
- responsive 3/2/1-column behaviour;
- selection does not open a conversation;
- opening a conversation performs no route navigation;
- hidden dock opens only by deliberate action or current selection;
- preview partitions ready/review/excluded correctly;
- safety-held conversations are never marked bulk-ready for customer action;
- no production write path is imported or invoked;
- RTL, keyboard and reduced-motion review;
- independent audit of the diff;
- authoritative roadmap updated in the same Git change before merge.

## Later stages — not authorized by this file

- `COLLAB-02`: server-owned Conversation Desktop read model and capability adapter.
- `COLLAB-03`: Conversation Studio wired to already-audited single-conversation actions.
- `COLLAB-04`: server-side Bulk Intent preview.
- `COLLAB-05`: low-risk contextual bulk execution with idempotent outbox receipts.
- `COLLAB-06`: scoped human participation after the revised control plane is proven.
- `COLLAB-07`: paid-pilot performance and contribution-margin proof.

Each later stage requires a separate work order and approval.
