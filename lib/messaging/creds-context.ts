// ============================================================================
// MaitreAI — Per-request WhatsApp credentials context (server-only).
// A request-scoped override for WhatsApp credentials, so the webhook can resolve
// a tenant by its inbound phone_number_id and have the ENTIRE existing send path
// (outbound → adapter → Graph API) reply from THAT tenant's number — without
// threading a credentials object through every function.
//
// readWhatsAppEnv() (lib/messaging/config.ts) consults getWhatsAppCredsOverride()
// first; when no override is set for the current async context (the default, and
// the case for every request today), it returns the env vars EXACTLY as before.
// So the env-var fallback path is byte-for-byte unchanged — the override is purely
// additive and only active inside an explicit runWithWhatsAppCreds(...) scope.
//
// AsyncLocalStorage (Node built-in async_hooks) propagates across await
// boundaries within the same request, so all nested readWhatsAppEnv() calls in
// the persist→Brain→send chain observe the same resolved creds. No new dependency.
// ============================================================================

import "server-only";
import { AsyncLocalStorage } from "async_hooks";
import { _registerWhatsAppCredsOverride, type WhatsAppEnv } from "./config";

const storage = new AsyncLocalStorage<WhatsAppEnv | null>();

/** The active per-request credentials override, or null when none is set. */
export function getWhatsAppCredsOverride(): WhatsAppEnv | null {
  return storage.getStore() ?? null;
}

// Wire this server-only getter into the client-safe config module. Runs once when
// this module is first imported (only ever on the server — see "server-only").
_registerWhatsAppCredsOverride(getWhatsAppCredsOverride);

/**
 * Run `fn` with `creds` as the active WhatsApp credentials override.
 * Pass `null` to explicitly run with NO override (i.e. fall back to env vars) —
 * useful so the caller can wrap unconditionally and let null mean "use env".
 */
export function runWithWhatsAppCreds<T>(creds: WhatsAppEnv | null, fn: () => Promise<T>): Promise<T> {
  return storage.run(creds, fn);
}
